'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const { createCore } = require('yamtam-core');
const { route, loadSystemPrompt, findBestSkill, loadSkillPrompt, skillCount } = createCore({
  rootDir: path.join(__dirname, '..', '..'),
});

const PORT         = process.env.PORT || 8081;
// Loopback by default — Electron and Web Preview both talk to 127.0.0.1.
// Docker/remote deploys opt in explicitly with HOST=0.0.0.0.
const HOST         = process.env.HOST || '127.0.0.1';
const STATIC_DIR   = __dirname;
const MANIFEST_PATH = path.join(__dirname, '..', '..', 'MANIFEST.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// ── Provider table ────────────────────────────────────────────────────────────
// images = [{ mimeType: 'image/jpeg', data: '<base64>' }]
const PROVIDERS = {
  anthropic: {
    hostname:     'api.anthropic.com',
    path:         '/v1/messages',
    vision:       true,
    defaultModel: 'claude-sonnet-4-6',
    headers: key => ({
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    }),
    body: (model, system, task, images) => {
      const content = (images && images.length)
        ? [
            ...images.map(img => ({
              type: 'image',
              source: { type: 'base64', media_type: img.mimeType, data: img.data },
            })),
            { type: 'text', text: task },
          ]
        : task;
      return JSON.stringify({
        model, max_tokens: 2048, system, stream: true,
        messages: [{ role: 'user', content }],
      });
    },
    extractText: evt => evt?.delta?.text || null,
  },

  groq: {
    hostname:     'api.groq.com',
    path:         '/openai/v1/chat/completions',
    vision:       false,
    defaultModel: 'llama-3.3-70b-versatile',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true,
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
  },

  openai: {
    hostname:     'api.openai.com',
    path:         '/v1/chat/completions',
    vision:       true,
    defaultModel: 'gpt-4o-mini',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task, images) => {
      const userContent = (images && images.length)
        ? [
            ...images.map(img => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
            { type: 'text', text: task },
          ]
        : task;
      return JSON.stringify({
        model, max_tokens: 2048, stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userContent },
        ],
      });
    },
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
  },

  gemini: {
    hostname:     'generativelanguage.googleapis.com',
    vision:       true,
    defaultModel: 'gemini-2.0-flash',
    // Key goes in the x-goog-api-key header, never the URL — query strings
    // leak into access logs and proxies (API2: broken authentication).
    buildPath: (model, _key) =>
      `/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    headers: key => ({ 'content-type': 'application/json', 'x-goog-api-key': key }),
    body: (model, system, task, images) => {
      const parts = [
        ...(images || []).map(img => ({
          inlineData: { mimeType: img.mimeType, data: img.data },
        })),
        { text: task },
      ];
      return JSON.stringify({
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { maxOutputTokens: 2048 },
      });
    },
    extractText: evt => evt?.candidates?.[0]?.content?.parts?.[0]?.text || null,
  },

  deepseek: {
    hostname:     'api.deepseek.com',
    path:         '/v1/chat/completions',
    vision:       false,
    defaultModel: 'deepseek-chat',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true,
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
  },

  openrouter: {
    hostname:     'openrouter.ai',
    path:         '/api/v1/chat/completions',
    vision:       true,
    defaultModel: 'google/gemma-3-27b-it',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
      'HTTP-Referer':  'https://github.com/phamlongh230-lgtm/yamtam-engine',
      'X-Title':       'Yana AI',
    }),
    body: (model, system, task, images) => {
      const userContent = (images && images.length)
        ? [
            ...images.map(img => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
            { type: 'text', text: task },
          ]
        : task;
      return JSON.stringify({
        model, max_tokens: 2048, stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userContent },
        ],
      });
    },
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
  },
};

// ── Codebase BM25 index (in-memory, server-scoped) ────────────────────────────
const CODEBASE = { chunks: [], df: {}, N: 0, avgLen: 1 };
const STOP = new Set(['the','a','an','is','in','of','to','and','or','for','with','that','this','it','be','as','at','by','from','on','are','was','has','had','have','will','do','not','but','if','so','we','you','can','all','its','new','const','let','var','return','function','class','import','export','default']);

function codeTokenize(text) {
  return (text.toLowerCase().match(/\b[a-z_$][a-z0-9_$]{0,}\b/g) || [])
    .filter(t => t.length >= 2 && !STOP.has(t));
}

function rebuildIndex(chunks) {
  const df = {};
  for (const c of chunks) for (const t of new Set(c.tokens)) df[t] = (df[t] || 0) + 1;
  CODEBASE.chunks = chunks;
  CODEBASE.N      = chunks.length;
  CODEBASE.df     = df;
  CODEBASE.avgLen = chunks.length ? chunks.reduce((s, c) => s + c.tokens.length, 0) / chunks.length : 1;
}

function bm25Search(query, topK) {
  const qTokens = codeTokenize(query);
  if (!qTokens.length || !CODEBASE.N) return [];
  const { chunks, df, N, avgLen } = CODEBASE;
  const K1 = 1.5, B = 0.75;
  return chunks
    .map(c => {
      const tf = {};
      for (const t of c.tokens) tf[t] = (tf[t] || 0) + 1;
      let score = 0;
      for (const t of qTokens) {
        if (!tf[t]) continue;
        const idf = Math.log((N - (df[t] || 0) + 0.5) / ((df[t] || 0) + 0.5) + 1);
        score += idf * (tf[t] * (K1 + 1)) / (tf[t] + K1 * (1 - B + B * c.tokens.length / avgLen));
      }
      return { ...c, score };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK || 3);
}

function makeChunks(name, content, maxLines) {
  const M = maxLines || 60;
  const lines = content.split('\n');
  if (lines.length <= M) return [{ file: name, line: 1, content, tokens: codeTokenize(content) }];
  const out = [];
  for (let i = 0; i < lines.length; i += M) {
    const slice = lines.slice(i, i + M).join('\n');
    out.push({ file: name, line: i + 1, content: slice, tokens: codeTokenize(slice) });
  }
  return out;
}

// ── POST /api/index ────────────────────────────────────────────────────────────
async function handleApiIndex(req, res) {
  let body;
  try { body = await readBody(req, 6 * 1024 * 1024); }
  catch (e) { jsonError(res, e && e.status === 413 ? 413 : 400, 'Payload too large'); return; }

  let parsed;
  try { parsed = JSON.parse(body); } catch (_) { jsonError(res, 400, 'Invalid JSON'); return; }

  const files = parsed.files;
  if (!Array.isArray(files)) { jsonError(res, 400, 'files must be an array'); return; }

  if (!files.length) {
    rebuildIndex([]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ indexed: 0, chunks: 0, skipped: 0 }));
    return;
  }

  const MAX_FILE = 100 * 1024;
  const allChunks = [];
  let indexed = 0, skipped = 0;

  for (const f of files.slice(0, 500)) {
    if (!f.name || typeof f.content !== 'string') continue;
    if (f.content.length > MAX_FILE) { skipped++; continue; }
    // Skip binary-looking content
    const nonPrint = (f.content.match(/[^\x09\x0a\x0d\x20-\x7e]/g) || []).length;
    if (f.content.length > 20 && nonPrint / f.content.length > 0.15) { skipped++; continue; }
    allChunks.push(...makeChunks(f.name, f.content));
    indexed++;
  }

  rebuildIndex(allChunks.slice(0, 3000));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ indexed, chunks: CODEBASE.N, skipped }));
}

// ── Security: response headers + per-IP rate limit ────────────────────────────
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options':        'DENY',
  'Referrer-Policy':        'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; " + // Babel standalone needs eval + inline
    "style-src 'self' 'unsafe-inline' https://fonts.bunny.net; " +
    "font-src https://fonts.bunny.net; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self'",
};

function applySecurityHeaders(res) {
  for (const [k, v] of Object.entries(SEC_HEADERS)) res.setHeader(k, v);
}

const RATE = { windowMs: 60_000, max: 60, hits: new Map() };

function rateLimited(req) {
  const ip  = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let rec = RATE.hits.get(ip);
  if (!rec || now - rec.start > RATE.windowMs) rec = { count: 0, start: now };
  rec.count++;
  RATE.hits.set(ip, rec);
  if (RATE.hits.size > 1000) {
    for (const [k, v] of RATE.hits) if (now - v.start > RATE.windowMs) RATE.hits.delete(k);
  }
  return rec.count > RATE.max;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function readBody(req, maxBytes) {
  const limit = maxBytes || 16 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let oversized = false;
    req.on('data', chunk => {
      if (oversized) return;
      size += chunk.length;
      if (size > limit) { oversized = true; reject({ status: 413 }); req.resume(); return; }
      chunks.push(chunk);
    });
    req.on('end',   () => { if (!oversized) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', err => { if (!oversized) reject(err); });
  });
}

function serveStatic(res, reqPath) {
  const filePath = path.resolve(STATIC_DIR, '.' + reqPath);
  const rel = path.relative(STATIC_DIR, filePath);
  const escapes  = rel.startsWith('..') || path.isAbsolute(rel);
  const hidden   = rel.split(path.sep).some(seg => seg.startsWith('.') || seg === 'node_modules');
  if (escapes || hidden) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); return;
  }
  const contentType = MIME[path.extname(filePath)] || 'text/plain';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function jsonError(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: msg }));
}

// ── GET /api/status ───────────────────────────────────────────────────────────
function handleApiStatus(req, res) {
  fs.readFile(MANIFEST_PATH, 'utf8', (err, data) => {
    if (err) { jsonError(res, 500, 'Cannot read MANIFEST.json'); return; }
    try {
      const m = JSON.parse(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        version: m.version        || '?',
        skills:  m.skills_count   || skillCount(),
        agents:  m.agents_count   || 0,
        hooks:   m.hooks_count    || 0,
        scripts: m.scripts_count  || 0,
        rules:   m.rules_count    || 0,
      }));
    } catch (_) { jsonError(res, 500, 'Malformed MANIFEST.json'); }
  });
}

// ── POST /api/models — fetch live model list from provider ────────────────────
async function handleApiModels(req, res) {
  let body;
  try { body = await readBody(req, 4096); }
  catch (e) { jsonError(res, e && e.status === 413 ? 413 : 400, 'Bad request'); return; }

  let parsed;
  try { parsed = JSON.parse(body); } catch (_) { jsonError(res, 400, 'Invalid JSON'); return; }

  const { provider, key } = parsed;
  if (!provider || !key) { jsonError(res, 400, 'Missing provider or key'); return; }

  const LIVE_PROVIDERS = {
    openrouter: {
      hostname: 'openrouter.ai',
      path:     '/api/v1/models',
      headers:  k => ({
        'Authorization': `Bearer ${k}`,
        'HTTP-Referer':  'https://github.com/phamlongh230-lgtm/yamtam-engine',
        'X-Title':       'Yana AI',
      }),
      transform: data => (data.data || [])
        .filter(m => m.id)
        .map(m => ({ id: m.id, name: m.name || m.id }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    },
    groq: {
      hostname: 'api.groq.com',
      path:     '/openai/v1/models',
      headers:  k => ({ 'Authorization': `Bearer ${k}` }),
      transform: data => (data.data || [])
        .filter(m => m.id && !m.id.startsWith('whisper') && !m.id.startsWith('distil'))
        .map(m => ({ id: m.id, name: m.id }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    },
  };

  const prov = LIVE_PROVIDERS[provider];
  if (!prov) { jsonError(res, 400, `Provider "${provider}" has no live model API`); return; }

  const options = { hostname: prov.hostname, path: prov.path, method: 'GET',
                    headers: prov.headers(key) };

  https.get(options, upRes => {
    let raw = '';
    upRes.on('data', c => { raw += c; });
    upRes.on('end', () => {
      if (upRes.statusCode < 200 || upRes.statusCode >= 300) {
        jsonError(res, 502, `Upstream HTTP ${upRes.statusCode}`); return;
      }
      try {
        const models = prov.transform(JSON.parse(raw));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models }));
      } catch (_) { jsonError(res, 502, 'Malformed upstream response'); }
    });
  }).on('error', () => jsonError(res, 502, 'Upstream connection failed'));
}

// ── POST /api/route (enhanced: adds suggested_skill for complex tasks) ────────
async function handleApiRoute(req, res) {
  let body;
  try { body = await readBody(req, 16 * 1024); }
  catch (e) { jsonError(res, e && e.status === 413 ? 413 : 400, 'Bad request'); return; }

  let parsed;
  try { parsed = JSON.parse(body); } catch (_) { jsonError(res, 400, 'Invalid JSON'); return; }
  if (!parsed.task || typeof parsed.task !== 'string' || !parsed.task.trim()) {
    jsonError(res, 400, 'Missing or empty task'); return;
  }

  try {
    const decision = await route(parsed.task);
    if (decision.route === 'complex') {
      const skill = findBestSkill(parsed.task);
      if (skill) decision.suggested_skill = skill;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(decision));
  } catch (_) { jsonError(res, 500, 'Routing error'); }
}

// ── Usage tracking — real numbers for the UI (in-memory, per server session) ──
const USAGE = Object.create(null); // provider -> { requests, chars, totalMs, lastTs }

function recordUsage(provider, chars, ms) {
  const u = USAGE[provider] || (USAGE[provider] = { requests: 0, chars: 0, totalMs: 0, lastTs: 0 });
  u.requests++;
  u.chars   += chars;
  u.totalMs += ms;
  u.lastTs   = Date.now();
}

// GET /api/usage — per-provider session stats (tokens are a chars/4 estimate)
function handleApiUsage(req, res) {
  const out = {};
  for (const [k, u] of Object.entries(USAGE)) {
    out[k] = {
      requests:       u.requests,
      est_tokens:     Math.round(u.chars / 4),
      avg_latency_ms: u.requests ? Math.round(u.totalMs / u.requests) : 0,
      last_used:      u.lastTs,
    };
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ usage: out }));
}

// ── GET /api/dashboard — real system state (L1 memory, audit log, uptime) ─────
const L1_DIR     = path.join(__dirname, '..', '..', 'memory', 'L1_atomic');
const AUDIT_LOG  = path.join(__dirname, '..', '..', 'core', 'memory', 'audit', 'agent-actions.log');
const AGENTS_DIR = path.join(__dirname, '..', '..', 'core', 'agents');
const SKILLS_DIR = path.join(__dirname, '..', '..', 'core', 'skills');

function fmHeader(file, maxBytes) {
  // First N bytes of a markdown file — enough for YAML frontmatter
  return fs.readFileSync(file, 'utf8').slice(0, maxBytes || 2048);
}

function fmField(head, key) {
  const m = head.match(new RegExp('^' + key + ':\\s*(.+)$', 'm'));
  return m ? m[1].trim() : null;
}

function readL1Entries() {
  let files = [];
  try { files = fs.readdirSync(L1_DIR).filter(f => f.startsWith('fact-') && f.endsWith('.md')); }
  catch (_) { return []; }

  return files.map(f => {
    const p = path.join(L1_DIR, f);
    let mtime = 0, head = '';
    try { mtime = fs.statSync(p).mtimeMs; head = fmHeader(p); } catch (_) {}
    return {
      id:         f.replace(/\.md$/, ''),
      kind:       fmField(head, 'type')       || 'fact',
      text:       fmField(head, 'statement')  || f.replace(/^fact-/, '').replace(/\.md$/, '').replace(/-/g, ' '),
      source:     fmField(head, 'source')     || '',
      confidence: fmField(head, 'confidence') || '',
      mtime,
    };
  }).sort((a, b) => b.mtime - a.mtime);
}

function readL1Facts() {
  const entries = readL1Entries();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  return {
    total:  entries.length,
    today:  entries.filter(e => e.mtime >= dayStart.getTime()).length,
    recent: entries.slice(0, 3).map(e => ({ kind: e.kind, text: e.text })),
  };
}

// GET /api/memories — every L1 atomic fact with metadata
function handleApiMemories(req, res) {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const entries = readL1Entries().map(e => ({ ...e, fresh: e.mtime >= dayStart.getTime() }));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ total: entries.length, memories: entries }));
}

// GET /api/agents — real agent catalog from core/agents/ (name + description
// from frontmatter, category from subdirectory)
let AGENTS_CACHE = null;
function handleApiAgents(req, res) {
  if (!AGENTS_CACHE) {
    const agents = [];
    const collect = (dir, category) => {
      let items = [];
      try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const it of items) {
        if (it.isFile() && it.name.endsWith('.md')) {
          let head = '';
          try { head = fmHeader(path.join(dir, it.name), 1024); } catch (_) {}
          const description = fmField(head, 'description');
          if (!description) continue;   // identity docs / journals are not agents
          agents.push({
            name: fmField(head, 'name') || it.name.replace(/\.md$/, ''),
            description: description.slice(0, 180),
            category,
          });
        } else if (it.isDirectory() && category === 'general' && it.name !== 'emotions') {
          collect(path.join(dir, it.name), it.name);   // category dirs; emotions/ holds journals, not agents
        }
      }
    };
    collect(AGENTS_DIR, 'general');
    agents.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    AGENTS_CACHE = agents;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ total: AGENTS_CACHE.length, agents: AGENTS_CACHE }));
}

// GET /api/skills — real skill counts grouped by import pack (author--skill)
let SKILLS_CACHE = null;
function handleApiSkills(req, res) {
  if (!SKILLS_CACHE) {
    let names = [];
    try {
      names = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .map(d => d.name);
    } catch (_) {}
    const packs = {};
    let standalone = 0;
    for (const n of names) {
      const i = n.indexOf('--');
      if (i > 0) packs[n.slice(0, i)] = (packs[n.slice(0, i)] || 0) + 1;
      else standalone++;
    }
    SKILLS_CACHE = {
      total:      names.length,
      standalone,
      pack_count: Object.keys(packs).length,
      packs: Object.entries(packs).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([name, count]) => ({ name, count })),
    };
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(SKILLS_CACHE));
}

function readAuditStats() {
  let raw = '';
  try {
    const { size } = fs.statSync(AUDIT_LOG);
    const start = Math.max(0, size - 256 * 1024);   // tail only — log is append-only
    const fd  = fs.openSync(AUDIT_LOG, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    raw = buf.toString('utf8');
  } catch (_) { return { events_today: 0, blocked_today: 0, last_incident: null }; }

  const today = new Date().toISOString().slice(0, 10);
  let events = 0, blocked = 0, lastIncident = null;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const isToday = line.startsWith(today);
    if (isToday) events++;
    if (/VIOLATION|BLOCK/.test(line)) {
      if (isToday) blocked++;
      lastIncident = line.slice(0, 20);   // lines are chronological — last wins
    }
  }
  return { events_today: events, blocked_today: blocked, last_incident: lastIncident };
}

function handleApiDashboard(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    memories: readL1Facts(),
    safety:   readAuditStats(),
    uptime_s: Math.round(process.uptime()),
  }));
}

// ── SSE normalize: upstream SSE → unified data: {"text":"..."} ────────────────
function pipeNormalizedSSE(upstreamRes, res, extractText, onDone) {
  let buf = '';
  let chars = 0;
  upstreamRes.on('data', chunk => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    chars += emitLines(lines, res, extractText);
  });
  upstreamRes.on('end', () => {
    if (buf) chars += emitLines(buf.split('\n'), res, extractText);
    res.write('data: [DONE]\n\n');
    res.end();
    if (onDone) onDone(chars);
  });
}

function emitLines(lines, res, extractText) {
  let emitted = 0;
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const raw = line.slice(6).trim();
    if (raw === '[DONE]') return emitted;
    try {
      const text = extractText(JSON.parse(raw));
      if (text) { emitted += text.length; res.write(`data: ${JSON.stringify({ text })}\n\n`); }
    } catch (_) {}
  }
  return emitted;
}

// ── POST /api/chat ────────────────────────────────────────────────────────────
async function handleApiChat(req, res) {
  let body;
  try { body = await readBody(req, 10 * 1024 * 1024); }  // 10 MB for images
  catch (e) { jsonError(res, e && e.status === 413 ? 413 : 400, 'Bad request'); return; }

  let parsed;
  try { parsed = JSON.parse(body); } catch (_) { jsonError(res, 400, 'Invalid JSON'); return; }

  const { task, apiKey, suggestedAgents, model, provider: providerKey, skill, images, useIndex } = parsed;
  if (!apiKey || typeof apiKey !== 'string') { jsonError(res, 400, 'Missing apiKey'); return; }
  if (!task   || typeof task   !== 'string' || !task.trim()) { jsonError(res, 400, 'Missing task'); return; }

  // System prompt: skill → agent → generic fallback
  let systemPrompt = null;
  if (skill && typeof skill === 'string') systemPrompt = loadSkillPrompt(skill);
  if (!systemPrompt) systemPrompt = loadSystemPrompt(Array.isArray(suggestedAgents) ? suggestedAgents : []);

  // Codebase context injection via BM25 retrieval
  if (useIndex && CODEBASE.N > 0) {
    const hits = bm25Search(task, 3);
    if (hits.length > 0) {
      const ctx = hits.map(h => `// ${h.file}${h.line > 1 ? ` (line ${h.line}+)` : ''}\n${h.content}`).join('\n\n---\n\n');
      systemPrompt = `[CODEBASE CONTEXT]\n${ctx}\n\n---\n\n${systemPrompt}`;
    }
  }

  const p       = PROVIDERS[providerKey] || PROVIDERS.anthropic;
  const modelId = (typeof model === 'string' && model.trim()) ? model.trim() : p.defaultModel;
  // images: array of { mimeType, data } — only passed if provider supports vision
  const imgs    = (p.vision && Array.isArray(images) && images.length) ? images : null;
  const reqBody = p.body(modelId, systemPrompt, task, imgs);

  // Gemini embeds the API key in the path instead of a header
  const reqPath = p.buildPath ? p.buildPath(modelId, apiKey) : p.path;

  const options = {
    hostname: p.hostname,
    path:     reqPath,
    method:   'POST',
    headers:  { ...p.headers(apiKey), 'content-length': Buffer.byteLength(reqBody) },
  };

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });

  const t0 = Date.now();
  const usageId = (typeof providerKey === 'string' && providerKey) ? providerKey : 'claude';

  const upstreamReq = https.request(options, upstreamRes => {
    if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
      let errBody = '';
      upstreamRes.on('data', c => { errBody += c; });
      upstreamRes.on('end', () => {
        let detail = '';
        try { const j = JSON.parse(errBody); detail = j.error?.message || j.message || ''; } catch (_) {}
        const msg = `Upstream HTTP ${upstreamRes.statusCode}${detail ? ': ' + detail : ''}`;
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.end();
      });
      return;
    }
    pipeNormalizedSSE(upstreamRes, res, p.extractText,
      chars => recordUsage(usageId, chars, Date.now() - t0));
  });

  upstreamReq.on('error', () => {
    res.write(`data: ${JSON.stringify({ error: 'Upstream connection failed' })}\n\n`);
    res.end();
  });

  upstreamReq.write(reqBody);
  upstreamReq.end();
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const pathname = (url.parse(req.url || '/').pathname || '/');
  const method   = req.method || 'GET';

  applySecurityHeaders(res);

  if (method === 'POST' && rateLimited(req)) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
    res.end(JSON.stringify({ error: 'Too many requests' }));
    return;
  }

  if (method === 'GET'  && pathname === '/health')      { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, skills: skillCount() })); return; }
  if (method === 'GET'  && pathname === '/api/status')  { handleApiStatus(req, res);  return; }
  if (method === 'GET'  && pathname === '/api/usage')   { handleApiUsage(req, res);   return; }
  if (method === 'GET'  && pathname === '/api/dashboard') { handleApiDashboard(req, res); return; }
  if (method === 'GET'  && pathname === '/api/agents')    { handleApiAgents(req, res);    return; }
  if (method === 'GET'  && pathname === '/api/memories')  { handleApiMemories(req, res);  return; }
  if (method === 'GET'  && pathname === '/api/skills')    { handleApiSkills(req, res);    return; }
  if (method === 'POST' && pathname === '/api/models')  { handleApiModels(req, res);  return; }
  if (method === 'POST' && pathname === '/api/index')   { await handleApiIndex(req, res); return; }
  if (method === 'POST' && pathname === '/api/route')   { await handleApiRoute(req, res); return; }
  if (method === 'POST' && pathname === '/api/chat')    { await handleApiChat(req, res);  return; }
  if (method === 'GET')                                 { serveStatic(res, pathname === '/' ? '/index.html' : pathname); return; }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, HOST, () => {
  console.log(`Yana AI on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} — ${skillCount()} skills indexed`);
});

module.exports = server;
