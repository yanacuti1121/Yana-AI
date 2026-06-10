# 66-client-secret-encryption-law

**Status:** Active
**Tier:** TIER 1 — SECURITY
**Gate:** L3 — review of any web UI / desktop shell code handling user credentials
**Scope:** All client-facing apps in this repo (tools/yana-web, tools/yana-desktop, docs site, future UIs)

---

## Rule

User-supplied secrets (provider API keys, tokens, passwords) MUST NOT be stored
in plaintext in any browser storage (localStorage, sessionStorage, cookies,
plain IndexedDB values). Secrets at rest MUST be encrypted with AES-256-GCM
using a **non-extractable** WebCrypto key persisted in IndexedDB.

Reference implementation: `tools/yana-web/crypto-store.js` (window.YanaVault).

## Required Properties

```
□ Cipher: AES-256-GCM, fresh random 96-bit IV per encryption
□ Master key: crypto.subtle.generateKey(..., extractable: false, ...)
□ Master key storage: IndexedDB (structured-clone of CryptoKey) — never exported
□ Ciphertext location: localStorage under a dedicated prefix (yana.enc.*)
□ Plaintext lives only in page memory (in-memory cache), never persisted
□ Legacy plaintext entries migrated → encrypted → wiped on first load
□ Undecryptable ciphertext (foreign profile/restore) dropped, not retried
```

## Server Companion Rules

Any local server backing a client UI MUST:

```
□ Bind 127.0.0.1 by default — 0.0.0.0 only via explicit HOST env (container)
□ Never place API keys in URL query strings (use headers — e.g. x-goog-api-key)
□ Rate-limit POST endpoints per IP (429 + Retry-After)
□ Send security headers: CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
□ Resolve static paths and reject traversal, dotfiles, node_modules
□ Never log request bodies that may contain apiKey fields
```

## Prohibited

```
❌ localStorage.setItem('<anything>', rawApiKey)
❌ API key embedded in URL (?key=..., /path/<key>)
❌ Master key stored extractable, or exported via exportKey
❌ Encryption key derived from a hardcoded passphrase in source
❌ Secrets sent to any origin other than the provider they belong to
❌ "Temporary" plaintext storage with a TODO to encrypt later
```

## Threat Model Covered

| Threat | Mitigation |
|--------|------------|
| localStorage dump (extension, sync backup, disk) | Only ciphertext present |
| Key exfiltration via storage inspection | Master key non-extractable |
| Key leakage into server/proxy logs | No keys in URLs |
| Open-proxy abuse of local server | Loopback bind + rate limit |
| Path traversal on static file server | Resolved-path prefix check |

Known limit: an XSS payload running in-page can still call decrypt — CSP is the
first line of defense for that vector. Encryption-at-rest protects storage
dumps, backups, and sync channels, not a fully compromised page.

## References

- `core/rules/52-secrets-vault-law.md` — server-side secret handling
- `core/rules/api-security-gate.md` — API2 (no keys in query strings), API4 (rate limiting)
- `core/rules/network-egress-law.md` — egress destination control
- `tools/yana-web/crypto-store.js` — reference implementation
