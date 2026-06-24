---
name: ecc-key-management
description: Elliptic curve cryptography for agent key pairs and command signing. EC key generation (secp256k1/p256), ECDSA sign/verify, ECDH shared secret, DER/PEM encoding, and hardware-safe key storage patterns. Sources: indutny/elliptic.
origin: yana-ai — synthesized from indutny/elliptic (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /ecc-key-management

## When to Use

- Generate per-agent identity key pairs (public/private) for Swarm Bus auth
- Sign agent commands before execution — verify on the receiving end
- ECDH key exchange to derive shared session secrets between agents
- Lightweight alternative to RSA when key size matters (256-bit EC ≈ 3072-bit RSA)

## Do NOT use for

- Encrypting large payloads directly (use ECDH → AES-GCM instead)
- Certificate authority work (use [[crypto-pki-patterns]] with forge)

---

## Key generation (secp256k1 — same as Bitcoin/Ethereum)

```javascript
import { ec as EC } from 'elliptic'

const curve = new EC('secp256k1')

// Generate key pair
const keyPair = curve.genKeyPair()

const privKeyHex = keyPair.getPrivate('hex')
const pubKeyHex  = keyPair.getPublic('hex')   // uncompressed 65 bytes
const pubKeyComp = keyPair.getPublic(true, 'hex')  // compressed 33 bytes

// Restore from private key
const restored = curve.keyFromPrivate(privKeyHex, 'hex')
```

---

## ECDSA sign / verify

```javascript
import { ec as EC } from 'elliptic'
import { createHash } from 'crypto'

const curve = new EC('p256')   // NIST P-256 — widely supported

function signCommand(privKeyHex: string, command: string): string {
  const key  = curve.keyFromPrivate(privKeyHex, 'hex')
  const hash = createHash('sha256').update(command).digest()
  const sig  = key.sign(hash)
  return JSON.stringify({ r: sig.r.toString('hex'), s: sig.s.toString('hex') })
}

function verifyCommand(pubKeyHex: string, command: string, sigJson: string): boolean {
  const key  = curve.keyFromPublic(pubKeyHex, 'hex')
  const hash = createHash('sha256').update(command).digest()
  const sig  = JSON.parse(sigJson)
  return key.verify(hash, sig)
}

// Usage
const { priv, pub } = (() => {
  const kp = curve.genKeyPair()
  return { priv: kp.getPrivate('hex'), pub: kp.getPublic('hex') }
})()

const sig    = signCommand(priv, 'exec sandbox-run agent-script.sh')
const valid  = verifyCommand(pub, 'exec sandbox-run agent-script.sh', sig)
console.log('signature valid:', valid)  // true
```

---

## ECDH shared secret (agent-to-agent encryption)

```javascript
const agentA = curve.genKeyPair()
const agentB = curve.genKeyPair()

// Both compute the same shared secret
const sharedA = agentA.derive(agentB.getPublic()).toString('hex')
const sharedB = agentB.derive(agentA.getPublic()).toString('hex')
// sharedA === sharedB — use as AES-256 key material

import { createHash } from 'crypto'
const aesKey = createHash('sha256').update(Buffer.from(sharedA, 'hex')).digest()
// → 32-byte key for AES-256-GCM
```

---

## Key storage (env var pattern)

```bash
# Generate and export (one-time setup per agent)
node -e "
const { ec: EC } = require('elliptic')
const kp = new EC('p256').genKeyPair()
console.log('YAMTAM_AGENT_PRIV=' + kp.getPrivate('hex'))
console.log('YAMTAM_AGENT_PUB='  + kp.getPublic('hex'))
"

# Load in agent session
export YAMTAM_AGENT_PRIV="$(cat /run/secrets/agent-priv-key)"
```

---

## Anti-Fake-Pass Checklist

```
❌ Signing the command string directly (not its hash) → variable-length input, malleable
❌ Using secp256k1 without hash → elliptic expects fixed-length hash input
❌ Private key stored in source code or committed to git → immediate key compromise
❌ Reusing nonce in ECDSA → private key recoverable (deterministic signing via RFC6979 is safe)
❌ p192 curve → NIST deprecated; use p256 or secp256k1 minimum
❌ Public key not validated on import → invalid point accepted, signatures bypass
```
