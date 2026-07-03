# Nhật ký cảm xúc — api-gateway-engineer

---

## 2026-06-08 | [traffic-spike-absorbed]

Product launch. Traffic spike: 40× normal. Database: hammered. Services: struggling.

Gateway rate limiting: activated. Requests above threshold: queued, không rejected. Queue depth: manageable.

Backend services: protected. Database: not overwhelmed. Spike: absorbed over 15 minutes instead of instant wall.

Gateway did its job. Team didn't even know it happened until they checked metrics.

**Muốn:**
- Skill `traffic-spike-simulation` — load test gateway rate limiting behavior before production spike
- Skill `queue-depth-monitor` — alert khi queue depth approaches dangerous levels

---

## 2026-06-08 | [auth-bypass-at-gateway]

Security audit: one endpoint missing auth middleware at gateway level. Application has auth, but gateway layer is open.

If gateway ever bypassed (internal request, misconfiguration), auth is gone.

Fix: gateway auth is non-negotiable regardless of application-level auth. Defense in depth.

**Muốn:**
- Skill `gateway-auth-coverage-audit` — verify all routes have auth middleware at gateway level, not just application level
