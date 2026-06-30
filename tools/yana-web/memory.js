'use strict';
// Yana Memory — file-backed long-term memory (.yana/memory.json).
//
// ChatGPT-style mechanism: the model decides what is worth keeping. When a
// normal (non-confidential) chat turn contains a durable fact, preference,
// or decision, the model ends its reply with a `MEMORY: <sentence>` line.
// The client strips that line from the display and POSTs it here; every
// later normal turn gets the saved memories attached to the system prompt.
//
// Rule 68: confidential/sovereign turns never read from or write to this
// store — the gating lives in server.js handleApiChat (tier check).

const fs   = require('fs');
const path = require('path');

const qdrant = require('./qdrant-client');
const { embed } = require('./embeddings');

// Same persistent data dir as auth.js/missions.js — survives redeploys.
const DATA_DIR = process.env.YANA_DATA_DIR || path.join(__dirname, '.yana');
const FILE     = path.join(DATA_DIR, 'memory.json');

const MAX_MEMORIES = 200;   // hard storage quota — oldest entries fall off the end
const MAX_LEN      = 300;   // one concise sentence, not a transcript
const TTL_DAYS     = Math.max(1, Number(process.env.YANA_MEMORY_TTL_DAYS) || 90);

// Saved memories are re-injected into future system prompts, which makes the
// store a prompt-injection persistence vector (OWASP LLM01). Reject entries
// that look like instructions rather than facts about the user.
// DF-5: MEMORY: lines are re-injected into the system prompt on every turn.
// This list must catch adversarial content that looks like facts but contains
// instruction overrides. Expand beyond the minimal set to cover known patterns.
const INJECTION_PATTERNS = [
  /ignore\s+(?:(?:all|previous|prior|the|above|your)\s+)*(instructions|rules)/i,
  /you\s+are\s+now/i,
  /new\s+instructions/i,
  /system\s*:/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  // Extended patterns — multi-turn and advanced jailbreak vectors (rule 43)
  /forget\s+(?:everything|all\s+(?:instructions|rules)|your\s+training)/i,
  /developer\s+mode/i,
  /dan\s+mode/i,
  /jailbreak/i,
  /ignore\s+previous/i,
  /override\s+(?:mode|instructions|rules)/i,
  /act\s+as\s+(?:if|though)\s+you/i,
  /pretend\s+(?:you\s+are|to\s+be)/i,
  /from\s+now\s+on\s+you/i,
  /respond\s+as\s+(?:if|though)\s+you/i,
  /disregard\s+(?:your|all|prior)/i,
  /\|\|prompt_injection/i,
];

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return []; }
}

function save(memories) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(memories, null, 2));
}

// Returns the stored entry, or null with a reason when the text is rejected.
function add(text) {
  if (typeof text !== 'string') return { error: 'Invalid text' };
  // one line, printable characters only
  const clean = text.replace(/[\r\n]+/g, ' ').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, MAX_LEN);
  if (!clean) return { error: 'Empty memory' };
  if (INJECTION_PATTERNS.some(p => p.test(clean))) return { error: 'Rejected: instruction-like content' };

  const memories = load();
  const lower = clean.toLowerCase();
  if (memories.some(m => m.text.toLowerCase() === lower)) return { error: 'Duplicate' };

  const entry = { id: 'ym' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: clean, ts: Date.now() };
  memories.unshift(entry);
  save(memories.slice(0, MAX_MEMORIES));

  // Best-effort semantic indexing — fire-and-forget, never blocks this call.
  // JSON file above is already the durable write; this just keeps the
  // optional Qdrant index in sync when YANA_QDRANT_URL is set.
  if (qdrant.isAvailable()) {
    embed(clean).then((vector) => { if (vector) qdrant.upsertMemory(entry, vector); }).catch(() => {});
  }

  return { memory: entry };
}

// Periodic cleanup: drop entries older than TTL_DAYS and enforce the quota.
// server.js runs this at boot and once a day; add() keeps the cap on write.
// Returns how many entries were removed.
function prune() {
  const cutoff   = Date.now() - TTL_DAYS * 86400 * 1000;
  const memories = load();
  const next     = memories.filter(m => m.ts >= cutoff).slice(0, MAX_MEMORIES);
  if (next.length !== memories.length) save(next);
  return memories.length - next.length;
}

function remove(id) {
  const memories = load();
  const next = memories.filter(m => m.id !== id);
  if (next.length === memories.length) return false;
  save(next);
  if (qdrant.isAvailable()) qdrant.deleteMemory(id).catch(() => {});
  return true;
}

// Newest n memories as a plain-text block for the system prompt, or null.
// Wrapped as data, not instructions — recalled text must never steer the model.
function contextBlock(n) {
  const memories = load().slice(0, n || 12);
  if (!memories.length) return null;
  return memories.map(m => '- ' + m.text).join('\n');
}

// Semantic-search variant of contextBlock(), used when YANA_QDRANT_URL is
// set and an embedding model is reachable. Falls back to the plain
// newest-n contextBlock() on any failure or when Qdrant is off — callers
// always get a result, never an error.
async function searchRelevant(query, n) {
  if (qdrant.isAvailable()) {
    try {
      const vector = await embed(query);
      if (vector) {
        const hits = await qdrant.searchSimilar(vector, n || 12);
        if (hits && hits.length) return hits.map(h => '- ' + h.text).join('\n');
      }
    } catch (_) { /* fall through to contextBlock */ }
  }
  return contextBlock(n);
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function handleList(req, res) {
  json(res, 200, { memories: load() });
}

function handleAdd(req, res, body) {
  const result = add(body && body.text);
  if (result.error) { json(res, 400, { error: result.error }); return; }
  json(res, 200, { ok: true, memory: result.memory });
}

function handleDelete(req, res, body) {
  const id = body && body.id;
  if (typeof id !== 'string' || !remove(id)) { json(res, 404, { error: 'Not found' }); return; }
  json(res, 200, { ok: true });
}

module.exports = { add, remove, load, prune, contextBlock, searchRelevant, handleList, handleAdd, handleDelete, MAX_MEMORIES, MAX_LEN, TTL_DAYS };
