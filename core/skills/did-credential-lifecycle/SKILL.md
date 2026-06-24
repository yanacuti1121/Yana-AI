---
name: did-credential-lifecycle
description: Verifiable credential lifecycle management for agent identity. Issue, verify, revoke credentials, DID document key rotation, credential schema validation, and W3C VC data model compliance. Sources: microsoft/did-sdk-js, W3C VC spec.
origin: yana-ai — synthesized from microsoft/did-sdk-js (MIT), W3C Verifiable Credentials Data Model 1.1
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /did-credential-lifecycle

## When to Use

- Full lifecycle management: issue → present → verify → revoke agent credentials
- Key rotation: update DID document when signing key is compromised
- Credential schema validation: ensure agent credentials conform to expected structure
- Multi-issuer trust: accept credentials from a set of trusted issuers only

## Do NOT use for

- Simple JWT token auth (use [[jwt-jws-jwe-patterns]])
- Single-agent environments without identity governance requirements

---

## W3C Verifiable Credential structure

```typescript
interface VerifiableCredential {
  '@context':          string[]
  id:                  string
  type:                string[]
  issuer:              string | { id: string }
  issuanceDate:        string
  expirationDate?:     string
  credentialSubject:   Record<string, unknown>
  credentialStatus?: {
    id:   string
    type: string
  }
  proof: {
    type:               string
    created:            string
    verificationMethod: string
    proofPurpose:       string
    jws:                string
  }
}
```

---

## Issue credential

```javascript
function issueCredential(params: {
  issuerDid:  string
  issuerPriv: string
  subjectDid: string
  claims:     Record<string, unknown>
  ttlHours:   number
}): VerifiableCredential {
  const { issuerDid, issuerPriv, subjectDid, claims, ttlHours } = params
  const now       = new Date()
  const expiry    = new Date(now.getTime() + ttlHours * 3600 * 1000)

  const credential = {
    '@context':       ['https://www.w3.org/2018/credentials/v1'],
    id:               `urn:yamtam:vc:${Date.now()}`,
    type:             ['VerifiableCredential'],
    issuer:           issuerDid,
    issuanceDate:     now.toISOString(),
    expirationDate:   expiry.toISOString(),
    credentialSubject: { id: subjectDid, ...claims },
  }

  const jws = signCommand(issuerPriv, JSON.stringify(credential))

  return { ...credential, proof: {
    type:               'EcdsaSecp256k1Signature2019',
    created:            now.toISOString(),
    verificationMethod: `${issuerDid}#key-1`,
    proofPurpose:       'assertionMethod',
    jws,
  }}
}
```

---

## Verify credential

```javascript
async function verifyCredential(
  vc:             VerifiableCredential,
  trustedIssuers: string[]
): Promise<{ valid: boolean; reason?: string }> {
  // 1. Check issuer trust
  const issuer = typeof vc.issuer === 'string' ? vc.issuer : vc.issuer.id
  if (!trustedIssuers.includes(issuer)) {
    return { valid: false, reason: `untrusted issuer: ${issuer}` }
  }

  // 2. Check expiry
  if (vc.expirationDate && new Date(vc.expirationDate) < new Date()) {
    return { valid: false, reason: 'credential expired' }
  }

  // 3. Verify proof signature
  const doc     = await resolveAgent(issuer)  // from did-resolver-patterns
  const pubKey  = doc?.verificationMethod?.[0]?.publicKeyHex
  if (!pubKey)  return { valid: false, reason: 'cannot resolve issuer key' }

  const payload = { ...vc }
  delete (payload as any).proof

  const valid = verifyCommand(pubKey, JSON.stringify(payload), vc.proof.jws)
  return valid ? { valid: true } : { valid: false, reason: 'invalid signature' }
}
```

---

## Key rotation

```javascript
function rotateKey(did: string, oldPriv: string, newPubHex: string): object {
  const updateDoc = {
    '@context': 'https://www.w3.org/ns/did/v1',
    id: did,
    verificationMethod: [{
      id:              `${did}#key-2`,
      type:            'EcdsaSecp256k1VerificationKey2019',
      controller:      did,
      publicKeyHex:    newPubHex,
    }],
    authentication: [`${did}#key-2`],
  }
  // Sign the update with old key to prove authorization
  const sig = signCommand(oldPriv, JSON.stringify(updateDoc))
  return { ...updateDoc, updateProof: { jws: sig, signingKey: `${did}#key-1` } }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ No expiry on credentials → valid indefinitely, cannot force re-authentication
❌ Trusting any issuer → accept credentials from attacker-controlled DID
❌ Proof signature verified but issuer DID not checked → forged issuer field
❌ Key rotation without revocation list → old key signatures still accepted
❌ Credential status not checked → revoked credentials accepted as valid
❌ '@context' not validated → missing context means non-standard claims
```
