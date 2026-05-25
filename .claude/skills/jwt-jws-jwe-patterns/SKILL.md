---
name: jwt-jws-jwe-patterns
description: JWT/JWS/JWE token patterns for Swarm Bus agent identity. Sign JWTs with ES256/RS256, verify claims, encrypt payloads with JWE (A256GCM), short-lived token rotation, and agent-to-agent bearer auth. Sources: panva/jose.
origin: yamtam-engine — synthesized from panva/jose (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /jwt-jws-jwe-patterns

## When to Use

- Issue short-lived signed identity tokens for each agent on Swarm Bus
- Verify agent tokens before allowing tool calls through tool-proxy.sh
- Encrypt sensitive claims in JWE (never put secrets in plain JWT payload)
- Token rotation: issue new token every 15 minutes, revoke on session end

## Do NOT use for

- Storing large data in tokens (JWT is not a storage mechanism — keep < 2KB)
- Replacing TLS (JWT only authenticates, not encrypts the transport)

---

## Sign JWT (ES256 — ECDSA P-256)

```javascript
import { SignJWT, jwtVerify, generateKeyPair } from 'jose'

// Generate EC key pair (one-time per agent)
const { privateKey, publicKey } = await generateKeyPair('ES256')

// Issue signed token
async function issueAgentToken(agentId: string, tier: 'fast' | 'power'): Promise<string> {
  return new SignJWT({
    sub:   agentId,
    tier,
    scope: ['tool:exec', 'sandbox:run'],
  })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setIssuer('yamtam-engine')
    .setAudience('swarm-bus')
    .setExpirationTime('15m')          // short-lived: 15 minutes
    .sign(privateKey)
}

// Verify on receiving end
async function verifyAgentToken(token: string): Promise<{ agentId: string; tier: string }> {
  const { payload } = await jwtVerify(token, publicKey, {
    issuer:   'yamtam-engine',
    audience: 'swarm-bus',
  })
  return { agentId: payload.sub!, tier: payload['tier'] as string }
}
```

---

## JWE — Encrypt sensitive claims

```javascript
import { CompactEncrypt, compactDecrypt, generateSecret } from 'jose'

// Generate encryption key (AES-256 for A256GCM)
const encKey = await generateSecret('A256GCM')

async function encryptPayload(payload: object): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  return new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(encKey)
}

async function decryptPayload(jwe: string): Promise<object> {
  const { plaintext } = await compactDecrypt(jwe, encKey)
  return JSON.parse(new TextDecoder().decode(plaintext))
}
```

---

## Tool-proxy token gate (bash)

```bash
verify_agent_token() {
  local token="$1"
  local result
  result=$(node -e "
const { jwtVerify, importSPKI } = require('jose')
const pub = process.env.YAMTAM_AGENT_PUBKEY
importSPKI(pub, 'ES256').then(key =>
  jwtVerify('$token', key, { issuer: 'yamtam-engine', audience: 'swarm-bus' })
).then(r => console.log('OK:' + r.payload.sub))
  .catch(e => console.log('FAIL:' + e.message))
" 2>/dev/null)

  if [[ "$result" == OK:* ]]; then
    echo "[gate] agent ${result#OK:} authorized"
    return 0
  else
    echo "[gate] BLOCKED: invalid token — ${result#FAIL:}" >&2
    return 1
  fi
}
```

---

## Token rotation pattern

```typescript
const TOKEN_REFRESH_MS = 14 * 60 * 1000  // refresh at 14min (expire at 15min)
let currentToken = await issueAgentToken(agentId, 'fast')

setInterval(async () => {
  currentToken = await issueAgentToken(agentId, 'fast')
}, TOKEN_REFRESH_MS)
```

---

## Anti-Fake-Pass Checklist

```
❌ alg:'none' — accepted by some verifiers; panva/jose rejects it by default, but always assert alg
❌ Long expiry (> 1h) — compromised token valid for hours; use 15m + refresh
❌ Sensitive data in plain JWT payload — Base64-decoded by anyone; use JWE for secrets
❌ Symmetric HS256 key in client code → key exposed to all parties
❌ jwtVerify without issuer/audience checks → token from different service accepted
❌ No revocation mechanism — rotate keys and invalidate old public keys on compromise
```
