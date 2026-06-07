'use strict';

const LS_KEY_PREFIX = 'yana-api-key-';

const PROVIDER_MODELS = {
  anthropic: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-8'],
  groq:      ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it', 'llama-3.1-70b-versatile'],
  openai:    ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
};

const $ = id => document.getElementById(id);

// ── Markdown renderer ──────────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inlineMd(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}
function renderMd(raw) {
  const lines = raw.split('\n');
  const out = [];
  let inCode = false, codeBuf = [], inList = false, listBuf = [], listType = 'ul';

  function flushList() {
    if (!inList) return;
    out.push(`<${listType}>${listBuf.map(l => `<li>${l}</li>`).join('')}</${listType}>`);
    listBuf = []; inList = false;
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) { flushList(); inCode = true; codeBuf = []; }
      else { inCode = false; out.push(`<pre><code>${escHtml(codeBuf.join('\n'))}</code></pre>`); }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    const hm = line.match(/^(#{1,3}) (.*)/);
    if (hm) { flushList(); out.push(`<h${hm[1].length}>${inlineMd(escHtml(hm[2]))}</h${hm[1].length}>`); continue; }

    const lm = line.match(/^[-*] (.*)/);
    if (lm) { if (!inList) listType = 'ul'; inList = true; listBuf.push(inlineMd(escHtml(lm[1]))); continue; }

    const om = line.match(/^\d+\. (.*)/);
    if (om) { if (!inList) listType = 'ol'; inList = true; listBuf.push(inlineMd(escHtml(om[1]))); continue; }

    if (!line.trim()) { flushList(); if (out.length) out.push('<br>'); continue; }

    flushList();
    out.push(`<p>${inlineMd(escHtml(line))}</p>`);
  }

  flushList();
  if (inCode) out.push(`<pre><code>${escHtml(codeBuf.join('\n'))}</code></pre>`);
  return out.join('');
}

// ── Element refs ───────────────────────────────────────────────────────────────
const sidebar        = $('sidebar');
const sidebarOverlay = $('sidebar-overlay');
const menuBtn        = $('menu-btn');
const sidebarClose   = $('sidebar-close');
const newChatBtn     = $('new-chat-btn');
const providerSelect = $('provider-select');
const modelSelect    = $('model-select');
const keyInput       = $('api-key-input');
const saveKeyBtn     = $('save-key-btn');
const keyStatus      = $('key-status');
const messagesEl     = $('messages');
const welcomeEl      = $('welcome');
const taskInput      = $('task-input');
const runBtn         = $('run-btn');
const historyList    = $('history-list');
const attachBtn      = $('attach-btn');
const fileInput      = $('file-input');
const fileChips      = $('file-chips');

// ── Sidebar toggle ─────────────────────────────────────────────────────────────
function openSidebar()  { sidebar.classList.add('open');    sidebarOverlay.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('show'); }
menuBtn.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// ── New chat ───────────────────────────────────────────────────────────────────
newChatBtn.addEventListener('click', () => {
  messagesEl.querySelectorAll('.msg').forEach(m => m.remove());
  welcomeEl.classList.remove('hidden');
  taskInput.value = '';
  autoResize();
  taskInput.focus();
  closeSidebar();
  chatHistory.length = 0;
  renderHistory();
  attachedFiles.length = 0;
  renderFileChips();
});

// ── Stats ──────────────────────────────────────────────────────────────────────
fetch('/api/status')
  .then(r => r.json())
  .then(s => {
    $('stat-version').textContent = `v${s.version}`;
    $('stat-skills').textContent  = `${s.skills.toLocaleString()} skills`;
    $('stat-agents').textContent  = `${s.agents} agents`;
    $('stat-hooks').textContent   = `${s.hooks} hooks`;
    const ws = $('welcome-skills');
    if (ws) ws.textContent = s.skills.toLocaleString();
  })
  .catch(() => {});

// ── Provider + model ───────────────────────────────────────────────────────────
function populateModels() {
  const models = PROVIDER_MODELS[providerSelect.value] || [];
  modelSelect.innerHTML = '';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    modelSelect.appendChild(opt);
  }
  syncKeyStatus();
}
providerSelect.addEventListener('change', populateModels);
populateModels();

// ── API key ────────────────────────────────────────────────────────────────────
function lsKey()  { return LS_KEY_PREFIX + providerSelect.value; }
function getKey() { return localStorage.getItem(lsKey()) || ''; }

function syncKeyStatus() {
  const saved = !!getKey();
  keyStatus.textContent = saved ? 'saved ✓' : 'no key';
  keyStatus.classList.toggle('saved', saved);
  keyInput.placeholder = { groq: 'gsk_…', openai: 'sk-…' }[providerSelect.value] || 'sk-ant-…';
}

saveKeyBtn.addEventListener('click', () => {
  const val = keyInput.value.trim();
  if (val) {
    localStorage.setItem(lsKey(), val);
    keyInput.value = '';
    _sbSaveApiKey(providerSelect.value, val);
  } else {
    localStorage.removeItem(lsKey());
  }
  syncKeyStatus();
});

// ── Suggestion chips ───────────────────────────────────────────────────────────
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    taskInput.value = chip.textContent.trim();
    autoResize();
    taskInput.focus();
  });
});

// ── Auto-resize textarea ───────────────────────────────────────────────────────
function autoResize() {
  taskInput.style.height = 'auto';
  taskInput.style.height = Math.min(taskInput.scrollHeight, 200) + 'px';
}
taskInput.addEventListener('input', autoResize);

// ── Message helpers ────────────────────────────────────────────────────────────
function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addUserMsg(text) {
  welcomeEl.classList.add('hidden');
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.innerHTML = `<div class="msg-bubble">${escHtml(text).replace(/\n/g, '<br>')}</div>`;
  messagesEl.appendChild(div);
  scrollBottom();
}

function startAiMsg(decision) {
  const div = document.createElement('div');
  div.className = 'msg msg-ai';

  const route = decision.route || 'simple';
  let metaHtml = `<span class="meta-pill route-${escHtml(route)}">${escHtml(route)}</span>`;
  if (decision.confidence != null) {
    metaHtml += `<span class="meta-pill conf">${Math.round(decision.confidence * 100)}%</span>`;
  }
  if (decision.suggested_skill) {
    metaHtml += `<span class="meta-pill skill">${escHtml(decision.suggested_skill)}</span>`;
  }

  div.innerHTML = `
    <div class="msg-ai-avatar">Y</div>
    <div class="msg-body">
      <div class="msg-text streaming"></div>
      <div class="msg-meta">${metaHtml}</div>
    </div>`;

  messagesEl.appendChild(div);
  scrollBottom();
  return div.querySelector('.msg-text');
}

function addAiMsg(html, decision) {
  const div = document.createElement('div');
  div.className = 'msg msg-ai';
  const route = (decision && decision.route) || '';
  let metaHtml = route ? `<span class="meta-pill route-${escHtml(route)}">${escHtml(route)}</span>` : '';
  div.innerHTML = `
    <div class="msg-ai-avatar">Y</div>
    <div class="msg-body">
      <div class="msg-text">${html}</div>
      ${metaHtml ? `<div class="msg-meta">${metaHtml}</div>` : ''}
    </div>`;
  messagesEl.appendChild(div);
  scrollBottom();
}

// ── SSE streaming ──────────────────────────────────────────────────────────────
function streamChat(task, apiKey, decision) {
  const textEl = startAiMsg(decision);
  let fullText = '';

  fetch('/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task, apiKey,
      suggestedAgents: decision.suggested_agents || [],
      provider: providerSelect.value,
      model:    modelSelect.value,
      skill:    decision.suggested_skill || null,
    }),
  }).then(res => {
    if (!res.ok || !res.body) {
      textEl.classList.remove('streaming');
      textEl.innerHTML = `<span class="md-err">HTTP error ${res.status}</span>`;
      return;
    }
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    function pump() {
      reader.read().then(({ done, value }) => {
        if (done) { textEl.classList.remove('streaming'); return; }
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') { textEl.classList.remove('streaming'); return; }
          try {
            const evt = JSON.parse(raw);
            if (evt.text)  { fullText += evt.text; textEl.innerHTML = renderMd(fullText); scrollBottom(); }
            if (evt.error) { textEl.innerHTML += `<span class="md-err">[Error: ${escHtml(evt.error)}]</span>`; }
          } catch (_) {}
        }
        pump();
      }).catch(err => {
        textEl.classList.remove('streaming');
        textEl.innerHTML += `<span class="md-err">[stream error: ${escHtml(err.message)}]</span>`;
      });
    }
    pump();
  }).catch(err => {
    textEl.classList.remove('streaming');
    textEl.innerHTML = escHtml(`Error: ${err.message}`);
  });
}

// ── File attachments ───────────────────────────────────────────────────────────
const attachedFiles = [];  // [{ name, size, content }]

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function renderFileChips() {
  fileChips.innerHTML = '';
  for (let i = 0; i < attachedFiles.length; i++) {
    const f = attachedFiles[i];
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.innerHTML = `
      <span class="file-chip-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
      <span class="file-chip-size">${fmtSize(f.size)}</span>
      <button class="file-chip-remove" type="button" aria-label="Remove file" data-idx="${i}">×</button>`;
    fileChips.appendChild(chip);
  }
  attachBtn.classList.toggle('has-files', attachedFiles.length > 0);
}

fileChips.addEventListener('click', e => {
  const btn = e.target.closest('.file-chip-remove');
  if (!btn) return;
  const idx = parseInt(btn.dataset.idx, 10);
  attachedFiles.splice(idx, 1);
  renderFileChips();
});

attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const MAX_FILE   = 64 * 1024;       // 64 KB per file
  const MAX_TOTAL  = 256 * 1024;      // 256 KB total
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';

  let pending = files.length;
  if (!pending) return;

  files.forEach(file => {
    if (file.size > MAX_FILE) {
      addAiMsg(`<span class="md-err">File <strong>${escHtml(file.name)}</strong> quá lớn (max 64 KB). Hãy paste đoạn code cần thiết thôi nhé.</span>`, {});
      pending--;
      return;
    }
    const totalAfter = attachedFiles.reduce((s, f) => s + f.size, 0) + file.size;
    if (totalAfter > MAX_TOTAL) {
      addAiMsg(`<span class="md-err">Tổng file đính kèm vượt 256 KB. Bỏ bớt file cũ trước nhé.</span>`, {});
      pending--;
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      attachedFiles.push({ name: file.name, size: file.size, content: reader.result });
      renderFileChips();
      pending--;
    };
    reader.onerror = () => { pending--; };
    reader.readAsText(file);
  });
});

function buildTaskWithFiles(userText) {
  if (!attachedFiles.length) return userText;
  const blocks = attachedFiles.map(f =>
    `\`\`\`${f.name}\n${f.content}\n\`\`\``
  ).join('\n\n');
  return `${blocks}\n\n${userText}`.trim();
}

// ── Run ────────────────────────────────────────────────────────────────────────
async function runTask() {
  const raw = taskInput.value.trim();
  if (!raw && !attachedFiles.length) { taskInput.focus(); return; }
  const userText = raw || '(Xem file đính kèm)';
  const task = buildTaskWithFiles(userText);

  addUserMsg(userText + (attachedFiles.length ? `\n\n📎 ${attachedFiles.map(f => f.name).join(', ')}` : ''));
  attachedFiles.length = 0;
  renderFileChips();
  taskInput.value = '';
  autoResize();
  runBtn.disabled = true;

  try {
    const res = await fetch('/api/route', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ task }),
    });
    const decision = await res.json();

    if (decision.route === 'external') {
      addAiMsg('<p>⚠ External action detected — manual confirmation required before proceeding.</p>', decision);
    } else if (!getKey()) {
      addAiMsg(`<p>Add your <strong>${escHtml(providerSelect.value)}</strong> API key in the sidebar to get an AI response.</p>`, decision);
    } else {
      streamChat(task, getKey(), decision);
    }

    pushHistory(task, decision.route);
  } catch (err) {
    addAiMsg(`<span class="md-err">${escHtml(err.message)}</span>`, {});
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener('click', runTask);
taskInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runTask(); }
});

// ── Supabase stubs (replaced once Supabase loads at end of file) ───────────────
let _sbPushHistory = () => {};
let _sbSaveApiKey  = () => {};

// ── History (persisted to localStorage) ───────────────────────────────────────
const LS_HISTORY_KEY = 'yana-history';
const MAX_HISTORY    = 30;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY_KEY) || '[]'); } catch (_) { return []; }
}
function saveHistory(arr) {
  try { localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(arr)); } catch (_) {}
}

const chatHistory = loadHistory();

function pushHistory(task, route) {
  const item = { task, route, ts: Date.now() };
  chatHistory.unshift(item);
  if (chatHistory.length > MAX_HISTORY) chatHistory.pop();
  saveHistory(chatHistory);
  renderHistory();
  _sbPushHistory(item);
}

function renderHistory() {
  if (chatHistory.length === 0) {
    historyList.innerHTML = '<li class="history-empty">No chats yet</li>';
    return;
  }
  historyList.innerHTML = '';
  for (const item of chatHistory) {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.tabIndex = 0;
    const ago = item.ts ? relTime(item.ts) : '';
    li.innerHTML = `
      <div class="history-task">${escHtml(item.task)}</div>
      <div class="history-meta">${escHtml(item.route || '')}${ago ? ' · ' + ago : ''}</div>`;
    const restore = () => {
      taskInput.value = item.task;
      autoResize();
      taskInput.focus();
      closeSidebar();
    };
    li.addEventListener('click', restore);
    li.addEventListener('keydown', e => { if (e.key === 'Enter') restore(); });
    historyList.appendChild(li);
  }
}

function relTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000)       return 'just now';
  if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)   return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

renderHistory();

// ── Supabase auth + sync ────────────────────────────────────────────────────────
(function initSupabase() {
  if (typeof window === 'undefined' || !window.supabase) return;

  const SUPABASE_URL = 'https://kxuqqxmcnmgdlwjtpggq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jCB2cKz0LmGUP0pcOY1bog_bnIFDff7';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let sbUser = null;

  const userSection    = $('user-section');
  const authOverlay    = $('auth-overlay');
  const authModal      = $('auth-modal');
  const authClose      = $('auth-close');
  const authTitleEl    = $('auth-title');
  const authForm       = $('auth-form');
  const authEmailEl    = $('auth-email');
  const authPasswordEl = $('auth-password');
  const authSubmitEl   = $('auth-submit');
  const authErrorEl    = $('auth-error');
  const authSwitchBtn  = $('auth-switch');
  const authToggleLabel= $('auth-toggle-label');

  let authMode = 'login';

  function openModal(mode) {
    authMode = mode || 'login';
    const isLogin = authMode === 'login';
    authTitleEl.textContent     = isLogin ? 'Đăng nhập' : 'Đăng ký';
    authSubmitEl.textContent    = isLogin ? 'Đăng nhập' : 'Tạo tài khoản';
    authSwitchBtn.textContent   = isLogin ? 'Đăng ký'   : 'Đăng nhập';
    authToggleLabel.textContent = isLogin ? 'Chưa có tài khoản? ' : 'Đã có tài khoản? ';
    authErrorEl.textContent     = '';
    authErrorEl.style.color     = 'var(--danger)';
    authModal.classList.remove('hidden');
    authOverlay.classList.remove('hidden');
    authEmailEl.focus();
  }

  function closeModal() {
    authModal.classList.add('hidden');
    authOverlay.classList.add('hidden');
    authForm.reset();
    authErrorEl.textContent = '';
  }

  authClose.addEventListener('click', closeModal);
  authOverlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  authSwitchBtn.addEventListener('click', () => openModal(authMode === 'login' ? 'signup' : 'login'));

  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    authErrorEl.textContent  = '';
    authSubmitEl.disabled    = true;
    authSubmitEl.textContent = 'Đang xử lý…';
    const email    = authEmailEl.value.trim();
    const password = authPasswordEl.value;
    try {
      const { data, error } = authMode === 'login'
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (authMode === 'signup' && !data.session) {
        authErrorEl.style.color = 'var(--success)';
        authErrorEl.textContent = 'Kiểm tra email để xác nhận tài khoản!';
      } else {
        closeModal();
      }
    } catch (err) {
      authErrorEl.style.color = 'var(--danger)';
      authErrorEl.textContent = err.message || 'Lỗi đăng nhập';
    } finally {
      authSubmitEl.disabled = false;
      authSubmitEl.textContent = authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
    }
  });

  function renderUserSection() {
    if (!sbUser) {
      userSection.innerHTML = `
        <button class="signin-btn" id="signin-btn" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Đăng nhập
        </button>`;
      $('signin-btn').addEventListener('click', () => openModal('login'));
    } else {
      const initial = (sbUser.email || '?')[0].toUpperCase();
      userSection.innerHTML = `
        <div class="user-info">
          <div class="user-avatar">${escHtml(initial)}</div>
          <span class="user-email" title="${escHtml(sbUser.email)}">${escHtml(sbUser.email)}</span>
          <button class="signout-btn" id="signout-btn" type="button" title="Đăng xuất">↪</button>
        </div>`;
      $('signout-btn').addEventListener('click', () => sb.auth.signOut());
    }
  }

  _sbPushHistory = async function(item) {
    if (!sbUser) return;
    try {
      await sb.from('yana_history').insert({
        user_id: sbUser.id, task: item.task,
        route: item.route || null, ts: item.ts,
      });
    } catch (_) {}
  };

  async function loadHistoryFromSupabase() {
    if (!sbUser) return;
    try {
      const { data, error } = await sb.from('yana_history')
        .select('task, route, ts').eq('user_id', sbUser.id)
        .order('ts', { ascending: false }).limit(MAX_HISTORY);
      if (error || !data) return;
      const existingTs = new Set(chatHistory.map(h => h.ts));
      for (const row of data) {
        if (!existingTs.has(row.ts))
          chatHistory.push({ task: row.task, route: row.route || '', ts: row.ts });
      }
      chatHistory.sort((a, b) => b.ts - a.ts);
      if (chatHistory.length > MAX_HISTORY) chatHistory.length = MAX_HISTORY;
      saveHistory(chatHistory);
      renderHistory();
    } catch (_) {}
  }

  _sbSaveApiKey = async function(provider, key) {
    if (!sbUser) return;
    try {
      const { data } = await sb.from('yana_settings')
        .select('api_keys').eq('user_id', sbUser.id).single();
      const keys = { ...(data?.api_keys || {}), [provider]: key };
      await sb.from('yana_settings').upsert({
        user_id: sbUser.id, api_keys: keys,
        updated_at: new Date().toISOString(),
      });
    } catch (_) {}
  };

  async function loadApiKeysFromSupabase() {
    if (!sbUser) return;
    try {
      const { data, error } = await sb.from('yana_settings')
        .select('api_keys').eq('user_id', sbUser.id).single();
      if (error || !data?.api_keys) return;
      for (const [provider, key] of Object.entries(data.api_keys)) {
        if (key) localStorage.setItem(LS_KEY_PREFIX + provider, key);
      }
      syncKeyStatus();
    } catch (_) {}
  }

  async function init() {
    const { data: { session } } = await sb.auth.getSession();
    sbUser = session?.user ?? null;
    renderUserSection();
    if (sbUser) {
      await loadHistoryFromSupabase();
      await loadApiKeysFromSupabase();
    }
    sb.auth.onAuthStateChange(async (_event, session) => {
      sbUser = session?.user ?? null;
      renderUserSection();
      if (sbUser) {
        await loadHistoryFromSupabase();
        await loadApiKeysFromSupabase();
      }
    });
  }

  init().catch(() => {});
})();
