'use strict';
// Yana Vault — provider API keys encrypted at rest (AES-256-GCM, WebCrypto).
//
// localStorage holds only ciphertext under "yana.enc.<provider>". The AES key
// is a NON-EXTRACTABLE CryptoKey persisted in IndexedDB — a localStorage dump,
// browser-sync backup, or disk inspection never yields usable secrets.
// Legacy plaintext "yana.key.<provider>" entries are migrated on first load.
//
// Exposes window.YanaVault:
//   ready            Promise — await before first render
//   getKey(id)       sync, from in-memory cache (null if absent)
//   hasKey(id)       sync
//   setKey(id, val)  async — encrypts + persists
//   removeKey(id)    sync — wipes ciphertext + legacy plaintext

(function () {
  const DB_NAME       = 'yana-vault';
  const STORE         = 'keys';
  const MASTER_ID     = 'master';
  const ENC_PREFIX    = 'yana.enc.';
  const LEGACY_PREFIX = 'yana.key.';

  const cache = Object.create(null); // id -> plaintext, in-memory only
  let masterKey = null;
  let fallback  = false;             // plaintext mode when WebCrypto/IDB missing

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function idbGet(db, k) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(k);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  }

  function idbPut(db, k, v) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  async function loadMasterKey() {
    const db = await idbOpen();
    let key = await idbGet(db, MASTER_ID);
    if (!key) {
      key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,                               // non-extractable
        ['encrypt', 'decrypt']
      );
      await idbPut(db, MASTER_ID, key);
    }
    db.close();
    return key;
  }

  function b64(buf) {
    let s = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function unb64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function encrypt(plain) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, masterKey, new TextEncoder().encode(plain)
    );
    const packed = new Uint8Array(12 + ct.byteLength);
    packed.set(iv);
    packed.set(new Uint8Array(ct), 12);
    return b64(packed.buffer);
  }

  async function decrypt(packedB64) {
    const packed = unb64(packedB64);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.slice(0, 12) }, masterKey, packed.slice(12)
    );
    return new TextDecoder().decode(pt);
  }

  function listStorageIds(prefix) {
    const ids = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) ids.push(k.slice(prefix.length));
    }
    return ids;
  }

  async function init() {
    if (!window.crypto || !crypto.subtle || !window.indexedDB) {
      fallback = true;
    } else {
      try { masterKey = await loadMasterKey(); }
      catch (_) { fallback = true; }
    }

    if (fallback) {
      console.warn('[yana-vault] WebCrypto/IndexedDB unavailable — keys stored in plaintext');
      for (const id of listStorageIds(LEGACY_PREFIX)) {
        cache[id] = localStorage.getItem(LEGACY_PREFIX + id);
      }
      return;
    }

    // Migrate legacy plaintext entries → encrypted, then wipe plaintext
    for (const id of listStorageIds(LEGACY_PREFIX)) {
      const plain = localStorage.getItem(LEGACY_PREFIX + id);
      if (plain) {
        cache[id] = plain;
        localStorage.setItem(ENC_PREFIX + id, await encrypt(plain));
      }
      localStorage.removeItem(LEGACY_PREFIX + id);
    }

    // Load existing ciphertext into the in-memory cache
    for (const id of listStorageIds(ENC_PREFIX)) {
      if (cache[id]) continue;
      try { cache[id] = await decrypt(localStorage.getItem(ENC_PREFIX + id)); }
      catch (_) { localStorage.removeItem(ENC_PREFIX + id); } // undecryptable (foreign profile) — drop
    }
  }

  const ready = init();

  window.YanaVault = {
    ready,
    getKey(id) { return cache[id] || null; },
    hasKey(id) { return !!cache[id]; },
    async setKey(id, value) {
      cache[id] = value;
      if (fallback) { localStorage.setItem(LEGACY_PREFIX + id, value); return; }
      localStorage.setItem(ENC_PREFIX + id, await encrypt(value));
    },
    removeKey(id) {
      delete cache[id];
      localStorage.removeItem(ENC_PREFIX + id);
      localStorage.removeItem(LEGACY_PREFIX + id);
    },
  };
})();
