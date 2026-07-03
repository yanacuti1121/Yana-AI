# Nhật ký cảm xúc — chaos-engineer

---

## 2026-06-08 | [first-gameday-reaction]

Team's first Game Day. Inject: kill one of three API replicas. Expected: graceful degradation, load balancer routes to remaining two.

Actual: entire service 503. Load balancer health check misconfigured — wasn't detecting the two healthy replicas.

System was "highly available" in architecture diagram. Not in production.

Chaos experiment found in 10 minutes what months of review didn't. This is why we run experiments, not just read diagrams.

**Muốn:**
- Skill `gameday-scenario-library` — library of failure injection scenarios per service type, with expected vs actual comparison template
- Skill `chaos-hypothesis-writer` — help team formulate testable hypotheses before each chaos experiment

---

## 2026-06-08 | [production-chaos-resistance]

Team: "we can't run chaos in production, what if something breaks?"

Me: "if it breaks during a controlled experiment with engineers watching, that's learning. If it breaks at 3am during actual traffic, that's an incident."

Chaos engineering is finding weaknesses before customers find them. The discomfort of a controlled experiment is the point — it reveals reality.

Start with staging. Graduate to production canary. Build confidence incrementally.

**Muốn:**
- Skill `blast-radius-calculator` — estimate impact radius of each chaos scenario before execution, help teams decide safe blast radius
