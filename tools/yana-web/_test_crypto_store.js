'use strict';
// Tests for crypto-store.js (window.YanaVault) — zero deps.
// Node ≥ 18 provides WebCrypto (crypto.subtle), btoa/atob, TextEncoder.
// localStorage and IndexedDB are shimmed in-memory below.
// Run: node _test_crypto_store.js

const path = require('path');
const MODULE = path.join(__dirname, 'shared', 'crypto-store.js'); // moved here in a refactor; this test's path was never updated (2026-07-08 audit)

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else      { fail++; console.log('FAIL  ' + name); }
}

// ── localStorage shim ─────────────────────────────────────────────────────────
function makeLocalStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key(i)        { return Array.from(m.keys())[i] ?? null; },
    getItem(k)    { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(k); },
    clear()       { m.clear(); },
  };
}

// ── minimal IndexedDB shim (open/transaction/objectStore/get/put) ─────────────
// Callbacks fire on a microtask so handlers assigned after the call still run,
// matching real IDB event ordering closely enough for this module.
function makeIndexedDB() {
  const stores = new Map(); // storeName -> Map(key -> value)
  function request(result) {
    const req = { result, onsuccess: null, onerror: null };
    queueMicrotask(() => { if (req.onsuccess) req.onsuccess(); });
    return req;
  }
  const db = {
    createObjectStore(name) { if (!stores.has(name)) stores.set(name, new Map()); },
    transaction(name, _mode) {
      return {
        objectStore(n) {
          const s = stores.get(n);
          return {
            get(k)    { return request(s.has(k) ? s.get(k) : undefined); },
            put(v, k) { s.set(k, v); return request(undefined); },
          };
        },
      };
    },
    close() {},
  };
  return {
    _stores: stores,
    open(_name, _ver) {
      const req = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        // first open of this fake DB → upgrade path creates the store
        if (!stores.size && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
  };
}

// Fresh module load with the chosen environment
async function loadVault({ idb, localStorage }) {
  delete require.cache[MODULE];
  delete global.window?.YanaVault;
  global.window       = global;          // module writes window.YanaVault
  global.localStorage = localStorage;
  global.indexedDB    = idb;             // undefined → fallback (plaintext) mode
  require(MODULE);
  await global.window.YanaVault.ready;
  return global.window.YanaVault;
}

(async () => {
  // ════ Encrypted mode (WebCrypto + IDB shim) ════
  {
    const ls  = makeLocalStorage();
    const idb = makeIndexedDB();
    const vault = await loadVault({ idb, localStorage: ls });

    await vault.setKey('claude', 'sk-test-roundtrip-123');
    t('getKey returns what setKey stored',     vault.getKey('claude') === 'sk-test-roundtrip-123');
    t('hasKey true after set',                 vault.hasKey('claude') === true);
    t('ciphertext stored under yana.enc.*',    typeof ls.getItem('yana.enc.claude') === 'string');
    t('no plaintext key in localStorage',      ls.getItem('yana.key.claude') === null);
    t('ciphertext does not contain plaintext', !String(ls.getItem('yana.enc.claude')).includes('sk-test-roundtrip-123'));

    // Unique IV per encryption — same plaintext twice → different ciphertext
    const ct1 = ls.getItem('yana.enc.claude');
    await vault.setKey('claude', 'sk-test-roundtrip-123');
    t('fresh IV per encryption (ct differs)',  ls.getItem('yana.enc.claude') !== ct1);

    // Ciphertext survives a reload and decrypts with the persisted master key
    const vault2 = await loadVault({ idb, localStorage: ls });
    t('key decrypts after reload (master key persisted)', vault2.getKey('claude') === 'sk-test-roundtrip-123');

    vault2.removeKey('claude');
    t('removeKey wipes cache',                 vault2.getKey('claude') === null);
    t('removeKey wipes ciphertext',            ls.getItem('yana.enc.claude') === null);
  }

  // ════ Legacy plaintext migration ════
  {
    const ls  = makeLocalStorage();
    const idb = makeIndexedDB();
    ls.setItem('yana.key.openai', 'legacy-plain-key');
    const vault = await loadVault({ idb, localStorage: ls });

    t('legacy key readable after migration',   vault.getKey('openai') === 'legacy-plain-key');
    t('legacy plaintext wiped',                ls.getItem('yana.key.openai') === null);
    t('legacy key now encrypted',              typeof ls.getItem('yana.enc.openai') === 'string');
  }

  // ════ Undecryptable ciphertext (foreign profile / restored backup) ════
  {
    const ls  = makeLocalStorage();
    const idb = makeIndexedDB();
    ls.setItem('yana.enc.gemini', btoa('garbage-not-real-ciphertext!'));
    const vault = await loadVault({ idb, localStorage: ls });

    t('undecryptable entry dropped, not retried', ls.getItem('yana.enc.gemini') === null);
    t('undecryptable entry not in cache',         vault.hasKey('gemini') === false);
  }

  // ════ Fallback mode (no IndexedDB) ════
  // crypto-store.js (see its own top-of-file doc + inline comments at the
  // `fallback` flag and `setKey`) deliberately REFUSES to write in this mode
  // — "plaintext storage is not acceptable" — rather than silently degrading
  // to plaintext. This test previously asserted the opposite (silent
  // plaintext write succeeds), which no longer matched the code and made
  // this file fail to even run after a separate path fix (2026-07-08 audit).
  // Fixed to test the actual, intentional contract: writes throw; reads of
  // an already-migrated legacy key still work (read-only degradation).
  {
    const ls = makeLocalStorage();
    ls.setItem('yana.key.groq', 'pre-existing-legacy-key'); // simulates a key saved before fallback was hit
    const vault = await loadVault({ idb: undefined, localStorage: ls });

    t('fallback: isSecure is false',           vault.isSecure === false);

    let threw = false;
    try { await vault.setKey('groq', 'new-key-should-not-be-written'); }
    catch (_) { threw = true; }
    t('fallback: setKey throws (no silent plaintext write)', threw);

    t('fallback: pre-existing legacy key still readable', vault.getKey('groq') === 'pre-existing-legacy-key');
    t('fallback: setKey throw did not overwrite the legacy value',
      ls.getItem('yana.key.groq') === 'pre-existing-legacy-key');
  }

  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
