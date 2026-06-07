'use strict';

const LS_KEY = 'yana-api-key';

// ── Element refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const keyInput     = $('api-key-input');
const saveKeyBtn   = $('save-key-btn');
const keyStatus    = $('key-status');
const taskInput    = $('task-input');
const runBtn       = $('run-btn');
const routeCard    = $('route-card');
const routeValue   = $('route-value');
const gateValue    = $('gate-value');
const confidenceEl = $('confidence-value');
const sourceBadge  = $('source-badge');
const agentsRow    = $('agents-row');
const agentsValue  = $('agents-value');
const signalsRow   = $('signals-row');
const signalsValue = $('signals-value');
const reasonValue  = $('reason-value');
const resultCard   = $('result-card');
const resultText   = $('result-text');
const historyList  = $('history-list');

// ── API key ───────────────────────────────────────────────────────────────────
function getKey()  { return localStorage.getItem(LS_KEY) || ''; }

function syncKeyStatus() {
  const saved = !!getKey();
  keyStatus.textContent = saved ? 'saved' : 'no key';
  keyStatus.classList.toggle('saved', saved);
}

saveKeyBtn.addEventListener('click', () => {
  const val = keyInput.value.trim();
  if (val) {
    localStorage.setItem(LS_KEY, val);
    keyInput.value = '';
  } else {
    localStorage.removeItem(LS_KEY);
  }
  syncKeyStatus();
});

syncKeyStatus();

// ── Show / hide helpers ───────────────────────────────────────────────────────
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');

// ── Route card renderer ───────────────────────────────────────────────────────
function renderRoute(d) {
  routeValue.textContent = d.route || '?';
  routeValue.setAttribute('data-route', d.route || '');

  gateValue.textContent = d.gate || '?';

  confidenceEl.textContent = d.confidence != null
    ? Math.round(d.confidence * 100) + '%'
    : '?';

  const src = d.source || 'fallback';
  sourceBadge.textContent = src;
  sourceBadge.setAttribute('data-source', src);

  reasonValue.textContent = d.reason || '';

  const agents = Array.isArray(d.suggested_agents) ? d.suggested_agents : [];
  agentsValue.textContent = agents.join(', ');
  agents.length > 0 ? show(agentsRow) : hide(agentsRow);

  const signals = Array.isArray(d.matched_signals) ? d.matched_signals : [];
  signalsValue.textContent = signals.join(', ');
  signals.length > 0 ? show(signalsRow) : hide(signalsRow);

  show(routeCard);
}

// ── SSE streaming ─────────────────────────────────────────────────────────────
function streamChat(task, apiKey, suggestedAgents) {
  resultText.textContent = '';
  show(resultCard);

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, apiKey, suggestedAgents }),
  }).then(res => {
    if (!res.ok || !res.body) {
      resultText.textContent = `HTTP error ${res.status}`;
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    function pump() {
      reader.read().then(({ done, value }) => {
        if (done) return;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') return;
          try {
            const evt = JSON.parse(raw);
            const text = evt?.delta?.text;
            if (text) resultText.textContent += text;
          } catch (_) {}
        }
        pump();
      }).catch(err => {
        resultText.textContent += `\n[stream error: ${err.message}]`;
      });
    }
    pump();
  }).catch(err => {
    resultText.textContent = `Error: ${err.message}`;
  });
}

// ── Run ───────────────────────────────────────────────────────────────────────
runBtn.addEventListener('click', async () => {
  const task = taskInput.value.trim();
  if (!task) { taskInput.focus(); return; }

  hide(routeCard);
  hide(resultCard);
  runBtn.disabled = true;
  runBtn.textContent = 'Routing…';

  try {
    const res = await fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task }),
    });
    const decision = await res.json();
    renderRoute(decision);

    if (decision.route === 'external') {
      resultText.textContent =
        '⚠ External action detected — manual confirmation required before proceeding.';
      show(resultCard);
    } else if (!getKey()) {
      resultText.textContent = 'Save your Anthropic API key above to get an AI response.';
      show(resultCard);
    } else {
      streamChat(task, getKey(), decision.suggested_agents || []);
    }

    pushHistory(task, decision.route);
  } catch (err) {
    resultText.textContent = `Error: ${err.message}`;
    show(resultCard);
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Run';
  }
});

// Allow Ctrl+Enter in textarea to run
taskInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runBtn.click();
});

// ── History ───────────────────────────────────────────────────────────────────
const history = [];
const MAX_HISTORY = 20;

function pushHistory(task, route) {
  history.unshift({ task, route });
  if (history.length > MAX_HISTORY) history.pop();
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historyList.innerHTML = '<li class="history-empty">No tasks yet</li>';
    return;
  }
  historyList.innerHTML = '';
  for (const item of history) {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.tabIndex = 0;

    const taskEl = document.createElement('div');
    taskEl.className = 'history-task';
    taskEl.textContent = item.task;

    const metaEl = document.createElement('div');
    metaEl.className = 'history-meta';
    metaEl.textContent = item.route;

    li.appendChild(taskEl);
    li.appendChild(metaEl);

    const restore = () => { taskInput.value = item.task; taskInput.focus(); };
    li.addEventListener('click', restore);
    li.addEventListener('keydown', e => { if (e.key === 'Enter') restore(); });

    historyList.appendChild(li);
  }
}

renderHistory();
