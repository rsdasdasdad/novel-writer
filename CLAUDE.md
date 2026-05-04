# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Novel Writer — a Chinese web novel writing assistant. Flask backend + vanilla JS frontend, multiple AI provider support, local JSON file storage.

## Setup & Run

```bash
pip install -r requirements.txt
python app.py
# Opens at http://localhost:5000
```

## Build

```bash
# Standalone exe (PyInstaller)
python -m PyInstaller --onedir --name "AI-Novel-Writer" --add-data "templates;templates" --add-data "static;static" --noconsole app.py

# Windows installer (requires Inno Setup 6)
"/c/Users/Asimp/AppData/Local/Programs/Inno Setup 6/ISCC.exe" installer.iss
```

## Architecture

### Backend (`app.py`)

- **Base dir**: Uses `BASE_DIR` (line 8-11) — resolves to `sys.executable` parent when PyInstaller-frozen, else `__file__` parent. `novels/` directory is always at `BASE_DIR/novels`.
- **Novel CRUD**: `GET /api/novels`, `GET /api/novel/<title>`, `POST /api/novel/save`, `DELETE /api/novel/delete/<title>`
- **AI providers**: Config dict `AI_PROVIDERS` (line 16-38) maps provider names to `{ base_url, default_model, api_type }`. `api_type` is either `"openai"` (OpenAI-compatible format) or `"anthropic"` (Claude-specific format).
  - `stream_openai_compat()` — handles DeepSeek, OpenAI, FreeAI
  - `stream_claude()` — handles Anthropic Claude (different SSE event format, `x-api-key` auth)
  - Both routes (`/api/ai/write`, `/api/ai/chat`) emit an initial `{"estimate": N}` SSE event for token count
- **System prompt builder** (`build_system_prompt`): Composes Chinese writing prompts with optional character profiles, story outline, and chapter summaries embedded.

### Frontend (`static/script.js`)

- **State**: Single global `novel` object, `currentChapterIndex`, `isStreaming`, `readingMode`, `zenMode`
- **AI provider config** (`AI_PROVIDER_CONFIG`): Maps provider names to `{ defaultModel, hint, models[] }` — `models[]` populates `<datalist>` suggestions.
- **Per-provider API keys** (`API_KEY_STORAGE`): Each provider gets its own localStorage slot (`deepseek_api_key`, `openai_api_key`, etc.). Switching providers in settings auto-saves the current key and loads the new one.
- **Auto-save**: 2s debounce timer, saves via `POST /api/novel/save`
- **Custom prompt templates**: Stored in localStorage as JSON array, rendered in right sidebar.
- **Token estimation**: `estimateTokens()` counts Chinese chars *1.5 + English chars/4. Runs on `oninput` from AI prompt textarea with 300ms debounce.

### Frontend (`templates/index.html` + `static/style.css`)

- Single-page app layout: left sidebar (chapters/outline/characters), center editor, right sidebar (AI panel)
- Settings modal: provider `<select>`, model `<input>` with `<datalist>`, per-provider API key
- AI action buttons: insert at cursor, replace selection, append to end

### Key Patterns

- **Streaming SSE**: Frontend uses `ReadableStream` reader; backend uses Flask generator with `requests` streaming. Both sides yield `data: {json}\n\n` chunks.
- **No database**: All persistence is file-based JSON in `novels/` directory (gitignored).
- **Chinese word count**: `String.length` for character count.
- **Keyboard shortcuts**: Ctrl+S (save), Ctrl+Enter (AI generate), Ctrl+R (reading mode), Ctrl+Shift+N (new chapter), Ctrl+Shift+F (zen mode), F1 (help), Escape (close modal/reading mode).
