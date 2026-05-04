// ---- State ----
let novel = {
  title: "未命名作品",
  genre: "",
  description: "",
  chapters: [],
  characters: [],
  outlines: [],
};

let currentChapterIndex = 0;
let autoSaveTimer = null;
let saveInProgress = false;
let savePending = false;
let isStreaming = false;
let readingMode = false;
let collapsedSections = {};
let draggedChapterIndex = null;

// Session tracking
let sessionStartTotal = 0;
let sessionWordsWritten = 0;
const SESSION_DATE = new Date().toISOString().split("T")[0];

// Provider config
const AI_PROVIDER_CONFIG = {
  deepseek: { defaultModel: "deepseek-chat", hint: "DeepSeek v4 Flash 对应模型: <strong>deepseek-chat</strong>" },
  openai: { defaultModel: "gpt-4o", hint: "OpenAI 模型示例: <strong>gpt-4o</strong>, gpt-4o-mini, gpt-4-turbo" },
  freeai: {
    defaultModel: "yng/gpt-4.1",
    hint: "可用模型列表见下拉提示",
    models: [
      "yng/agent-1", "yng/claude-4-5-haiku", "yng/claude-4-5-sonnet",
      "yng/claude-4-6-sonnet", "yng/gemini-2-5-flash", "yng/gemini-3-1-pro",
      "yng/gemini-3-flash", "yng/gpt-4.1", "yng/gpt-4.1-mini",
      "yng/gpt-5", "yng/gpt-5-mini", "yng/gpt-5.1", "yng/gpt-5.2",
      "yng/gpt-5.4", "yng/gpt-5.4-mini",
    ],
  },
  claude: { defaultModel: "claude-sonnet-4-20250514", hint: "Claude 模型示例: <strong>claude-sonnet-4-20250514</strong>, claude-3-5-haiku-latest, claude-opus-4-20250514" },
};

// Prompt templates
const PROMPT_TEMPLATES = [
  { label: "描写场景", prompt: "详细描写当前场景的环境氛围、光线、声音和气味，让读者身临其境。" },
  { label: "设计对话", prompt: "为以下角色设计一段自然生动的对话，展现他们的性格和关系。" },
  { label: "铺垫悬念", prompt: "在当前段落中加入一个悬疑线索或伏笔，为后续剧情做铺垫。" },
  { label: "战斗场面", prompt: "描写一场紧张激烈的战斗场景，注意动作细节和节奏把控。" },
  { label: "情感冲突", prompt: "设计一段情感冲突场景，展现角色内心的矛盾与挣扎。" },
  { label: "心理描写", prompt: "深入描写角色的内心活动，展现其情感变化和心理状态。" },
  { label: "过渡段落", prompt: "写一段自然的过渡，连接上下文的场景转换。" },
  { label: "环境氛围", prompt: "用细腻的笔触描写环境，营造特定的故事氛围。" },
];

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  loadNovelList();
  addChapter();
  calculateSessionStartTotal();
  render();
  renderPromptTemplates();
  renderCustomTemplates();
  document.addEventListener("keydown", onKeyDown);
});

function onKeyDown(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === "s") { e.preventDefault(); saveNovel(); }
  else if (ctrl && e.key === "Enter") { e.preventDefault(); generateAI(); }
  else if (ctrl && e.key === "r") { e.preventDefault(); toggleReadingMode(); }
  else if (ctrl && e.shiftKey && e.key === "N") { e.preventDefault(); addChapter(); }
  else if (ctrl && e.shiftKey && e.key === "F") { e.preventDefault(); toggleZenMode(); }
  else if (e.key === "F1") { e.preventDefault(); showShortcuts(); }
  else if (e.key === "Escape") {
    if (readingMode) toggleReadingMode();
  }
}

// ---- Novel CRUD ----
function createNewNovel() {
  const title = document.getElementById("newNovelTitle").value.trim() || "未命名作品";
  const genre = document.getElementById("newNovelGenre").value;
  novel = {
    title, genre, description: "",
    chapters: [{ title: "第一章", content: "" }],
    characters: [], outlines: [], writingStats: { sessions: [] },
  };
  currentChapterIndex = 0;
  readingMode = false;
  closeModal("newNovelOverlay");
  calculateSessionStartTotal();
  render();
  saveNovel();
  loadNovelList();
}

function onNovelChange() {
  novel.title = document.getElementById("novelTitle").value || "未命名作品";
  novel.genre = document.getElementById("novelGenre").value;
  updateHeaderTitle();
}

function updateHeaderTitle() {
  document.getElementById("headerNovelName").textContent = novel.title;
}

function showNewNovelDialog() {
  document.getElementById("newNovelTitle").value = "";
  document.getElementById("newNovelGenre").value = "";
  showModal("newNovelOverlay");
}

// ---- Chapters ----
function addChapter() {
  const num = novel.chapters.length + 1;
  const now = new Date().toISOString();
  novel.chapters.push({
    title: `第${toChineseNum(num)}章`, content: "",
    summary: "", createdAt: now, updatedAt: now,
  });
  currentChapterIndex = novel.chapters.length - 1;
  render();
  focusEditor();
}

function deleteChapter() {
  if (novel.chapters.length <= 1) { showToast("至少保留一个章节"); return; }
  if (!confirm(`确定删除"${novel.chapters[currentChapterIndex].title}"？`)) return;
  novel.chapters.splice(currentChapterIndex, 1);
  if (currentChapterIndex >= novel.chapters.length) currentChapterIndex = novel.chapters.length - 1;
  render();
}

function moveChapter(direction) {
  const idx = currentChapterIndex, target = idx + direction;
  if (target < 0 || target >= novel.chapters.length) return;
  [novel.chapters[idx], novel.chapters[target]] = [novel.chapters[target], novel.chapters[idx]];
  currentChapterIndex = target;
  render();
}

function selectChapter(idx) {
  saveCurrentChapter();
  if (readingMode) { renderEditor(); } // re-render reading content
  currentChapterIndex = idx;
  render();
}

function saveCurrentChapter() {
  if (novel.chapters[currentChapterIndex]) {
    const ch = novel.chapters[currentChapterIndex];
    ch.content = document.getElementById("editor").value;
    ch.title = document.getElementById("chapterTitle").value;
    ch.updatedAt = new Date().toISOString();
  }
}

function onChapterChange() {
  saveCurrentChapter();
  updateWordCount();
  scheduleAutoSave();
  renderChapterList();
}

function onSummaryChange() {
  const ch = novel.chapters[currentChapterIndex];
  if (ch) {
    ch.summary = document.getElementById("chapterSummary").value;
    scheduleAutoSave();
  }
}

function focusEditor() {
  setTimeout(() => document.getElementById("editor")?.focus(), 50);
}

// ---- Drag & Drop Chapters ----
function onChapterDragStart(e, idx) {
  draggedChapterIndex = idx;
  e.target.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onChapterDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".chapter-item").forEach(el => el.classList.remove("drag-over"));
  if (draggedChapterIndex !== idx) {
    const items = document.querySelectorAll(".chapter-item");
    if (items[idx]) items[idx].classList.add("drag-over");
  }
}

function onChapterDragEnd(e) {
  e.target.classList.remove("dragging");
  document.querySelectorAll(".chapter-item").forEach(el => el.classList.remove("drag-over"));
  draggedChapterIndex = null;
}

function onChapterDrop(e, targetIdx) {
  e.preventDefault();
  document.querySelectorAll(".chapter-item").forEach(el => el.classList.remove("drag-over"));
  if (draggedChapterIndex === null || draggedChapterIndex === targetIdx) return;
  const [removed] = novel.chapters.splice(draggedChapterIndex, 1);
  novel.chapters.splice(targetIdx, 0, removed);
  currentChapterIndex = targetIdx;
  render();
  scheduleAutoSave();
}

// ---- Characters ----
function getCharacterColor(name) {
  const colors = ["#7c6ff0","#e040a0","#2ecc71","#f39c12","#e74c5c","#3498db","#1abc9c","#9b59b6"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function showCharacterDialog() { renderCharacterGrid(); showModal("charOverlay"); }

function addCharacter() {
  novel.characters.push({ name: "新角色", role: "", description: "", background: "" });
  renderCharacterGrid();
}

function deleteCharacter(idx) { novel.characters.splice(idx, 1); renderCharacterGrid(); }

function renderCharacterGrid() {
  const grid = document.getElementById("charGrid");
  grid.innerHTML = novel.characters.map((c, i) => {
    const color = getCharacterColor(c.name || "?"), initial = c.name ? c.name[0] : "?";
    return `
      <div class="char-card">
        <div class="char-card-header">
          <div class="char-color" style="background:${color}">${initial}</div>
          <input value="${escapeHtml(c.name)}" onchange="updateChar(${i},'name',this.value)" placeholder="角色姓名">
        </div>
        <input value="${escapeHtml(c.role)}" onchange="updateChar(${i},'role',this.value)" placeholder="角色定位（如：女主角、反派）" style="width:100%;padding:6px 8px;margin-bottom:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text2);font-size:12px;font-family:var(--font);outline:none">
        <textarea rows="2" placeholder="角色描述（外貌、性格等）" onchange="updateChar(${i},'description',this.value)">${escapeHtml(c.description)}</textarea>
        <textarea rows="2" placeholder="背景故事" onchange="updateChar(${i},'background',this.value)">${escapeHtml(c.background)}</textarea>
        <div class="char-actions"><button class="btn btn-sm btn-danger" onclick="deleteCharacter(${i})">删除</button></div>
      </div>
    `;
  }).join("");
}

function updateChar(idx, field, value) { novel.characters[idx][field] = value; renderCharacters(); scheduleAutoSave(); }

// ---- Outline Management ----
function showOutlineDialog() { renderOutlineEditor(); showModal("outlineOverlay"); }

function addOutlineItem(type) {
  const labels = { act: "新幕", arc: "新剧情弧", chapter_outline: "新章节大纲" };
  novel.outlines.push({
    id: "ol_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    type: type, title: labels[type] || "新项目", content: "", order: novel.outlines.length,
  });
  renderOutlineEditor();
  scheduleAutoSave();
}

function deleteOutlineItem(id) {
  novel.outlines = novel.outlines.filter(o => o.id !== id);
  renderOutlineEditor();
  scheduleAutoSave();
}

function updateOutlineItem(id, field, value) {
  const item = novel.outlines.find(o => o.id === id);
  if (item) { item[field] = value; scheduleAutoSave(); }
}

function renderOutlineEditor() {
  const container = document.getElementById("outlineEditor");
  if (!novel.outlines || novel.outlines.length === 0) {
    container.innerHTML = '<div style="color:var(--text3);padding:20px;text-align:center">暂无大纲内容</div>';
    return;
  }
  container.innerHTML = novel.outlines.map((item, i) => {
    const typeLabels = { act: "幕", arc: "剧情弧", chapter_outline: "章节大纲" };
    return `
      <div class="outline-item">
        <div class="outline-item-header">
          <span class="outline-type-badge">${typeLabels[item.type] || item.type}</span>
          <input value="${escapeHtml(item.title)}" onchange="updateOutlineItem('${item.id}','title',this.value)" placeholder="标题" style="flex:1;padding:4px 6px;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--text);font-size:13px;font-weight:600;outline:none;font-family:var(--font)">
          <button class="btn-icon" onclick="deleteOutlineItem('${item.id}')" title="删除">&times;</button>
        </div>
        <textarea rows="2" placeholder="详细内容..." onchange="updateOutlineItem('${item.id}','content',this.value)" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text2);font-size:12px;line-height:1.5;resize:vertical;outline:none;font-family:var(--font)">${escapeHtml(item.content)}</textarea>
      </div>
    `;
  }).join("");
}

function renderOutlineSummary() {
  const el = document.getElementById("outlineSummary");
  const count = (novel.outlines || []).length;
  if (count === 0) { el.textContent = "暂无大纲"; return; }
  const acts = novel.outlines.filter(o => o.type === "act").length;
  const arcs = novel.outlines.filter(o => o.type === "arc").length;
  const chs = novel.outlines.filter(o => o.type === "chapter_outline").length;
  const parts = [];
  if (acts) parts.push(`${acts}幕`);
  if (arcs) parts.push(`${arcs}条剧情弧`);
  if (chs) parts.push(`${chs}个章节大纲`);
  el.textContent = parts.join(" | ") + " (点击编辑)";
}

function formatOutlineForAI() {
  const items = novel.outlines || [];
  if (items.length === 0) return "";
  return items.map(item => {
    const typeLabels = { act: "幕", arc: "剧情弧", chapter_outline: "章节大纲" };
    return `[${typeLabels[item.type] || item.type}] ${item.title}\n${item.content}`;
  }).join("\n\n");
}

// ---- Render ----
function render() {
  updateHeaderTitle();
  renderNovelInfo();
  renderChapterList();
  renderOutlineSummary();
  renderCharacters();
  if (!readingMode) renderEditor();
  else renderReadingContent();
  updateWordCount();
  renderStatsFooter();
}

function renderNovelInfo() {
  const titleEl = document.getElementById("novelTitle");
  const genreEl = document.getElementById("novelGenre");
  if (titleEl) titleEl.value = novel.title;
  if (genreEl) genreEl.value = novel.genre || "";
}

function renderChapterList() {
  const list = document.getElementById("chapterList");
  list.innerHTML = novel.chapters.map((ch, i) => {
    const wc = (ch.content || "").length;
    return `
      <div class="chapter-item ${i === currentChapterIndex ? "active" : ""}"
           draggable="true"
           onclick="selectChapter(${i})"
           ondragstart="onChapterDragStart(event, ${i})"
           ondragover="onChapterDragOver(event, ${i})"
           ondragend="onChapterDragEnd(event)"
           ondrop="onChapterDrop(event, ${i})">
        <span class="ch-num">${i + 1}</span>
        <span class="ch-title">${escapeHtml(ch.title || "未命名")}</span>
        <span style="font-size:11px;color:var(--text3);flex-shrink:0">${wc}字</span>
      </div>
    `;
  }).join("");
}

function renderCharacters() {
  const list = document.getElementById("characterList");
  if (novel.characters.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px 0">暂无角色</div>';
    return;
  }
  list.innerHTML = novel.characters.map(c => {
    const color = getCharacterColor(c.name || "?"), initial = c.name ? c.name[0] : "?";
    return `
      <div class="char-item">
        <div class="char-avatar" style="background:${color}">${initial}</div>
        <span>${escapeHtml(c.name)}</span>
        ${c.role ? `<span style="color:var(--text3);font-size:11px">(${escapeHtml(c.role)})</span>` : ""}
      </div>
    `;
  }).join("");
}

function renderEditor() {
  const ch = novel.chapters[currentChapterIndex];
  if (!ch) return;
  document.getElementById("chapterTitle").value = ch.title || "";
  document.getElementById("chapterSummary").value = ch.summary || "";
  const editor = document.getElementById("editor");
  editor.value = ch.content || "";
  updateReadingModeClass();
  renderReadingContent();
}

function renderReadingContent() {
  const ch = novel.chapters[currentChapterIndex];
  const container = document.getElementById("readingContentText");
  if (!ch || !container) return;
  const content = (ch.content || "").trim();
  if (!content) {
    container.innerHTML = '<div class="reading-empty">此章节暂无内容</div>';
  } else {
    const paragraphs = content.split("\n").filter(p => p.trim());
    const summaryHtml = ch.summary
      ? `<div class="reading-summary">${escapeHtml(ch.summary)}</div>`
      : "";
    container.innerHTML = `<h3>${escapeHtml(ch.title || "")}</h3>` +
      summaryHtml +
      paragraphs.map(p => `<p>${escapeHtml(p.trim())}</p>`).join("");
  }
}

function updateReadingModeClass() {
  const main = document.getElementById("mainContent");
  if (readingMode) main.classList.add("reading-mode-active");
  else main.classList.remove("reading-mode-active");
  const btn = document.getElementById("readingModeBtn");
  if (btn) btn.classList.toggle("active", readingMode);
}

function toggleReadingMode() {
  readingMode = !readingMode;
  saveCurrentChapter();
  updateReadingModeClass();
  if (readingMode) renderReadingContent();
  else focusEditor();
}

// ---- Zen Mode ----
let zenMode = false;

function toggleZenMode() {
  zenMode = !zenMode;
  document.querySelector(".app-layout").classList.toggle("zen-mode", zenMode);
  document.getElementById("zenModeBtn").classList.toggle("active", zenMode);
}

function updateWordCount() {
  const text = document.getElementById("editor").value;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, "").length;
  const paragraphs = text.split("\n").filter(p => p.trim()).length;
  document.getElementById("wordCount").textContent = `字数: ${chars} | 不计空格: ${charsNoSpace} | 段落: ${paragraphs}`;
}

function updateWordGoal() {
  const goal = parseInt(localStorage.getItem("daily_word_goal")) || 2000;
  const daily = sessionWordsWritten;
  const fill = document.getElementById("wordGoalFill");
  const text = document.getElementById("wordGoalText");
  if (!fill || !text) return;
  const pct = Math.min((daily / goal) * 100, 100);
  fill.style.width = pct + "%";
  fill.classList.toggle("exceeded", daily >= goal);
  text.innerHTML = `目标: <strong>${daily}</strong> / ${goal} 字`;
}

function renderStatsFooter() {
  const el = document.getElementById("dailyStats");
  if (!el) return;
  const total = calculateTotalWords();
  const daily = sessionWordsWritten;
  el.innerHTML = `今日写作: <strong>${daily}</strong> 字 | 总字数: <strong>${total}</strong>`;
  updateWordGoal();
}

function renderPromptTemplates() {
  const container = document.getElementById("promptTemplates");
  if (!container) return;
  container.innerHTML = PROMPT_TEMPLATES.map(t =>
    `<span class="prompt-chip" onclick="fillPromptTemplate('${escapeHtml(t.prompt)}')">${escapeHtml(t.label)}</span>`
  ).join("");
}

function fillPromptTemplate(text) {
  const ta = document.getElementById("aiPrompt");
  ta.value = text;
  ta.focus();
  updateTokenEstimate();
}

// ---- Custom Prompt Templates ----
function getCustomTemplates() {
  try { return JSON.parse(localStorage.getItem("custom_templates")) || []; } catch { return []; }
}

function saveCustomTemplates(templates) {
  localStorage.setItem("custom_templates", JSON.stringify(templates));
}

function renderCustomTemplates() {
  const container = document.getElementById("customTemplatesList");
  if (!container) return;
  const templates = getCustomTemplates();
  if (templates.length === 0) {
    container.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:4px 0">暂无自定义模板</div>';
    return;
  }
  container.innerHTML = templates.map((t, i) =>
    `<div class="custom-template-item" onclick="fillCustomTemplate(${i})">
      <span class="ct-label">${escapeHtml(t.label)}</span>
      <button class="ct-del" onclick="event.stopPropagation();deleteCustomTemplate(${i})" title="删除">&times;</button>
    </div>`
  ).join("");
}

function showSaveTemplateDialog() {
  const prompt = document.getElementById("aiPrompt").value.trim();
  document.getElementById("templateNameInput").value = "";
  document.getElementById("templatePromptInput").value = prompt;
  showModal("saveTemplateOverlay");
}

function saveCustomTemplate() {
  const label = document.getElementById("templateNameInput").value.trim();
  const prompt = document.getElementById("templatePromptInput").value.trim();
  if (!label || !prompt) { showToast("名称和内容不能为空"); return; }
  const templates = getCustomTemplates();
  templates.push({ id: "ct_" + Date.now(), label, prompt });
  saveCustomTemplates(templates);
  closeModal("saveTemplateOverlay");
  renderCustomTemplates();
  showToast("模板已保存");
}

function deleteCustomTemplate(idx) {
  const templates = getCustomTemplates();
  templates.splice(idx, 1);
  saveCustomTemplates(templates);
  renderCustomTemplates();
}

function fillCustomTemplate(idx) {
  const templates = getCustomTemplates();
  const t = templates[idx];
  if (!t) return;
  const ta = document.getElementById("aiPrompt");
  ta.value = t.prompt;
  ta.focus();
  updateTokenEstimate();
}

// ---- Collapsible Sections ----
function toggleSection(name) {
  collapsedSections[name] = !collapsedSections[name];
  const content = document.getElementById("sectionContent" + name.charAt(0).toUpperCase() + name.slice(1));
  const icon = document.getElementById("collapseIcon" + name.charAt(0).toUpperCase() + name.slice(1));
  if (content) content.classList.toggle("collapsed", collapsedSections[name]);
  if (icon) icon.classList.toggle("collapsed", collapsedSections[name]);
}

// ---- Writing Stats ----
function calculateTotalWords() {
  return novel.chapters.reduce((sum, ch) => sum + (ch.content || "").length, 0);
}

function calculateSessionStartTotal() {
  sessionStartTotal = calculateTotalWords();
  sessionWordsWritten = 0;
}

function trackWritingSession() {
  const total = calculateTotalWords();
  const delta = Math.max(0, total - sessionStartTotal - sessionWordsWritten);
  if (delta === 0) return;
  sessionWordsWritten += delta;
  const stats = novel.writingStats || { sessions: [] };
  if (!novel.writingStats) novel.writingStats = stats;
  let todaySession = stats.sessions.find(s => s.date === SESSION_DATE);
  if (todaySession) {
    todaySession.wordsWritten += delta;
    const ch = novel.chapters[currentChapterIndex];
    if (ch && !todaySession.chaptersModified.includes(ch.title)) {
      todaySession.chaptersModified.push(ch.title);
    }
  } else {
    stats.sessions.push({
      date: SESSION_DATE,
      wordsWritten: delta,
      chaptersModified: novel.chapters[currentChapterIndex] ? [novel.chapters[currentChapterIndex].title] : [],
    });
  }
  renderStatsFooter();
}

// ---- Save/Load ----
function scheduleAutoSave() {
  const hint = document.getElementById("saveHint");
  if (hint) { hint.textContent = "未保存"; hint.style.color = "var(--warning)"; }
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    if (saveInProgress) { savePending = true; }
    else { saveNovel(); }
  }, 2000);
}

function saveNovel() {
  if (saveInProgress) { savePending = true; return; }
  saveInProgress = true;
  saveCurrentChapter();
  trackWritingSession();
  novel.title = document.getElementById("novelTitle").value || "未命名作品";
  fetch("/api/novel/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(novel),
  }).then(r => r.json()).then(() => {
    const hint = document.getElementById("saveHint");
    if (hint) { hint.textContent = "已保存"; hint.style.color = "var(--success)"; }
    loadNovelList();
  }).catch(() => {
    const hint = document.getElementById("saveHint");
    if (hint) { hint.textContent = "保存失败"; hint.style.color = "var(--danger)"; }
  }).finally(() => {
    saveInProgress = false;
    if (savePending) { savePending = false; saveNovel(); }
  });
}

function loadNovelList() {
  fetch("/api/novels").then(r => r.json()).then(list => {
    const container = document.getElementById("novelList");
    if (list.length === 0) {
      container.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px">暂无保存的作品</div>';
      return;
    }
    container.innerHTML = list.map(n => `
      <div class="novel-list-item" onclick="loadNovelFromList('${escapeHtml(n.title)}')">
        <div>
          <div class="nl-title">${escapeHtml(n.title)}</div>
          <div class="nl-meta">${n.chapters} 章节</div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteNovelFromList('${escapeHtml(n.title)}')">&times;</button>
      </div>
    `).join("");
  });
}

function loadNovelFromList(title) {
  fetch(`/api/novel/${encodeURIComponent(title)}`).then(r => r.json()).then(data => {
    novel = data;
    if (!novel.chapters || novel.chapters.length === 0) novel.chapters = [{ title: "第一章", content: "" }];
    if (!novel.characters) novel.characters = [];
    if (!novel.outlines) novel.outlines = [];
    if (!novel.writingStats) novel.writingStats = { sessions: [] };
    currentChapterIndex = 0;
    readingMode = false;
    closeModal("loadOverlay");
    calculateSessionStartTotal();
    render();
    renderPromptTemplates();
    showToast("已加载: " + novel.title);
  });
}

function deleteNovelFromList(title) {
  if (!confirm(`确定删除"${title}"？此操作不可恢复。`)) return;
  fetch(`/api/novel/delete/${encodeURIComponent(title)}`, { method: "DELETE" }).then(() => loadNovelList());
}

function showLoadDialog() { loadNovelList(); showModal("loadOverlay"); }

// ---- Import ----
function importTextFile() {
  document.getElementById("importFileInput").click();
}

function onFileImported(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    const name = file.name.replace(/\.txt$/i, "").trim() || "导入章节";
    const now = new Date().toISOString();
    novel.chapters.push({
      title: name, content: content,
      summary: `从 ${file.name} 导入`,
      createdAt: now, updatedAt: now,
    });
    currentChapterIndex = novel.chapters.length - 1;
    render();
    saveNovel();
    showToast(`已导入: ${file.name} (${content.length} 字)`);
  };
  reader.readAsText(file, "UTF-8");
  event.target.value = "";
}

// ---- Export ----
function exportNovel() {
  saveCurrentChapter();
  let text = `# ${novel.title}\n`;
  if (novel.genre) text += `类型: ${novel.genre}\n`;
  text += `\n${"=".repeat(40)}\n\n`;
  novel.chapters.forEach((ch, i) => {
    text += `## ${ch.title || `第${i + 1}章`}\n\n`;
    text += (ch.content || "") + "\n\n";
    text += `${"-".repeat(30)}\n\n`;
  });
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${novel.title}.txt`;
  a.click(); URL.revokeObjectURL(url);
  showToast("导出成功!");
}

// ---- Settings ----
const API_KEY_STORAGE = {
  deepseek: "deepseek_api_key",
  openai: "openai_api_key",
  freeai: "freeai_api_key",
  claude: "claude_api_key",
};

function getApiKeyForProvider(provider) {
  return localStorage.getItem(API_KEY_STORAGE[provider] || "deepseek_api_key") || "";
}

function setApiKeyForProvider(provider, key) {
  const storageKey = API_KEY_STORAGE[provider];
  if (storageKey && key) localStorage.setItem(storageKey, key);
}

const PROVIDER_LABELS = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  freeai: "FreeAI",
  claude: "Claude",
};

function showSettings() {
  const provider = localStorage.getItem("ai_provider") || "deepseek";
  document.getElementById("apiKey").value = getApiKeyForProvider(provider);
  document.getElementById("apiKeyLabel").textContent = PROVIDER_LABELS[provider] || "API";
  document.getElementById("aiProvider").value = provider;
  document.getElementById("apiModel").value = localStorage.getItem("deepseek_model") || AI_PROVIDER_CONFIG[provider]?.defaultModel || "deepseek-chat";
  updateProviderHint(provider);

  const settings = novel.appSettings || {};
  const temp = settings.temperature || parseFloat(localStorage.getItem("ai_temperature")) || 0.85;
  const tokens = settings.maxTokens || parseInt(localStorage.getItem("ai_max_tokens")) || 4096;
  const dailyGoal = parseInt(localStorage.getItem("daily_word_goal")) || 2000;

  const tempInput = document.getElementById("aiTemperature");
  if (tempInput) { tempInput.value = temp; updateRangeDisplay(tempInput, "tempDisplay"); }
  const tokensInput = document.getElementById("aiMaxTokens");
  if (tokensInput) tokensInput.value = tokens;
  const goalInput = document.getElementById("dailyWordGoal");
  if (goalInput) goalInput.value = dailyGoal;

  const inclChars = document.getElementById("includeCharacters");
  if (inclChars) inclChars.checked = settings.includeCharacters !== false;
  const inclOutline = document.getElementById("includeOutline");
  if (inclOutline) inclOutline.checked = settings.includeOutline !== false;
  const inclSummaries = document.getElementById("includeSummaries");
  if (inclSummaries) inclSummaries.checked = settings.includeSummaries === true;

  showModal("settingsOverlay");
}

function onProviderChange() {
  const provider = document.getElementById("aiProvider").value;

  // Save current key, load new provider's key
  const oldProvider = localStorage.getItem("ai_provider") || "deepseek";
  const oldKey = document.getElementById("apiKey").value.trim();
  if (oldKey) setApiKeyForProvider(oldProvider, oldKey);

  const cfg = AI_PROVIDER_CONFIG[provider];
  if (!cfg) return;
  document.getElementById("apiModel").value = cfg.defaultModel;
  updateProviderHint(provider);
  document.getElementById("apiKey").value = getApiKeyForProvider(provider);
  document.getElementById("apiKeyLabel").textContent = PROVIDER_LABELS[provider] || "API";

  // Populate model datalist
  const datalist = document.getElementById("modelList");
  if (datalist) {
    const models = cfg.models || [];
    datalist.innerHTML = models.map(m => `<option value="${escapeHtml(m)}">`).join("");
  }
}

function updateProviderHint(provider) {
  const el = document.getElementById("providerHint");
  const cfg = AI_PROVIDER_CONFIG[provider];
  if (el && cfg) el.innerHTML = cfg.hint;
}

function updateRangeDisplay(slider, displayId) {
  const display = document.getElementById(displayId);
  if (display) display.textContent = parseFloat(slider.value).toFixed(2);
}

function saveSettings() {
  const provider = document.getElementById("aiProvider").value;
  const key = document.getElementById("apiKey").value.trim();
  const model = document.getElementById("apiModel").value.trim() || AI_PROVIDER_CONFIG[provider]?.defaultModel || "deepseek-chat";
  if (key) setApiKeyForProvider(provider, key);
  localStorage.setItem("ai_provider", provider);
  localStorage.setItem("deepseek_model", model);

  if (!novel.appSettings) novel.appSettings = {};
  const tempInput = document.getElementById("aiTemperature");
  const tokensInput = document.getElementById("aiMaxTokens");
  if (tempInput) { novel.appSettings.temperature = parseFloat(tempInput.value); localStorage.setItem("ai_temperature", tempInput.value); }
  if (tokensInput) { novel.appSettings.maxTokens = parseInt(tokensInput.value); localStorage.setItem("ai_max_tokens", tokensInput.value); }

  const goalInput = document.getElementById("dailyWordGoal");
  if (goalInput) { localStorage.setItem("daily_word_goal", parseInt(goalInput.value)); }

  const inclChars = document.getElementById("includeCharacters");
  if (inclChars) novel.appSettings.includeCharacters = inclChars.checked;
  const inclOutline = document.getElementById("includeOutline");
  if (inclOutline) novel.appSettings.includeOutline = inclOutline.checked;
  const inclSummaries = document.getElementById("includeSummaries");
  if (inclSummaries) novel.appSettings.includeSummaries = inclSummaries.checked;

  closeModal("settingsOverlay");
  showToast("设置已保存");
  updateWordGoal();
  scheduleAutoSave();
}

function loadSettings() {
  if (!localStorage.getItem("daily_word_goal")) {
    localStorage.setItem("daily_word_goal", "2000");
  }
}

// ---- Token Estimation ----
function estimateTokens(text) {
  if (!text) return 0;
  let chinese = 0, english = 0;
  for (const c of text) {
    if (c >= '一' && c <= '鿿') chinese++;
    else english++;
  }
  return Math.ceil(chinese * 1.5 + english / 4) + 5;
}

let estimateTimeout = null;

function updateTokenEstimate() {
  clearTimeout(estimateTimeout);
  estimateTimeout = setTimeout(() => {
    const prompt = document.getElementById("aiPrompt").value.trim();
    const context = novel.chapters[currentChapterIndex]?.content || "";
    const settings = novel.appSettings || {};
    const charCount = (settings.includeCharacters !== false && novel.characters?.length > 0) ? novel.characters.length : 0;
    const inclOutline = (settings.includeOutline !== false && (novel.outlines || []).length > 0);

    let total = estimateTokens(prompt) + estimateTokens(context);
    if (charCount) total += charCount * 80;  // rough: ~80 tokens per character entry
    if (inclOutline) total += 200;
    if (settings.includeSummaries) total += novel.chapters.length * 30;

    const el = document.getElementById("tokenEstimate");
    if (!el) return;
    if (total > 0) {
      el.style.display = "block";
      el.innerHTML = `上下文约 <strong>${total.toLocaleString()}</strong> tokens`;
    } else {
      el.style.display = "none";
    }
  }, 300);
}

// ---- AI ----
function generateAI() {
  if (isStreaming) return;
  const provider = localStorage.getItem("ai_provider") || "deepseek";
  const apiKey = getApiKeyForProvider(provider);
  if (!apiKey) { showToast("请先在设置中配置 " + (PROVIDER_LABELS[provider] || "API") + " Key"); showSettings(); return; }

  const mode = document.getElementById("aiMode").value;
  const prompt = document.getElementById("aiPrompt").value.trim();
  if (!prompt) { showToast("请输入创作提示"); return; }

  const model = localStorage.getItem("deepseek_model") || AI_PROVIDER_CONFIG[provider]?.defaultModel || "deepseek-chat";
  const settings = novel.appSettings || {};
  const temperature = settings.temperature || 0.85;
  const maxTokens = settings.maxTokens || 4096;

  saveCurrentChapter();
  const context = novel.chapters[currentChapterIndex]?.content || "";

  // Build enhanced context
  const characters = (settings.includeCharacters !== false && novel.characters?.length > 0) ? novel.characters : [];
  const outlineText = (settings.includeOutline !== false) ? formatOutlineForAI() : "";
  const chaptersOverview = settings.includeSummaries ? novel.chapters.map(ch => ({
    title: ch.title, summary: ch.summary || (ch.content || "").slice(0, 100),
  })) : [];

  const btn = document.getElementById("aiGenerateBtn");
  btn.textContent = "生成中...";
  btn.disabled = true;
  isStreaming = true;

  const responseDiv = document.getElementById("aiResponse");
  responseDiv.textContent = "";
  responseDiv.classList.add("streaming");

  const ctxHint = document.getElementById("aiContextHintText");
  if (ctxHint) {
    const parts = ["使用当前章节内容"];
    if (characters.length) parts.push(`${characters.length}个角色设定`);
    if (outlineText) parts.push("故事大纲");
    if (chaptersOverview.length) parts.push("章节概要");
    ctxHint.textContent = `已包含: ${parts.join("、")}`;
  }

  fetch("/api/ai/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey, mode, prompt, context, model,
      provider,
      characters, outline: outlineText, all_chapters_overview: chaptersOverview,
      temperature, max_tokens: maxTokens,
    }),
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        responseDiv.textContent = `错误: ${text}`;
        resetAIButton();
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let estimateReceived = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) { responseDiv.textContent += `\n[错误] ${data.error}`; resetAIButton(); return; }
              if (data.content) { responseDiv.textContent += data.content; responseDiv.scrollTop = responseDiv.scrollHeight; }
              if (data.estimate && !estimateReceived) {
                estimateReceived = true;
                const el = document.getElementById("tokenEstimate");
                if (el) {
                  el.innerHTML = `实际消耗约 <strong>${data.estimate.toLocaleString()}</strong> tokens`;
                }
              }
            } catch (e) {}
          }
        }
      }
      if (!estimateReceived) {
        const el = document.getElementById("tokenEstimate");
        if (el) el.style.display = "none";
      }
      resetAIButton();
    })
    .catch((err) => { responseDiv.textContent = `连接错误: ${err.message}`; resetAIButton(); });
}

function resetAIButton() {
  const btn = document.getElementById("aiGenerateBtn");
  btn.textContent = "开始创作";
  btn.disabled = false;
  isStreaming = false;
  document.getElementById("aiResponse").classList.remove("streaming");
}

function clearAIResponse() {
  document.getElementById("aiResponse").textContent = "";
  document.getElementById("aiResponse").innerHTML = '<div class="ai-placeholder">AI 生成的内容将显示在这里...</div>';
}

function insertToEditor() {
  const response = document.getElementById("aiResponse").textContent;
  if (!response || response === "AI 生成的内容将显示在这里...") { showToast("没有可插入的内容"); return; }
  const editor = document.getElementById("editor");
  const cursorPos = editor.selectionStart;
  const text = editor.value;
  editor.value = text.slice(0, cursorPos) + response + text.slice(cursorPos);
  editor.selectionStart = editor.selectionEnd = cursorPos + response.length;
  onChapterChange();
  showToast("已插入到编辑器");
}

function replaceSelection() {
  const response = document.getElementById("aiResponse").textContent;
  if (!response || response === "AI 生成的内容将显示在这里...") { showToast("没有可替换的内容"); return; }
  const editor = document.getElementById("editor");
  const start = editor.selectionStart, end = editor.selectionEnd;
  if (start === end) { showToast("请先在编辑器中选中要替换的文字"); editor.focus(); return; }
  const text = editor.value;
  editor.value = text.slice(0, start) + response + text.slice(end);
  editor.selectionStart = editor.selectionEnd = start + response.length;
  onChapterChange();
  showToast("已替换选中内容");
}

function appendToEditor() {
  const response = document.getElementById("aiResponse").textContent;
  if (!response || response === "AI 生成的内容将显示在这里...") { showToast("没有可追加的内容"); return; }
  const editor = document.getElementById("editor");
  editor.value += (editor.value ? "\n" : "") + response;
  editor.selectionStart = editor.selectionEnd = editor.value.length;
  onChapterChange();
  showToast("已追加到章节末尾");
}

// ---- Shortcuts ----
function showShortcuts() { showModal("shortcutsOverlay"); }

// ---- Modal ----
function showModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

// ---- Toast ----
function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 24px;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:13px;z-index:2000;box-shadow:var(--shadow);transition:opacity 0.3s";
    document.body.appendChild(toast);
  }
  toast.textContent = msg; toast.style.opacity = "1";
  clearTimeout(toast._hide);
  toast._hide = setTimeout(() => { toast.style.opacity = "0"; }, 2000);
}

// ---- Utility ----
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function toChineseNum(n) {
  const chars = "零一二三四五六七八九十";
  if (n <= 10) return chars[n];
  if (n < 20) return "十" + (n > 10 ? chars[n - 10] : "");
  if (n < 100) return chars[Math.floor(n / 10)] + "十" + (n % 10 ? chars[n % 10] : "");
  return String(n);
}
