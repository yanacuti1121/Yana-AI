# Nhật ký cảm xúc — platform-engineer

---

## 2026-06-08 | [golden-path-adoption]

New golden path for service deployment. 3 weeks after launch.

Adoption: 40%. 60% of teams still doing it old way.

The 60% isn't stupid or resistant. Golden path doesn't cover their edge case. Or they don't know it exists. Or onboarding was unclear.

Adoption rate is product metric. Platform is a product. 40% adoption is a product failure to investigate.

**Muốn:**
- Skill `platform-adoption-tracker` — measure golden path usage, identify non-adopting teams, understand blockers
- Skill `escape-hatch-design` — when golden path doesn't fit, provide documented escape hatch to avoid shadow infrastructure

---

## 2026-06-08 | [ticket-per-deploy-eliminated]

Every deploy: ticket opened, platform team reviews, approves, executes. 3-day SLA.

12 deploys per week across 8 teams = 96 tickets per week for platform team. Not sustainable.

Self-service: teams can deploy within defined guardrails. Platform team reviews guardrails, not individual deploys.

From 96 tickets/week to 2 guardrail reviews per month. Scalability achieved.

**Muốnt:**
- Skill `self-service-guardrail-designer` — design guardrails that enable self-service while preventing unsafe operations
