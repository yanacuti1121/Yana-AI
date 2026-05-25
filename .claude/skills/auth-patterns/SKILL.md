---
name: auth-patterns
description: >
  Design authentication and authorization systems — JWT lifecycle, OAuth 2.0 /
  OIDC flows, token storage, refresh strategy, RBAC and ABAC permission models.
  Use when asked about "login flow", "JWT", "OAuth", "refresh token", "access
  control", "permissions", "RBAC", "who can see what", or "auth is broken".
  Do NOT use for: session-based auth vs token trade-off analysis (that's an
  architecture decision) or security penetration testing (use `red-team-check`).
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Any backend/frontend stack. Framework-agnostic patterns."
---

## When to Use

- Use when: designing login / registration flow for a new service
- Use when: JWT tokens are leaking, expired unexpectedly, or over-broad
- Use when: designing a permissions model (who can do what)
- Use when: adding OAuth / "Login with Google/GitHub" to an app
- Do NOT use for: cryptographic implementation details — use a library

---

## JWT Lifecycle

### Structure
```
header.payload.signature
```
Payload contains claims — never put sensitive data (passwords, PII) in JWT payload.
It is base64-encoded, not encrypted — anyone can decode it.

### Access token + refresh token pattern
```
Access token:  short-lived (15 min – 1 hour)
               stored in memory (JS variable) — NOT localStorage
               sent as: Authorization: Bearer <token>

Refresh token: long-lived (7–30 days)
               stored in httpOnly, Secure, SameSite=Strict cookie
               used only to get a new access token
               rotated on every use (rotation invalidates old token)
```

### Token storage rules
| Storage | XSS risk | CSRF risk | Use for |
|---|---|---|---|
| Memory (JS var) | Low | None | Access token (lost on refresh) |
| httpOnly cookie | None (JS can't read) | Yes (mitigate with SameSite) | Refresh token |
| localStorage | High (XSS steals it) | None | **Never for tokens** |
| sessionStorage | High | None | **Never for tokens** |

### Revocation
JWTs are stateless — can't be revoked until expiry without a denylist.
For immediate revocation (logout, compromise): maintain a denylist in Redis keyed by `jti` (JWT ID). Check on every request.

---

## OAuth 2.0 Flows

### Authorization Code + PKCE (recommended for all clients)
```
1. App generates code_verifier (random 43–128 chars) + code_challenge = SHA256(verifier)
2. Redirect user → /authorize?response_type=code&code_challenge=...&code_challenge_method=S256
3. User authenticates → provider redirects back with ?code=AUTH_CODE
4. App exchanges: POST /token { code, code_verifier, client_id, redirect_uri }
5. Provider returns: { access_token, refresh_token, id_token }
```
PKCE prevents authorization code interception attacks — required for SPAs and mobile.

### Which flow to use
| Client type | Flow |
|---|---|
| Web app (server-side) | Authorization Code + PKCE |
| SPA | Authorization Code + PKCE (no client_secret) |
| Mobile | Authorization Code + PKCE |
| Server-to-server | Client Credentials |
| **Never use** | Implicit flow (deprecated), Password Grant (except legacy migration) |

### OIDC (OpenID Connect)
OIDC = OAuth 2.0 + identity layer. Add `openid` scope to get an `id_token` (JWT with user identity).
Use `id_token` to confirm who the user is. Use `access_token` to call APIs.

---

## Authorization Models

### RBAC (Role-Based Access Control)
```
User → has Roles → Roles have Permissions → Permissions allow Actions on Resources

Example:
  Role: admin    → permissions: [users:read, users:write, billing:read, billing:write]
  Role: editor   → permissions: [content:read, content:write]
  Role: viewer   → permissions: [content:read]
```
Good for: clear org hierarchies, most SaaS apps.
Weakness: role explosion when exceptions accumulate.

### ABAC (Attribute-Based Access Control)
```
Decision = f(subject_attrs, resource_attrs, environment_attrs, action)

Example policy:
  ALLOW if user.department == resource.department AND user.clearance >= resource.classification
```
Good for: complex, context-dependent rules (time-of-day, IP range, data classification).
Weakness: harder to audit than RBAC — "why can Alice do X?" requires policy tracing.

### Hybrid (RBAC + resource ownership)
Most apps need: RBAC for broad roles + ownership check for row-level access:
```
canEdit(user, document):
  return user.role == 'admin' OR document.owner_id == user.id
```

---

## Common Auth Mistakes

| Mistake | Fix |
|---|---|
| Long-lived access tokens (days) | Max 1 hour; use refresh token rotation |
| JWT secret hardcoded in code | Env var; rotate on compromise |
| No token expiry check on backend | Always validate `exp` claim server-side |
| Permissions checked only on frontend | Always enforce on backend — UI is advisory only |
| `user_id` in URL without ownership check | Verify `resource.owner_id == authenticated_user_id` |
| Refresh token in localStorage | httpOnly cookie only |

---

## Anti-Fake-Pass Rules

Before claiming auth is done, you MUST show:
- [ ] Access token: short-lived (≤ 1 hour), stored in memory not localStorage
- [ ] Refresh token: httpOnly cookie, rotated on use
- [ ] Backend validates token signature and `exp` on every protected request
- [ ] Authorization: every endpoint checks both authentication AND permission
- [ ] RBAC/ABAC: permissions enforced server-side, not just hidden in UI

Reference: `gates/anti-fake-pass-gate.md`
