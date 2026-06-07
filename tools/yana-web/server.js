'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const { route }            = require('./router.js');
const { loadSystemPrompt } = require('./agents.js');
const { findBestSkill, loadSkillPrompt, skillCount } = require('./skills.js');

const PORT         = process.env.PORT || 8081;
const STATIC_DIR   = __dirname;
const MANIFEST_PATH = path.join(__dirname, '..', '..', 'MANIFEST.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// ── Provider table ────────────────────────────────────────────────────────────
const PROVIDERS = {
  anthropic: {
    hostname:     'api.anthropic.com',
    path:         '/v1/messages',
    defaultModel: 'claude-sonnet-4-6',
    headers: key => ({
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, system, stream: true,
      messages: [{ role: 'user', content: task }],
    }),
    extractText: evt => evt?.delta?.text || null,
  },

  groq: {
    hostname:     'api.groq.com',
    path:         '/openai/v1/chat/completions',
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
    defaultModel: 'gpt-4o-mini',
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
};

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
  if (reqPath.includes('..')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Bad Request'); return;
  }
  const filePath = path.join(STATIC_DIR, reqPath);
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

// ── SSE normalize: upstream SSE → unified data: {"text":"..."} ────────────────
function pipeNormalizedSSE(upstreamRes, res, extractText) {
  let buf = '';
  upstreamRes.on('data', chunk => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    emitLines(lines, res, extractText);
  });
  upstreamRes.on('end', () => {
    if (buf) emitLines(buf.split('\n'), res, extractText);
    res.write('data: [DONE]\n\n');
    res.end();
  });
}

function emitLines(lines, res, extractText) {
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const raw = line.slice(6).trim();
    if (raw === '[DONE]') return;
    try {
      const text = extractText(JSON.parse(raw));
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    } catch (_) {}
  }
}

// ── POST /api/chat ────────────────────────────────────────────────────────────
async function handleApiChat(req, res) {
  let body;
  try { body = await readBody(req, 32 * 1024); }
  catch (e) { jsonError(res, e && e.status === 413 ? 413 : 400, 'Bad request'); return; }

  let parsed;
  try { parsed = JSON.parse(body); } catch (_) { jsonError(res, 400, 'Invalid JSON'); return; }

  const { task, apiKey, suggestedAgents, model, provider: providerKey, skill } = parsed;
  if (!apiKey || typeof apiKey !== 'string') { jsonError(res, 400, 'Missing apiKey'); return; }
  if (!task   || typeof task   !== 'string' || !task.trim()) { jsonError(res, 400, 'Missing task'); return; }

  // System prompt: skill → agent → generic fallback
  let systemPrompt = null;
  if (skill && typeof skill === 'string') systemPrompt = loadSkillPrompt(skill);
  if (!systemPrompt) systemPrompt = loadSystemPrompt(Array.isArray(suggestedAgents) ? suggestedAgents : []);

  const p       = PROVIDERS[providerKey] || PROVIDERS.anthropic;
  const modelId = (typeof model === 'string' && model.trim()) ? model.trim() : p.defaultModel;
  const reqBody = p.body(modelId, systemPrompt, task);

  const options = {
    hostname: p.hostname,
    path:     p.path,
    method:   'POST',
    headers:  { ...p.headers(apiKey), 'content-length': Buffer.byteLength(reqBody) },
  };

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });

  const upstreamReq = https.request(options, upstreamRes => {
    if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
      res.write(`data: ${JSON.stringify({ error: `Upstream HTTP ${upstreamRes.statusCode}` })}\n\n`);
      res.end(); return;
    }
    pipeNormalizedSSE(upstreamRes, res, p.extractText);
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

  if (method === 'GET'  && pathname === '/health')      { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, skills: skillCount() })); return; }
  if (method === 'GET'  && pathname === '/api/status')  { handleApiStatus(req, res);  return; }
  if (method === 'POST' && pathname === '/api/route')   { await handleApiRoute(req, res); return; }
  if (method === 'POST' && pathname === '/api/chat')    { await handleApiChat(req, res);  return; }
  if (method === 'GET')                                 { serveStatic(res, pathname === '/' ? '/index.html' : pathname); return; }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Yana Web on http://localhost:${PORT} — ${skillCount()} skills indexed`);
});

module.exports = server;
