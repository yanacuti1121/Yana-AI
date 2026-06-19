'use strict';
// Optional semantic layer over memory.js's JSON file, which stays the
// source of truth. Fully opt-in: leave YANA_QDRANT_URL unset and this
// module is inert — zero infra, zero behavior change. Every exported call
// is best-effort: never throws, never blocks the request path.

const QDRANT_URL  = process.env.YANA_QDRANT_URL || '';
const COLLECTION  = 'yana_memory';
const VECTOR_SIZE = 768; // nomic-embed-text output dimension

let client = null;
function getClient() {
  if (!QDRANT_URL) return null;
  if (client) return client;
  // Lazy require — if the package were ever missing and YANA_QDRANT_URL is
  // unset, this line never executes, so a missing optional dep can't crash boot.
  const { QdrantClient } = require('@qdrant/js-client-rest');
  client = new QdrantClient({ url: QDRANT_URL });
  return client;
}

function isAvailable() {
  return !!QDRANT_URL;
}

let ensured = false;
async function ensureCollection() {
  if (ensured) return true;
  const c = getClient();
  if (!c) return false;
  try {
    const { exists } = await c.collectionExists(COLLECTION);
    if (!exists) {
      await c.createCollection(COLLECTION, { vectors: { size: VECTOR_SIZE, distance: 'Cosine' } });
    }
    ensured = true;
    return true;
  } catch (_) { return false; }
}

async function upsertMemory(entry, vector) {
  const c = getClient();
  if (!c || !vector) return false;
  try {
    if (!(await ensureCollection())) return false;
    await c.upsert(COLLECTION, { points: [{ id: entry.id, vector, payload: { text: entry.text, ts: entry.ts } }] });
    return true;
  } catch (_) { return false; }
}

async function searchSimilar(vector, limit) {
  const c = getClient();
  if (!c || !vector) return null;
  try {
    if (!(await ensureCollection())) return null;
    const hits = await c.search(COLLECTION, { vector, limit: limit || 12, with_payload: true });
    return hits.map((h) => ({ text: h.payload.text, ts: h.payload.ts, score: h.score }));
  } catch (_) { return null; }
}

async function deleteMemory(id) {
  const c = getClient();
  if (!c) return false;
  try {
    await c.delete(COLLECTION, { points: [id] });
    return true;
  } catch (_) { return false; }
}

module.exports = { isAvailable, upsertMemory, searchSimilar, deleteMemory };
