---
name: symmetric-encryption-patterns
description: AES-256 symmetric encryption for agent memory cache protection. CryptoJS AES encrypt/decrypt, HMAC integrity, secure key derivation, and encrypting agent session state at rest. Sources: brix/crypto-js.
origin: yamtam-engine — synthesized from brix/crypto-js (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /symmetric-encryption-patterns

## When to Use

- Encrypt agent L1/L2 memory files at rest on shared filesystems
- Protect sensitive tool output (API keys, tokens) before caching
- HMAC integrity check on log entries before appending to audit chain
- Quick symmetric encryption without building full PKI infrastructure

## Do NOT use for

- New projects — prefer Node.js built-in `crypto` AES-GCM for AEAD security
- CryptoJS AES default mode is CBC without authentication — risky for new code
- Key exchange (use [[ecc-key-management]] ECDH instead)

---

## AES-256 encrypt/decrypt (CryptoJS)

```javascript
import CryptoJS from 'crypto-js'

// Encrypt (passphrase-based — auto-derives key+IV via PBKDF2-like OpenSSL EVP)
function encrypt(plaintext: string, passphrase: string): string {
  return CryptoJS.AES.encrypt(plaintext, passphrase).toString()
  // Returns Base64 OpenSSL-format: "Salted__<8-byte-salt><ciphertext>"
}

// Decrypt
function decrypt(ciphertext: string, passphrase: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, passphrase)
  const plain = bytes.toString(CryptoJS.enc.Utf8)
  if (!plain) throw new Error('[crypto] decryption failed — wrong key or corrupted data')
  return plain
}
```

---

## HMAC-SHA256 integrity tag

```javascript
function hmacSign(data: string, keyHex: string): string {
  const key = CryptoJS.enc.Hex.parse(keyHex)
  return CryptoJS.HmacSHA256(data, key).toString()
}

function hmacVerify(data: string, keyHex: string, expectedHmac: string): boolean {
  const actual = hmacSign(data, keyHex)
  // Constant-time compare (prevents timing attacks)
  return CryptoJS.enc.Hex.parse(actual).toString() === expectedHmac
}

// Usage: sign before appending to audit log
const logEntry  = JSON.stringify({ ts: Date.now(), action: 'exec', cmd: 'ls' })
const tag       = hmacSign(logEntry, process.env.YAMTAM_HMAC_KEY!)
const logLine   = JSON.stringify({ entry: logEntry, hmac: tag })
```

---

## SHA-256 / SHA-3 hashing

```javascript
// File integrity hash
const sha256 = CryptoJS.SHA256('content').toString()

// SHA-3 (Keccak variant — compatible with Ethereum hashing)
const sha3   = CryptoJS.SHA3('content', { outputLength: 256 }).toString()

// PBKDF2 key derivation (use instead of raw passphrase)
const salt   = CryptoJS.lib.WordArray.random(16)
const key256 = CryptoJS.PBKDF2(passphrase, salt, { keySize: 8, iterations: 100_000 })
const keyHex = key256.toString()
```

---

## Encrypt agent memory file

```bash
#!/usr/bin/env bash
# encrypt-memory.sh — encrypt L1 memory files before committing
encrypt_file() {
  local file="$1"
  node -e "
const CryptoJS = require('crypto-js')
const fs       = require('fs')
const plain    = fs.readFileSync('$file', 'utf8')
const enc      = CryptoJS.AES.encrypt(plain, process.env.YAMTAM_MEM_KEY).toString()
fs.writeFileSync('$file.enc', enc)
console.log('[encrypt] $file → $file.enc')
"
}
```

---

## Anti-Fake-Pass Checklist

```
❌ CryptoJS AES default mode = CBC without MAC → no authentication, malleable
❌ Passphrase directly as key (not PBKDF2) → low-entropy key, easily brute-forced
❌ bytes.toString(CryptoJS.enc.Utf8) returns '' on wrong key — must check for empty
❌ CryptoJS.SHA3 is Keccak (not standard SHA-3) — differs from NIST SHA-3
❌ HMAC key same as encryption key → key reuse across schemes weakens both
❌ Encrypted files stored in git repo → ciphertext leaks via git history
```
