---
name: immutable-identity-patterns
description: Immutable agent identity using content-addressed identifiers. ethr-did patterns, deterministic ID generation from public key hash, identity anchoring, and verifiable credential issuance. Sources: uport-project/ethr-did.
origin: yana-ai — synthesized from uport-project/ethr-did (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /immutable-identity-patterns

## When to Use

- Generate stable, unforgeable agent IDs derived from cryptographic public keys
- Agent ID that cannot change even if the agent's config or code changes
- Content-addressed identity: same key = same ID across restarts/environments
- Foundation for [[did-resolver-patterns]] in Swarm Bus

## Do NOT use for

- Temporary session IDs (use UUID v4 instead)
- Identities requiring human-readable names (use DNS-based DID)

---

## Deterministic ID from public key

```javascript
import { createHash } from 'crypto'
import { ec as EC }   from 'elliptic'

// Generate stable agent identity from EC key pair
function createAgentIdentity(privKeyHex?: string): {
  did:     string
  pubKey:  string
  privKey: string
  address: string
} {
  const curve  = new EC('secp256k1')
  const kp     = privKeyHex
    ? curve.keyFromPrivate(privKeyHex, 'hex')
    : curve.genKeyPair()

  const pubHex = kp.getPublic('hex')

  // Ethereum-style address: keccak256(pubKey)[12:] — 20 bytes
  const pubBytes  = Buffer.from(pubHex, 'hex').slice(1)  // remove 04 prefix
  const hash      = createHash('sha256').update(pubBytes).digest()
  const address   = '0x' + hash.slice(-20).toString('hex')

  const did = `did:yamtam:${address}`

  return {
    did,
    pubKey:  pubHex,
    privKey: kp.getPrivate('hex'),
    address,
  }
}
```

---

## ethr-did pattern (Ethereum-anchored DID)

```javascript
import { EthrDID } from 'ethr-did'
import { ethers }  from 'ethers'

// Generate deterministic identity from private key
function createEthrDID(privKeyHex: string): { did: string; address: string } {
  const wallet  = new ethers.Wallet('0x' + privKeyHex)
  const ethrDid = new EthrDID({
    identifier: wallet.address,
    chainNameOrId: 'mainnet',  // or 'goerli', or a local chain ID
  })
  return { did: ethrDid.did, address: wallet.address }
}
```

---

## Verifiable Credential issuance

```typescript
interface AgentCredential {
  '@context':          string[]
  type:                string[]
  issuer:              string
  credentialSubject: {
    id:     string
    tier:   string
    scopes: string[]
  }
  proof: {
    type:               string
    created:            string
    verificationMethod: string
    jws:                string
  }
}

function issueAgentCredential(
  issuerDid:   string,
  issuerPriv:  string,
  agentDid:    string,
  tier:        string,
  scopes:      string[]
): AgentCredential {
  const credential = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type:       ['VerifiableCredential', 'AgentIdentityCredential'],
    issuer:     issuerDid,
    credentialSubject: { id: agentDid, tier, scopes },
  }

  const payload = JSON.stringify(credential)
  const jws     = signCommand(issuerPriv, payload)  // from ecc-key-management

  return { ...credential, proof: {
    type: 'EcdsaSecp256k1Signature2019',
    created: new Date().toISOString(),
    verificationMethod: `${issuerDid}#key-1`,
    jws,
  }}
}
```

---

## Agent identity bootstrap

```bash
# Generate once, store in secrets
node -e "
const { ec: EC } = require('elliptic')
const { createHash } = require('crypto')
const kp   = new (new EC('secp256k1')).constructor('secp256k1').genKeyPair()
const pub  = kp.getPublic('hex')
const priv = kp.getPrivate('hex')
const addr = '0x' + createHash('sha256').update(Buffer.from(pub,'hex').slice(1)).digest().slice(-20).toString('hex')
console.log('DID:       did:yamtam:' + addr)
console.log('PRIV_KEY:  ' + priv)
console.log('PUB_KEY:   ' + pub)
"
```

---

## Anti-Fake-Pass Checklist

```
❌ UUID v4 as agent ID — not cryptographically bound to key, can be guessed or forged
❌ Ethereum address from uncompressed public key without removing 04 prefix → wrong address
❌ DID changes if key is rotated without updating DID document → identity breaks
❌ Private key not backed up → identity unrecoverable on key loss
❌ Same key reused for signing and ECDH — key separation is best practice
❌ Verifiable credential without expiry → credentials valid indefinitely
```
