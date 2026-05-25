---
name: auth-strategy-patterns
description: Pluggable authentication strategy architecture. Passport.js strategy pattern, bearer token strategy, local strategy, strategy switching between token/key/signature auth, and session-less agent auth. Sources: jaredhanson/passport.
origin: yamtam-engine — synthesized from jaredhanson/passport (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /auth-strategy-patterns

## When to Use

- Agent HTTP server needs interchangeable auth strategies (bearer, API key, mTLS)
- Building middleware that dispatches to different auth mechanisms per endpoint
- Abstracting auth so the same agent code works in dev (simple) and prod (PKI)
- Multi-strategy: try Bearer first, fallback to API key

## Do NOT use for

- CLI-only agents with no HTTP server (use direct JWT verify)
- Stateful session-based auth (agents are stateless — use JWT, not sessions)

---

## Bearer token strategy (Express)

```javascript
import passport        from 'passport'
import { Strategy as BearerStrategy } from 'passport-http-bearer'
import { verifyToken } from './jwt-verification.js'

passport.use('bearer', new BearerStrategy(async (token, done) => {
  try {
    const payload = verifyToken(token)
    done(null, payload, { scope: payload.scopes })
  } catch (err: any) {
    done(null, false, { message: err.message })
  }
}))

// Protect endpoint
app.post('/api/tool-call',
  passport.authenticate('bearer', { session: false }),
  (req, res) => {
    const agent = req.user as { sub: string; scopes: string[] }
    if (!agent.scopes.includes('tool:exec')) {
      return res.status(403).json({ error: 'insufficient scope' })
    }
    // handle tool call
  }
)
```

---

## API key strategy

```javascript
import { Strategy as HeaderAPIKeyStrategy } from 'passport-headerapikey'

passport.use('api-key', new HeaderAPIKeyStrategy(
  { header: 'X-Yamtam-Key', prefix: '' },
  false,
  async (apiKey, done) => {
    const agent = await lookupAgentByKey(apiKey)
    if (!agent) return done(null, false)
    done(null, agent)
  }
))
```

---

## Strategy router (try Bearer, fallback API key)

```javascript
import { RequestHandler } from 'express'

export function multiAuth(...strategies: string[]): RequestHandler {
  return (req, res, next) => {
    const tryStrategy = (i: number) => {
      if (i >= strategies.length) {
        return res.status(401).json({ error: 'authentication required' })
      }
      passport.authenticate(strategies[i], { session: false }, (err, user) => {
        if (err)   return next(err)
        if (!user) return tryStrategy(i + 1)
        req.user = user
        next()
      })(req, res, next)
    }
    tryStrategy(0)
  }
}

app.use('/api/', multiAuth('bearer', 'api-key'))
```

---

## Session-less agent auth (no serialize/deserialize)

```javascript
// Explicitly opt out of sessions for stateless agents
passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((user, done) => done(null, user as Express.User))
// Or simply pass { session: false } to every authenticate() call
```

---

## Anti-Fake-Pass Checklist

```
❌ session: true (default) without session middleware → crashes on serialization
❌ No scope check after authentication → authenticated agent can call any endpoint
❌ Fallback strategy more permissive than primary → attacker bypasses bearer with weak key
❌ done(err) vs done(null, false) — error triggers 500, false triggers 401
❌ Bearer token from Authorization header not trimmed → 'Bearer TOKEN' not 'TOKEN'
❌ Passport.initialize() middleware not added → req.user undefined silently
```
