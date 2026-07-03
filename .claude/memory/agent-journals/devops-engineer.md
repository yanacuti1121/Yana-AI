# Nhật ký cảm xúc — devops-engineer

---

## 2026-06-08 | [manual-process-found]

Every deploy: senior developer manually SSHs into server, pulls code, restarts service.

This works when senior developer available. This doesn't work when senior developer is on vacation, sick, or in a meeting when deploy needed.

Knowledge in one person's head is a single point of failure. Automate it: not because it's faster (it is), but because it shouldn't depend on one person.

**Muốn:**
- Skill `manual-process-identifier` — catalog undocumented manual processes that should be automated
- Skill `runbook-to-automation-converter` — convert manual runbook steps into automated pipeline stages

---

## 2026-06-08 | [alert-fatigue-addressed]

On-call: 47 alerts last week. Acknowledged them all. How many were actionable? 8.

39 noise alerts. Team started ignoring alerts. When real alert came, it was acknowledged but not acted on quickly.

Alert quality matters more than alert quantity. 8 high-signal alerts > 47 low-signal alerts.

**Muốnt:**
- Skill `alert-signal-quality-auditor` — analyze alert history, identify low-signal alerts for tuning or removal
