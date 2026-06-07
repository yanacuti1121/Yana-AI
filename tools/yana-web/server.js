'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const { route }           = require('./router.js');
const { loadSystemPrompt } = require('./agents.js');

const PORT       = process.env.PORT || 8081;
const STATIC_DIR = __dirname;

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
      'x-api-key':          key,
      'anthropic-version':  '2023-06-01',
      'content-type':       'application/json',
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

// ── Body reader ───────────────────────────────────────────────────────────────
function readBody(req, maxBytes) {
  const limit = maxBytes || 16 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let oversized = false;
    req.on('data', chunk => {
      if (oversized) return;
      size += chunk.length;
      if (size > limit) {
        oversized = true;
        reject({ status: 413, message: 'Request body too large' });
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end',   () => { if (!oversized) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', err => { if (!oversized) reject(err); });
  });
}

// ── Static serving ────────────────────────────────────────────────────────────
function serveStatic(res, reqPath) {
  if (reqPath.includes('..')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }
  const filePath = path.join(STATIC_DIR, reqPath);
  const contentType = MIME[path.extname(filePath)] || 'text/plain';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ── POST /api/route ───────────────────────────────────────────────────────────
async function handleApiRoute(req, res) {
  let body;
  try { body = await readBody(req, 16 * 1024); }
  catch (err) {
    const st = err && err.status === 413 ? 413 : 400;
    res.writeHead(st, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: st === 413 ? 'Request body too large' : 'Bad request' }));
    return;
  }
  let parsed;
  try { parsed = JSON.parse(body); }
  catch (_) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }

  if (!parsed.task || typeof parsed.task !== 'string' || !parsed.task.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing or empty task' }));
    return;
  }
  try {
    const decision = await route(parsed.task);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(decision));
  } catch (_) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Routing error' }));
  }
}

// ── SSE normalizer: upstream chunk → unified data: {"text":"..."} ─────────────
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
  catch (err) {
    const st = err && err.status === 413 ? 413 : 400;
    res.writeHead(st, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: st === 413 ? 'Request body too large' : 'Bad request' }));
    return;
  }
  let parsed;
  try { parsed = JSON.parse(body); }
  catch (_) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }

  const { task, apiKey, suggestedAgents, model, provider: providerKey } = parsed;

  if (!apiKey || typeof apiKey !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing apiKey' }));
    return;
  }
  if (!task || typeof task !== 'string' || !task.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing task' }));
    return;
  }

  const p = PROVIDERS[providerKey] || PROVIDERS.anthropic;
  const systemPrompt = loadSystemPrompt(Array.isArray(suggestedAgents) ? suggestedAgents : []);
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
      res.end();
      return;
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
  const pathname = url.parse(req.url || '/').pathname || '/';
  const method   = req.method || 'GET';

  if (method === 'GET'  && pathname === '/health')    { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return; }
  if (method === 'POST' && pathname === '/api/route') { await handleApiRoute(req, res); return; }
  if (method === 'POST' && pathname === '/api/chat')  { await handleApiChat(req, res);  return; }
  if (method === 'GET')                               { serveStatic(res, pathname === '/' ? '/index.html' : pathname); return; }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, '0.0.0.0', () => console.log(`Yana Web on http://localhost:${PORT}`));

module.exports = server;
