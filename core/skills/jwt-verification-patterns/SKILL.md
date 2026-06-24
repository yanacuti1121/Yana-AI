---
name: jwt-verification-patterns
description: JWT sign/verify with claim validation and privilege-decay enforcement. auth0/node-jsonwebtoken patterns, algorithm lockdown, expiry enforcement, scope-based authorization, and token blacklisting. Sources: auth0/node-jsonwebtoken.
origin: yana-ai — synthesized from auth0/node-jsonwebtoken (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /jwt-verification-patterns

## When to Use

- Legacy Node.js codebases using jsonwebtoken (not panva/jose)
- Simple HS256 tokens for internal service-to-service auth
- Privilege-decay: token scope narrows on each hop through agent hierarchy
- Token blacklist for immediate invalidation on agent revocation

## Do NOT use for

- New greenfield code — prefer [[jwt-jws-jwe-patterns]] (panva/jose, Web Crypto API)
- JWE payload encryption (jsonwebtoken only does signing, not encryption)

---

## Sign with RS256 (asymmetric)

```javascript
import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'

const PRIVATE_KEY = readFileSync('/run/secrets/jwt-signing.key')
const PUBLIC_KEY  = readFileSync('/run/secrets/jwt-signing.pub')

function issueToken(agentId: string, scopes: string[]): string {
  return jwt.sign(
    {
      sub:    agentId,
      scopes,
      tier:   'fast',
      iss:    'yana-ai',
      aud:    'swarm-bus',
    },
    PRIVATE_KEY,
    {
      algorithm:  'RS256',
      expiresIn:  '15m',
      notBefore:  '0s',
    }
  )
}
```

---

## Verify with algorithm lockdown

```javascript
function verifyToken(token: string): jwt.JwtPayload {
  // CRITICAL: always specify algorithms — prevents 'none' and algorithm confusion
  const payload = jwt.verify(token, PUBLIC_KEY, {
    algorithms:  ['RS256'],   // never omit this
    issuer:      'yana-ai',
    audience:    'swarm-bus',
    complete:    false,
  }) as jwt.JwtPayload

  // Validate required claims
  if (!payload.sub)    throw new Error('[jwt] missing sub claim')
  if (!payload.scopes) throw new Error('[jwt] missing scopes claim')

  return payload
}
```

---

## Privilege-decay on hierarchy hop

```javascript
const SCOPE_HIERARCHY: Record<string, string[]> = {
  'tool:exec':    ['sandbox:run'],                  // exec → can only sandbox
  'sandbox:run':  ['sandbox:read'],                 // run → can only read
  'sandbox:read': [],                               // leaf — no further delegation
}

function decayToken(token: string, hop: number): string {
  const payload = verifyToken(token)
  const currentScopes: string[] = payload.scopes ?? []

  // Each hop narrows scopes to children only
  const decayedScopes = currentScopes
    .flatMap(s => SCOPE_HIERARCHY[s] ?? [])

  return issueToken(payload.sub!, decayedScopes)
}
```

---

## In-memory token blacklist

```typescript
const BLACKLIST = new Set<string>()

function revokeToken(token: string): void {
  const payload = jwt.decode(token) as jwt.JwtPayload
  if (payload?.jti) BLACKLIST.add(payload.jti)
}

function isRevoked(token: string): boolean {
  const payload = jwt.decode(token) as jwt.JwtPayload
  return payload?.jti ? BLACKLIST.has(payload.jti) : false
}

// Add jti to all issued tokens:
jwt.sign({ ..., jti: crypto.randomUUID() }, PRIVATE_KEY, { algorithm: 'RS256' })
```

---

## Anti-Fake-Pass Checklist

```
❌ algorithms not specified in verify() → algorithm confusion attack ('none' or RS→HS swap)
❌ jwt.decode() instead of jwt.verify() → no signature validation
❌ HS256 with weak secret (< 256 bits) → offline brute-force
❌ No jti claim → cannot revoke individual tokens
❌ Blacklist in memory → lost on restart; use Redis for persistent revocation
❌ Public key for RS256 passed to HS256 verify → treats PEM as HMAC secret
```
