---
name: crypto-pki-patterns
description: PKI, RSA, AES, and X.509 certificate patterns using node-forge. RSA key generation, AES-256-GCM encryption/decryption, self-signed certificate creation, PEM/DER encoding, and local config file encryption. Sources: digitalbazaar/forge.
origin: yamtam-engine — synthesized from digitalbazaar/forge (BSD-3-Clause)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /crypto-pki-patterns

## When to Use

- Encrypt agent config files at rest with AES-256-GCM
- Generate RSA key pairs and self-signed X.509 certs for local TLS
- Parse and validate PEM certificates from external services
- Build PKI chain for agent-to-agent mTLS authentication

## Do NOT use for

- High-performance symmetric encryption of large files (use Node.js built-in `crypto` with streams)
- ECC key operations (use [[ecc-key-management]])

---

## AES-256-GCM encrypt/decrypt (config files)

```javascript
import forge from 'node-forge'

const KEY_BYTES = 32   // AES-256
const IV_BYTES  = 12   // GCM standard IV

export function encryptConfig(plaintext: string, keyHex: string): string {
  const key = forge.util.hexToBytes(keyHex)
  const iv  = forge.random.getBytesSync(IV_BYTES)

  const cipher = forge.cipher.createCipher('AES-GCM', key)
  cipher.start({ iv, tagLength: 128 })
  cipher.update(forge.util.createBuffer(plaintext, 'utf8'))
  cipher.finish()

  const encrypted = cipher.output.getBytes()
  const tag       = cipher.mode.tag.getBytes()

  // Encode: iv(12) + tag(16) + ciphertext
  const payload = forge.util.encode64(iv + tag + encrypted)
  return payload
}

export function decryptConfig(payload: string, keyHex: string): string {
  const key     = forge.util.hexToBytes(keyHex)
  const raw     = forge.util.decode64(payload)
  const iv      = raw.slice(0, IV_BYTES)
  const tag     = raw.slice(IV_BYTES, IV_BYTES + 16)
  const ciphertext = raw.slice(IV_BYTES + 16)

  const decipher = forge.cipher.createDecipher('AES-GCM', key)
  decipher.start({ iv, tag: forge.util.createBuffer(tag) })
  decipher.update(forge.util.createBuffer(ciphertext))
  const pass = decipher.finish()  // false = authentication failed

  if (!pass) throw new Error('[forge] AES-GCM authentication failed — tampered data')
  return decipher.output.toString()
}
```

---

## Generate AES-256 key from passphrase (PBKDF2)

```javascript
function deriveKey(passphrase: string, saltHex: string, iterations = 100_000): string {
  const salt   = forge.util.hexToBytes(saltHex)
  const keyBuf = forge.pkcs5.pbkdf2(passphrase, salt, iterations, KEY_BYTES, 'sha256')
  return forge.util.bytesToHex(keyBuf)
}

// One-time: generate salt
const salt = forge.util.bytesToHex(forge.random.getBytesSync(16))
const key  = deriveKey(process.env.YAMTAM_PASSPHRASE!, salt)
```

---

## Self-signed X.509 certificate

```javascript
function createSelfSignedCert(commonName: string): { cert: string; key: string } {
  const keys   = forge.pki.rsa.generateKeyPair(2048)
  const cert   = forge.pki.createCertificate()

  cert.publicKey     = keys.publicKey
  cert.serialNumber  = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter  = new Date(Date.now() + 365 * 24 * 3600 * 1000)

  const attrs = [{ name: 'commonName', value: commonName }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  return {
    cert: forge.pki.certificateToPem(cert),
    key:  forge.pki.privateKeyToPem(keys.privateKey),
  }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ AES-CBC instead of AES-GCM → no authentication tag → ciphertext tampered undetected
❌ decipher.finish() return value not checked → decryption succeeds on tampered data
❌ IV reused across encryptions → AES-GCM nonce reuse → catastrophic (key recovery)
❌ PBKDF2 iterations < 100k → brute-forceable with GPU
❌ RSA key size < 2048 → breakable; use 2048 minimum, 4096 for long-lived certs
❌ Salt not stored alongside encrypted data → decryption impossible on next run
```
