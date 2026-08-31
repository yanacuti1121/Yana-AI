import assert from 'node:assert/strict';
import {
  hasConnectorCredential,
  getConnectorCredential,
  setConnectorCredential,
  clearConnectorCredential,
  connectorCredentialStatus,
} from './connector-credentials.mjs';

// Fake YanaVault — same shape as shared/crypto-store.js's real one
// (getKey/hasKey/setKey/removeKey), no encryption, no DOM. Proves this
// module never talks to the store directly by name — only through the
// injected `vault` parameter — which is exactly what makes swapping the
// backend later (Rust SecretBackend) a one-file change.
function fakeVault() {
  const store = new Map();
  return {
    getKey: (id) => store.get(id) ?? null,
    hasKey: (id) => store.has(id),
    setKey: async (id, value) => { store.set(id, value); },
    removeKey: (id) => { store.delete(id); },
    _store: store,
  };
}

const vault = fakeVault();

assert.equal(hasConnectorCredential('gmail', vault), false);
assert.equal(getConnectorCredential('gmail', vault), null);
assert.equal(connectorCredentialStatus('gmail', vault), 'disconnected');

await setConnectorCredential('gmail', { accessToken: 'a1', refreshToken: 'r1', expiresAt: Date.now() + 60_000, email: 'x@example.com' }, vault);
assert.equal(hasConnectorCredential('gmail', vault), true);
assert.equal(getConnectorCredential('gmail', vault).email, 'x@example.com');
assert.equal(connectorCredentialStatus('gmail', vault), 'connected');
assert.equal(vault._store.has('connector:gmail'), true, 'namespaced under connector:<name>, not the bare connector name');

// A different connector's key must not collide.
assert.equal(hasConnectorCredential('google-calendar', vault), false);

// Expired with no refresh token -> 'expired', not silently 'connected'.
await setConnectorCredential('google-calendar', { accessToken: 'a2', refreshToken: null, expiresAt: Date.now() - 1000 }, vault);
assert.equal(connectorCredentialStatus('google-calendar', vault), 'expired');

// Expired but WITH a refresh token -> still 'connected' (recoverable on next use, not a dead end for the user).
await setConnectorCredential('google-calendar', { accessToken: 'a2', refreshToken: 'r2', expiresAt: Date.now() - 1000 }, vault);
assert.equal(connectorCredentialStatus('google-calendar', vault), 'connected');

// Corrupt stored value never throws — treated as absent.
vault._store.set('connector:github', 'not-json{{{');
assert.equal(getConnectorCredential('github', vault), null);
assert.equal(connectorCredentialStatus('github', vault), 'disconnected');

clearConnectorCredential('gmail', vault);
assert.equal(hasConnectorCredential('gmail', vault), false);
assert.equal(connectorCredentialStatus('google-calendar', vault), 'connected', 'clearing one connector must not affect another');

// No vault available (e.g. legacy/non-Electron context) — reads degrade
// to "nothing stored" instead of throwing, writes reject clearly.
assert.equal(hasConnectorCredential('gmail', null), false);
assert.equal(getConnectorCredential('gmail', null), null);
assert.equal(connectorCredentialStatus('gmail', null), 'disconnected');
let threw = false;
try { await setConnectorCredential('gmail', { accessToken: 'x' }, null); }
catch (_) { threw = true; }
assert.equal(threw, true, 'setConnectorCredential must reject rather than silently no-op without a vault');

console.log('connector-credentials tests passed: 18');
