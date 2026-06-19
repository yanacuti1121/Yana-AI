'use strict';
// Local embeddings via Ollama (rule 68 SOVEREIGN tier — text never leaves
// the machine, no cloud embedding API). Best-effort: resolves to null on
// any failure or timeout, never throws, never blocks the caller.

const http = require('http');

const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;
const EMBED_MODEL = process.env.YANA_EMBED_MODEL || 'nomic-embed-text';

function embed(text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ model: EMBED_MODEL, prompt: text });
    const req = http.request({
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: '/api/embeddings',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed.embedding) ? parsed.embedding : null);
        } catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

module.exports = { embed, EMBED_MODEL };
