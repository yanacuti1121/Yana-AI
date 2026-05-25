# YAMTAM ENGINE — API Security Gate
# Source: OWASP/API-Security-Top-10 (CC BY-SA 4.0) — github.com/OWASP/API-Security-Top-10
# Gate: Action Gate L3 (API code review)

**Status:** Active  
**Tier:** TIER 1 — SECURITY  
**Scope:** All agents generating router code, API endpoints, or external API calls

---

## Core Rule

Agents MUST NOT emit router or API endpoint code without the security middleware checklist
passing. Missing any Tier-A item below → **automatic merge block at Gate L3**.

---

## OWASP API Top 10 — Enforcement Map

| OWASP ID | Risk | Agent Must Ensure |
|---|---|---|
| API1 | BOLA (Broken Object Level Auth) | Every read/write endpoint checks `resource.owner_id == token.user_id` |
| API2 | Broken Authentication | Auth middleware present on ALL non-public routes; no API key in query string |
| API3 | Broken Object Property Auth | Response objects filtered — no `.toJSON()` dumping full DB row |
| API4 | Unrestricted Resource Consumption | Rate limiting middleware applied; pagination required on list endpoints |
| API5 | Broken Function Level Auth | Admin routes behind role check, not just auth check |
| API6 | Unrestricted Access to Sensitive Flows | OTP/password-reset routes have attempt throttle |
| API7 | SSRF | URLs from user input validated against allowlist before any outbound request |
| API8 | Security Misconfiguration | No debug endpoints (`/health/details`, `/metrics`) exposed without auth in prod |
| API9 | Improper Inventory Management | Every new endpoint documented in OpenAPI spec before merge |
| API10 | Unsafe Consumption of APIs | Third-party API responses validated against schema before use |

---

## Gate L3 — Tier A (merge block if missing)

```
□ Auth middleware on route
□ BOLA check: owner verification on resource access
□ Input validation on all path/query/body params
□ Rate limiting on mutation endpoints
□ No secrets in response body (no password hash, no raw token)
```

## Gate L3 — Tier B (warning, not merge block)

```
⚠ Pagination on list endpoints
⚠ OpenAPI spec updated
⚠ SSRF allowlist for user-supplied URLs
⚠ Response schema validation for third-party APIs
```

---

## Anti-patterns (always rejected)

```
❌ app.get('/user/:id', handler)  — no auth middleware
❌ WHERE id = req.params.id       — without verifying ownership
❌ res.json(user)                 — full DB object, not filtered DTO
❌ ?api_key=sk-...                — API key in URL query string
❌ fetch(req.body.url)            — SSRF — user-controlled URL with no allowlist
```

## Compliant Patterns

```typescript
// BOLA-safe resource access
router.get('/posts/:id', authenticate, async (req, res) => {
  const post = await db.post.findUnique({ where: { id: req.params.id } })
  if (post.authorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
  res.json(toPostDTO(post))  // filtered DTO, not raw row
})

// Rate-limited mutation
router.post('/auth/reset-password', rateLimiter({ max: 5, window: '15m' }), handler)
```

---

## Violation Response

```
[yamtam/api-security-gate] BLOCKED — missing Tier A security control
  Endpoint : <method> <path>
  Missing  : <control name>
  OWASP    : <API ID>
  Gate     : L3
  Fix      : Add the required middleware/check before committing
```
