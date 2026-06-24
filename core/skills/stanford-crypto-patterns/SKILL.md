---
name: stanford-crypto-patterns
description: Side-channel-resistant cryptography patterns from Stanford SJCL. Constant-time operations, AES-CCM authenticated encryption, PBKDF2 key derivation, random number generation, and timing-attack-safe comparisons. Sources: bitwiseshiftleft/sjcl (Stanford JavaScript Crypto Library).
origin: yana-ai — synthesized from bitwiseshiftleft/sjcl (BSD-2-Clause, Stanford University)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /stanford-crypto-patterns

## When to Use

- Environments where timing-attack resistance is critical (secret comparison)
- AES-CCM authenticated encryption (alternative to GCM with simpler nonce handling)
- SJCL PRNG for cryptographic random number generation
- Academic/compliance contexts requiring vetted, peer-reviewed crypto library

## Do NOT use for

- New Node.js code — prefer built-in `crypto` module (WebCrypto API) for standard cases
- Performance-critical bulk encryption (pure JS SJCL is slower than native C bindings)

---

## Constant-time comparison (timing-attack safe)

```javascript
import sjcl from 'sjcl'

// WRONG: regular string comparison leaks timing info
// if (secretA === secretB) ...  ← fails early on first mismatch

// RIGHT: constant-time comparison via XOR of bitArrays
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const aWords = sjcl.codec.utf8String.toBits(a)
  const bWords = sjcl.codec.utf8String.toBits(b)

  let diff = 0
  for (let i = 0; i < aWords.length; i++) {
    diff |= aWords[i] ^ bWords[i]
  }
  return diff === 0
}
```

---

## AES-CCM authenticated encryption

```javascript
import sjcl from 'sjcl'

function encryptSJCL(plaintext: string, passphrase: string): string {
  // sjcl.encrypt handles: PBKDF2 key derivation + AES-CCM + random IV + MAC
  const encrypted = sjcl.encrypt(passphrase, plaintext, {
    ks:  256,      // AES key size: 128 | 192 | 256
    ts:  128,      // authentication tag size: 64 | 96 | 128 bits
    iter: 100_000, // PBKDF2 iterations
    mode: 'ccm',   // ccm | gcm | ocb2
  })
  return encrypted  // JSON string with iv, salt, ct, adata, mac
}

function decryptSJCL(encrypted: string, passphrase: string): string {
  try {
    return sjcl.decrypt(passphrase, encrypted)
  } catch (e) {
    throw new Error('[sjcl] decryption failed — wrong passphrase or tampered data')
  }
}
```

---

## Cryptographic random bytes

```javascript
// SJCL PRNG (seeded from system entropy via window.crypto or a custom entropy function)
function secureRandom(bytes: number): string {
  const wordCount = Math.ceil(bytes / 4)
  const words     = sjcl.random.randomWords(wordCount, 10)  // paranoia level 10
  return sjcl.codec.hex.fromBits(words).slice(0, bytes * 2)
}

// Session nonce
const nonce = secureRandom(16)   // 32-char hex = 128-bit nonce
```

---

## PBKDF2 key derivation

```javascript
function deriveKeySJCL(passphrase: string, saltHex: string, iterations = 100_000): string {
  const salt  = sjcl.codec.hex.toBits(saltHex)
  const key   = sjcl.misc.pbkdf2(passphrase, salt, iterations, 256)
  return sjcl.codec.hex.fromBits(key)
}
```

---

## SHA-256 / HMAC

```javascript
const hash = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash('data'))

const key  = sjcl.codec.utf8String.toBits(process.env.HMAC_KEY!)
const mac  = sjcl.codec.hex.fromBits(new sjcl.misc.hmac(key).encrypt('message'))
```

---

## Anti-Fake-Pass Checklist

```
❌ sjcl.random.randomWords without seeding → throws on missing entropy in Node.js (use node-crypto seed)
❌ sjcl.encrypt paranoia < 6 → low entropy tolerance warning; use 8-10 for production
❌ Comparing MAC tags with === → timing attack; use constantTimeEqual above
❌ AES-CCM nonce reused → catastrophic, breaks authentication (SJCL uses random IV by default)
❌ sjcl in browser vs Node.js → window.crypto auto-seed in browser, must manually add entropy in Node
❌ sjcl output is JSON object — stringify before storing, parse before decrypting
```
