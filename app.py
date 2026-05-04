import os
import sys
import json
import time
import requests
from flask import Flask, render_template, request, jsonify

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(__file__)

app = Flask(__name__)
NOVELS_DIR = os.path.join(BASE_DIR, "novels")
NOVELS_INDEX = os.path.join(NOVELS_DIR, "_index.json")
os.makedirs(NOVELS_DIR, exist_ok=True)


def rebuild_index():
    """Rebuild novel cache index from all novel files."""
    index = {}
    for fn in os.listdir(NOVELS_DIR):
        if fn.endswith(".json") and fn != "_index.json":
            path = os.path.join(NOVELS_DIR, fn)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                index[fn] = {
                    "title": data.get("title", fn.replace(".json", "")),
                    "chapters": len(data.get("chapters", [])),
                    "updated": os.path.getmtime(path),
                }
            except (json.JSONDecodeError, OSError):
                pass
    with open(NOVELS_INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)
    return index


def _update_index_entry(fn, title, chapters, mtime):
    """Add or update a single entry in the cache index."""
    index = {}
    if os.path.exists(NOVELS_INDEX):
        with open(NOVELS_INDEX, "r", encoding="utf-8") as f:
            index = json.load(f)
    index[fn] = {"title": title, "chapters": chapters, "updated": mtime}
    with open(NOVELS_INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)


def _remove_index_entry(fn):
    """Remove a single entry from the cache index."""
    if os.path.exists(NOVELS_INDEX):
        with open(NOVELS_INDEX, "r", encoding="utf-8") as f:
            index = json.load(f)
        index.pop(fn, None)
        with open(NOVELS_INDEX, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False)

AI_PROVIDERS = {
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-chat",
        "api_type": "openai",
    },
    "openai": {
        "base_url": "https://api.openai.com",
        "default_model": "gpt-4o",
        "api_type": "openai",
    },
    "freeai": {
        "base_url": "https://api.freetheai.xyz",
        "default_model": "or/openai/gpt-oss-20b:free",
        "api_type": "openai",
    },
    "claude": {
        "base_url": "https://api.anthropic.com",
        "default_model": "claude-sonnet-4-20250514",
        "api_type": "anthropic",
    },
}


def novel_path(title):
    safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in title).strip()
    return os.path.join(NOVELS_DIR, f"{safe or 'untitled'}.json")


def load_novel(title):
    path = novel_path(title)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def save_novel(data):
    path = novel_path(data.get("title", "untitled"))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    fn = os.path.basename(path)
    _update_index_entry(
        fn,
        title=data.get("title", fn.replace(".json", "")),
        chapters=len(data.get("chapters", [])),
        mtime=os.path.getmtime(path),
    )
    return path


# ---- Routes ----

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/novels", methods=["GET"])
def list_novels():
    if os.path.exists(NOVELS_INDEX):
        with open(NOVELS_INDEX, "r", encoding="utf-8") as f:
            index = json.load(f)
    else:
        index = rebuild_index()
    novels = sorted(index.values(), key=lambda n: n["updated"], reverse=True)
    return jsonify(novels)


@app.route("/api/novel/<path:title>", methods=["GET"])
def get_novel(title):
    data = load_novel(title)
    if data is None:
        return jsonify({"error": "Novel not found"}), 404
    return jsonify(data)


@app.route("/api/novel/save", methods=["POST"])
def save_novel_route():
    data = request.get_json()
    if not data or "title" not in data:
        return jsonify({"error": "Title required"}), 400
    save_novel(data)
    return jsonify({"status": "ok"})


@app.route("/api/novel/delete/<path:title>", methods=["DELETE"])
def delete_novel(title):
    path = novel_path(title)
    if os.path.exists(path):
        os.remove(path)
        _remove_index_entry(os.path.basename(path))
        return jsonify({"status": "ok"})
    return jsonify({"error": "Not found"}), 404


# ---- AI Providers ----

SYSTEM_PROMPTS = {
    "continue": "你是资深小说家。根据上文内容，自然地续写接下来的段落，保持风格一致。只返回续写内容，不要任何解释。",
    "expand": "你是资深小说家。将用户选中的段落扩写得更丰富，增加细节描写、对话或心理活动。只返回扩写后的内容。",
    "rewrite": "你是资深小说家。根据用户的要求改写指定段落。只返回改写后的内容。",
    "free": "你是资深小说家。根据用户的指令进行创作。只返回创作内容。",
    "brainstorm": "你是资深小说创意顾问。帮助用户头脑风暴故事情节、人物设定、世界观等。提供有创意的建议和多个可能性。",
    "outline": "你是资深小说规划师。帮助用户规划故事结构、章节大纲、情节走向。提供清晰有条理的建议。",
}


def build_system_prompt(mode, characters=None, outline=None, chapters_overview=None):
    """Dynamically compose a system prompt with character, outline, and chapter context."""
    base = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["free"])
    parts = [base]

    if characters and len(characters) > 0:
        char_lines = []
        for c in characters:
            name = c.get("name", " unnamed")
            role = c.get("role", "")
            desc = c.get("description", "")
            bg = c.get("background", "")
            line = f"- {name}"
            if role:
                line += f"（{role}）"
            if desc:
                line += f": {desc}"
            if bg:
                line += f"。背景: {bg}"
            char_lines.append(line)
        parts.append("\n\n【角色设定】\n" + "\n".join(char_lines))

    if outline:
        parts.append(f"\n\n【故事大纲】\n{outline}")

    if chapters_overview and len(chapters_overview) > 0:
        overview_lines = []
        for ch in chapters_overview:
            summary = ch.get("summary") or ch.get("content", "")[:100]
            overview_lines.append(f"- {ch.get('title', '')}: {summary}")
        parts.append("\n\n【已有章节概要】\n" + "\n".join(overview_lines))

    return "\n\n---\n\n".join(parts)


def get_provider_config(provider):
    """Get provider config, falling back to deepseek."""
    p = AI_PROVIDERS.get(provider)
    if not p:
        return AI_PROVIDERS["deepseek"], "deepseek"
    return p, provider


def estimate_tokens(text):
    """Rough token estimate: ~1 token per Chinese char, ~1 token per 4 English chars."""
    if not text:
        return 0
    chinese = sum(1 for c in text if '一' <= c <= '鿿')
    english = len(text) - chinese
    return int(chinese * 1.5 + english / 4) + 5  # +5 as buffer


def ai_estimate_context_tokens(messages, system_prompt):
    """Estimate total tokens for an AI request."""
    total = estimate_tokens(system_prompt or "")
    for m in messages:
        total += estimate_tokens(m.get("content", ""))
        total += 4  # role overhead
    return total


def stream_openai_compat(payload, headers, base_url):
    """Stream from an OpenAI-compatible API (DeepSeek, OpenAI, etc.)."""
    try:
        resp = requests.post(
            f"{base_url}/v1/chat/completions",
            headers=headers,
            json=payload,
            stream=True,
            timeout=120,
        )
        if resp.status_code != 200:
            error_detail = resp.text
            try:
                error_json = resp.json()
                error_detail = error_json.get("error", {}).get("message", resp.text)
            except Exception:
                pass
            yield f"data: {json.dumps({'error': f'API错误 ({resp.status_code}): {error_detail}'})}\n\n"
            return

        for line in resp.iter_lines():
            if line:
                decoded = line.decode("utf-8")
                if decoded.startswith("data: "):
                    d = decoded[6:]
                    if d.strip() == "[DONE]":
                        break
                    try:
                        obj = json.loads(d)
                        delta = obj.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield f"data: {json.dumps({'content': content})}\n\n"
                    except json.JSONDecodeError:
                        continue
    except requests.exceptions.Timeout:
        yield f"data: {json.dumps({'error': '请求超时，请检查网络连接'})}\n\n"
    except requests.exceptions.ConnectionError:
        yield f"data: {json.dumps({'error': '无法连接到 API，请检查网络'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': f'发生错误: {str(e)}'})}\n\n"


def stream_claude(payload, api_key):
    """Stream from Anthropic Claude API."""
    try:
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=payload,
            stream=True,
            timeout=120,
        )
        if resp.status_code != 200:
            error_detail = resp.text
            try:
                error_json = resp.json()
                error_detail = error_json.get("error", {}).get("message", resp.text)
            except Exception:
                pass
            yield f"data: {json.dumps({'error': f'API错误 ({resp.status_code}): {error_detail}'})}\n\n"
            return

        for line in resp.iter_lines():
            if line:
                decoded = line.decode("utf-8")
                if decoded.startswith("data: "):
                    d = decoded[6:]
                    try:
                        obj = json.loads(d)
                        evt_type = obj.get("type", "")
                        if evt_type == "content_block_delta":
                            delta = obj.get("delta", {})
                            text = delta.get("text", "")
                            if text:
                                yield f"data: {json.dumps({'content': text})}\n\n"
                        elif evt_type == "message_stop":
                            break
                    except json.JSONDecodeError:
                        continue
                elif decoded.startswith("event: "):
                    continue  # event type lines carry no data
    except requests.exceptions.Timeout:
        yield f"data: {json.dumps({'error': '请求超时，请检查网络连接'})}\n\n"
    except requests.exceptions.ConnectionError:
        yield f"data: {json.dumps({'error': '无法连接到 Anthropic API，请检查网络'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': f'发生错误: {str(e)}'})}\n\n"


@app.route("/api/ai/write", methods=["POST"])
def ai_write():
    req = request.get_json()
    api_key = req.get("api_key", "")
    mode = req.get("mode", "free")
    prompt = req.get("prompt", "")
    context = req.get("context", "")
    provider_name = req.get("provider", "deepseek")
    model = req.get("model", "")
    characters = req.get("characters", [])
    outline = req.get("outline", "")
    chapters_overview = req.get("all_chapters_overview", [])
    temperature = req.get("temperature", 0.85)
    max_tokens = req.get("max_tokens", 4096)

    if not api_key:
        return jsonify({"error": "请先配置 API Key"}), 400
    if not prompt:
        return jsonify({"error": "请输入提示内容"}), 400

    provider_cfg, provider_name = get_provider_config(provider_name)
    base_url = provider_cfg["base_url"]
    model = model or provider_cfg["default_model"]
    api_type = provider_cfg["api_type"]

    system_prompt = build_system_prompt(mode, characters, outline, chapters_overview)
    messages = [{"role": "system", "content": system_prompt}]
    if context:
        messages.append({"role": "user", "content": f"上文内容：\n{context}\n\n请根据以上内容进行创作。创作要求：{prompt}"})
    else:
        messages.append({"role": "user", "content": prompt})

    # Estimate tokens and include in response header
    estimated = ai_estimate_context_tokens(messages[1:], system_prompt)

    if api_type == "anthropic":
        # Claude uses separate system parameter
        claude_messages = [m for m in messages if m["role"] != "system"]
        payload = {
            "model": model,
            "messages": claude_messages,
            "system": system_prompt,
            "max_tokens": min(int(max_tokens), 8192),
            "stream": True,
        }
        if temperature:
            payload["temperature"] = min(max(float(temperature), 0), 1)

        def generate():
            yield f"data: {json.dumps({'estimate': estimated})}\n\n"
            yield from stream_claude(payload, api_key)

        resp = app.response_class(generate(), mimetype="text/event-stream")
        return resp
    else:
        # OpenAI-compatible
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": min(max(float(temperature), 0), 2),
            "max_tokens": min(int(max_tokens), 8192),
            "stream": True,
        }

        def generate():
            yield f"data: {json.dumps({'estimate': estimated})}\n\n"
            yield from stream_openai_compat(payload, headers, base_url)

        return app.response_class(generate(), mimetype="text/event-stream")


@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    req = request.get_json()
    api_key = req.get("api_key", "")
    messages = req.get("messages", [])
    provider_name = req.get("provider", "deepseek")
    model = req.get("model", "")

    if not api_key:
        return jsonify({"error": "请先配置 API Key"}), 400
    if not messages:
        return jsonify({"error": "消息不能为空"}), 400

    provider_cfg, provider_name = get_provider_config(provider_name)
    base_url = provider_cfg["base_url"]
    model = model or provider_cfg["default_model"]
    api_type = provider_cfg["api_type"]

    if api_type == "anthropic":
        # Claude: system prompt extracted from messages
        system_prompt = ""
        claude_messages = []
        for m in messages:
            if m["role"] == "system":
                system_prompt = (system_prompt + "\n" + m["content"]).strip()
            else:
                claude_messages.append(m)
        payload = {
            "model": model,
            "messages": claude_messages,
            "max_tokens": 4096,
            "stream": True,
        }
        if system_prompt:
            payload["system"] = system_prompt

        def generate():
            yield from stream_claude(payload, api_key)

        return app.response_class(generate(), mimetype="text/event-stream")
    else:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.85,
            "max_tokens": 4096,
            "stream": True,
        }

        def generate():
            yield from stream_openai_compat(payload, headers, base_url)

        return app.response_class(generate(), mimetype="text/event-stream")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
