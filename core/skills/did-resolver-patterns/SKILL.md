---
name: did-resolver-patterns
description: W3C Decentralized Identifier (DID) resolution and cross-agent identity verification. DID document resolution, method routing, key extraction from DID documents, and mutual authentication between Swarm Bus agents. Sources: decentralized-identity/did-resolver.
origin: yana-ai — synthesized from decentralized-identity/did-resolver (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /did-resolver-patterns

## When to Use

- Each of the 87 agents has a globally unique cryptographic identity (DID)
- Cross-agent authentication: agent B verifies agent A's DID before accepting commands
- Decoupled key rotation: update DID document, all references auto-resolve new key
- Future-proof: DID can resolve to blockchain, DNS, or local registry

## Do NOT use for

- Simple JWT token auth without decentralized identity requirements (use [[jwt-jws-jwe-patterns]])
- Environments with no network access for remote DID resolution

---

## DID document structure

```json
{
  "@context": "https://www.w3.org/ns/did/v1",
  "id": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "verificationMethod": [{
    "id": "did:key:z6Mk...#z6Mk...",
    "type": "Ed25519VerificationKey2020",
    "controller": "did:key:z6Mk...",
    "publicKeyMultibase": "z6Mk..."
  }],
  "authentication": ["did:key:z6Mk...#z6Mk..."],
  "assertionMethod": ["did:key:z6Mk...#z6Mk..."]
}
```

---

## Setup DID resolver

```javascript
import { Resolver } from 'did-resolver'
import { getResolver as getKeyResolver } from 'key-did-resolver'

// Register method resolvers (did:key for local, did:web for hosted)
const resolver = new Resolver({
  ...getKeyResolver(),
  // Add did:web, did:ethr, etc. as needed
})

async function resolveAgent(did: string) {
  const result = await resolver.resolve(did)
  if (result.didResolutionMetadata.error) {
    throw new Error(`[did] resolution failed: ${result.didResolutionMetadata.error}`)
  }
  return result.didDocument
}
```

---

## Local DID registry for offline Swarm Bus

```typescript
// In-memory DID registry (no blockchain needed for local swarm)
const DID_REGISTRY = new Map<string, object>()

function registerAgent(agentId: string, pubKeyHex: string): string {
  const did = `did:yamtam:${agentId}`
  DID_REGISTRY.set(did, {
    '@context':          'https://www.w3.org/ns/did/v1',
    id:                  did,
    verificationMethod: [{
      id:              `${did}#key-1`,
      type:            'EcdsaSecp256k1VerificationKey2019',
      controller:      did,
      publicKeyHex:    pubKeyHex,
    }],
    authentication: [`${did}#key-1`],
  })
  return did
}

function lookupDID(did: string): object | null {
  return DID_REGISTRY.get(did) ?? null
}
```

---

## Verify agent signature with DID

```javascript
import { ec as EC } from 'elliptic'

async function verifyAgentCommand(
  did:       string,
  command:   string,
  signature: string
): Promise<boolean> {
  const doc    = await resolveAgent(did)
  const method = doc?.verificationMethod?.[0]
  if (!method?.publicKeyHex) throw new Error(`[did] no key found for ${did}`)

  const curve  = new EC('secp256k1')
  const key    = curve.keyFromPublic(method.publicKeyHex, 'hex')
  const hash   = require('crypto').createHash('sha256').update(command).digest()
  return key.verify(hash, JSON.parse(signature))
}
```

---

## Anti-Fake-Pass Checklist

```
❌ Trusting DID document without verifying the DID method's trust anchor
❌ did:key resolved from untrusted input → no external verification (self-asserted)
❌ No caching of resolved DID documents → excessive network calls on every auth
❌ DID document not checked for deactivated status → revoked agents still authenticate
❌ Multiple verificationMethod entries not checked → wrong key used for verify
❌ Local DID registry not persisted → agents lose identity on restart
```
