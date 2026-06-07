'use strict';

const LS_KEY_PREFIX = 'yana-api-key-';

const PROVIDER_MODELS = {
  anthropic: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-8'],
  groq:      ['llama-3.3-70b-versatile', 'qwen-qwq-32b', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
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
  if (val) { localStorage.setItem(lsKey(), val); keyInput.value = ''; }
  else     { localStorage.removeItem(lsKey()); }
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

// ── Run ────────────────────────────────────────────────────────────────────────
async function runTask() {
  const task = taskInput.value.trim();
  if (!task) { taskInput.focus(); return; }

  addUserMsg(task);
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

// ── History ────────────────────────────────────────────────────────────────────
const chatHistory = [];
const MAX_HISTORY = 20;

function pushHistory(task, route) {
  chatHistory.unshift({ task, route });
  if (chatHistory.length > MAX_HISTORY) chatHistory.pop();
  renderHistory();
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
    li.innerHTML = `
      <div class="history-task">${escHtml(item.task)}</div>
      <div class="history-meta">${escHtml(item.route || '')}</div>`;
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

renderHistory();
