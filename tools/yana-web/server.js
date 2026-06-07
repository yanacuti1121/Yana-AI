'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { route } = require('./router.js');
const { loadSystemPrompt } = require('./agents.js');

const PORT = process.env.PORT || 8081;
const STATIC_DIR = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// ── Body reader ──────────────────────────────────────────────────────────────
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
        // Drain remaining data so we can still respond
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!oversized) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', err => { if (!oversized) reject(err); });
  });
}

// ── Static file serving ──────────────────────────────────────────────────────
function serveStatic(res, reqPath) {
  // Reject path traversal (execution-environment L5 gate)
  if (reqPath.includes('..')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }
  const filePath = path.join(STATIC_DIR, reqPath);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'text/plain';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ── POST /api/route ──────────────────────────────────────────────────────────
async function handleApiRoute(req, res) {
  let body;
  try {
    body = await readBody(req, 16 * 1024);
  } catch (err) {
    if (err && err.status === 413) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      return;
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad request' }));
    return;
  }

  let parsed;
  try { parsed = JSON.parse(body); } catch (_) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  if (!parsed.task || typeof parsed.task !== 'string' || !parsed.task.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing or empty task' }));
    return;
  }

  try {
    const decision = await route(parsed.task);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(decision));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Routing error' }));
  }
}

// ── POST /api/chat ───────────────────────────────────────────────────────────
async function handleApiChat(req, res) {
  let body;
  try {
    body = await readBody(req, 32 * 1024);
  } catch (err) {
    if (err && err.status === 413) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      return;
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad request' }));
    return;
  }

  let parsed;
  try { parsed = JSON.parse(body); } catch (_) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const { task, apiKey, suggestedAgents, model } = parsed;

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

  const systemPrompt = loadSystemPrompt(Array.isArray(suggestedAgents) ? suggestedAgents : []);
  const modelId = (typeof model === 'string' && model.trim()) ? model.trim() : 'claude-sonnet-4-6';

  const reqBody = JSON.stringify({
    model: modelId,
    max_tokens: 2048,
    system: systemPrompt,
    stream: true,
    messages: [{ role: 'user', content: task }],
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(reqBody),
    },
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const upstreamReq = https.request(options, upstreamRes => {
    if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
      res.write(`event: error\ndata: ${JSON.stringify({ status: upstreamRes.statusCode })}\n\n`);
      res.end();
      return;
    }
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', err => {
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Upstream connection failed' })}\n\n`);
    res.end();
  });

  upstreamReq.write(reqBody);
  upstreamReq.end();
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '/');
  const pathname = parsed.pathname || '/';
  const method = req.method || 'GET';

  if (method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (method === 'POST' && pathname === '/api/route') {
    await handleApiRoute(req, res);
    return;
  }

  if (method === 'POST' && pathname === '/api/chat') {
    await handleApiChat(req, res);
    return;
  }

  if (method === 'GET') {
    const reqPath = pathname === '/' ? '/index.html' : pathname;
    serveStatic(res, reqPath);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Yana Web on http://localhost:${PORT}`);
});

module.exports = server;
