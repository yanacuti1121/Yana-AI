// Connector OAuth credential storage — the ABSTRACTION LAYER anh asked
// for so a later move to Rust's SecretBackend is a rewrite of THIS file
// only, never of the connector UI/hooks that call it.
//
// Today's implementation (hướng B, anh's explicit choice): backed by
// YanaVault (../../shared/crypto-store.js) — AES-256-GCM, a non-
// extractable WebCrypto key in IndexedDB, ciphertext-only in
// localStorage. This is the SAME encrypted store already used for
// provider API keys (rule 66), just a different key namespace.
//
// Why not Rust's SecretBackend today: that trait currently only exposes
// has_entry() (existence-check only, by design — see connector.rs's own
// doc comment: "a connector registry must never print or persist a
// token"). It has no set()/get(), so there is nowhere in the Rust
// runtime today that could receive a fresh OAuth token at all. Migrating
// later means: (1) extend SecretBackend with real set/get, itself a
// Tier-1-security-relevant change needing its own review, then (2)
// swap this file's internals to call that via IPC instead of YanaVault.
// Every other connector file only ever imports from HERE.
const KEY_PREFIX = 'connector:';

function vaultKey(connectorName) {
  return `${KEY_PREFIX}${connectorName}`;
}

function defaultVault() {
  return typeof window !== 'undefined' ? window.YanaVault : null;
}

/** True if a credential bundle is stored for this connector — no decoding, no I/O beyond the in-memory cache YanaVault already keeps. */
export function hasConnectorCredential(connectorName, vault = defaultVault()) {
  return !!vault?.hasKey(vaultKey(connectorName));
}

/**
 * Returns the stored bundle for a connector, or null if absent/corrupt.
 * Shape: { accessToken, refreshToken, expiresAt, scope, email }.
 */
export function getConnectorCredential(connectorName, vault = defaultVault()) {
  const raw = vault?.getKey(vaultKey(connectorName));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

/** Persists a fresh credential bundle (encrypts via YanaVault.setKey). */
export async function setConnectorCredential(connectorName, bundle, vault = defaultVault()) {
  if (!vault) throw new Error('Secure credential storage is unavailable in this environment.');
  await vault.setKey(vaultKey(connectorName), JSON.stringify(bundle));
}

/** Removes a stored credential — used by both Disconnect and a failed-refresh cleanup. */
export function clearConnectorCredential(connectorName, vault = defaultVault()) {
  vault?.removeKey(vaultKey(connectorName));
}

/**
 * Derives a UI-facing status from a stored bundle without any network
 * call: 'disconnected' (nothing stored), 'expired' (accessToken's TTL has
 * passed AND there is no refresh token to silently recover with), or
 * 'connected' (usable now, or recoverable via refresh on next use).
 */
export function connectorCredentialStatus(connectorName, vault = defaultVault()) {
  const bundle = getConnectorCredential(connectorName, vault);
  if (!bundle || !bundle.accessToken) return 'disconnected';
  const expired = typeof bundle.expiresAt === 'number' && Date.now() >= bundle.expiresAt;
  if (expired && !bundle.refreshToken) return 'expired';
  return 'connected';
}
