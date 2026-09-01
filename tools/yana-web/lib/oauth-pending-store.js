'use strict';
// Generic short-lived, in-memory, single-process nonce -> data store.
//
// Why this exists (same root cause as auth.js's own pendingOAuthStates,
// factored out here so connector-oauth.js doesn't duplicate it): Electron's
// main.js sends external URLs (accounts.google.com included) to the
// system browser via shell.openExternal rather than navigating the app's
// own window there (see main.js's guardNavigation/setWindowOpenHandler).
// The request that lands on our OAuth callback can therefore be a
// different browser/process than the one that started the flow, with no
// shared cookie jar — a cookie-based state check breaks on that hand-off.
// An unguessable, single-process, server-side nonce has no such
// dependency: whoever presents the exact nonce we handed out proves they
// (or a script running with knowledge of it) are part of this specific
// flow, regardless of which browser makes either request.
const crypto = require('crypto');

function createPendingStore(ttlMs) {
  const store = new Map();

  function prune() {
    const now = Date.now();
    for (const [key, record] of store) {
      if (now > record.expiresAt) store.delete(key);
    }
  }

  return {
    /** Create a new entry, return its nonce. */
    create(data) {
      prune();
      const nonce = crypto.randomBytes(24).toString('hex');
      store.set(nonce, { data, expiresAt: Date.now() + ttlMs });
      return nonce;
    },
    /** Read without consuming. Returns null if absent/expired. */
    peek(nonce) {
      prune();
      const record = store.get(nonce);
      return record ? record.data : null;
    },
    /** Replace an existing entry's data in place (keeps its original TTL clock). */
    update(nonce, data) {
      const record = store.get(nonce);
      if (record) record.data = data;
    },
    /** Read and delete in one step — for one-time hand-offs (e.g. a token). */
    consume(nonce) {
      prune();
      const record = store.get(nonce);
      if (record) store.delete(nonce);
      return record ? record.data : null;
    },
  };
}

module.exports = { createPendingStore };
