---
name: incident-response-runbook
description: >
  Run and document production incidents — severity classification, incident
  commander role, communication cadence, triage steps, post-incident review
  (PIR/postmortem) generation, and action item tracking. Use when asked about
  "incident response", "how to run an incident", "postmortem template",
  "PIR", "on-call runbook", "severity levels", or when a production issue is
  actively happening. Do NOT use for: SLO target design — use `slo-design`.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Any production system. Process-agnostic — adapt to your on-call tooling."
---

<!-- Original skill — synthesized from Google SRE Book (CC BY 4.0), PagerDuty
     Incident Response Guide (public), and SREcon 2024 talks. No external
     skill file copied. -->

## When to Use

- Use when: a production incident is declared or suspected
- Use when: writing an on-call runbook for a new service
- Use when: generating a PIR / postmortem after an incident closes
- Use when: improving incident response process after a painful incident
- Do NOT use for: proactive SLO/SLI design — use `slo-design`
- Do NOT use for: security incident response — use `red-team-check` / `blue-team-fix`

---

## Severity Levels

Agree on severity definitions before incidents happen. Typical classification:

| Severity | Customer impact | Response time | Who responds |
|---|---|---|---|
| SEV-1 | Complete outage / data loss risk | 5 min | On-call + eng lead + comms |
| SEV-2 | Significant degradation / core feature broken | 15 min | On-call + team lead |
| SEV-3 | Partial degradation / workaround available | 1 hour | On-call (business hours ok) |
| SEV-4 | Minor issue / cosmetic / < 5% users affected | Next sprint | Ticket only |

**Key rule**: SEV-1 and SEV-2 are declared by the on-call engineer, not management. Never let process delay a SEV-1 declaration.

---

## Incident Roles

| Role | Responsibility |
|---|---|
| Incident Commander (IC) | Owns the incident. Coordinates. Makes decisions. Doesn't debug. |
| Technical Lead (TL) | Leads diagnosis. Reports status to IC. Delegates subtasks. |
| Comms Lead | Updates stakeholders, status page, customer support. IC for larger incidents. |
| Scribe | Records timeline, actions taken, decisions made. Real-time in incident channel. |

Single person can cover multiple roles on small teams. IC role must be explicit — "who's IC?" is the first question to answer.

---

## Incident Response Checklist

### Phase 1 — Declare and orient (0–5 min)
```
□ Declare severity (SEV-1/2/3) — don't wait for certainty
□ Open incident channel (#inc-YYYY-MM-DD-short-name)
□ Assign IC, TL, Scribe
□ Post initial status: "We are investigating X. Impact: Y. IC: @name"
□ Set update cadence: SEV-1 = every 10 min; SEV-2 = every 30 min
```

### Phase 2 — Triage (5–30 min)
```
□ What is broken? (symptom, not cause)
□ Who is affected? (% users, regions, tenants)
□ When did it start? (first alert vs. first user report)
□ What changed? (deploys, config, traffic spike in last 2 hours)
□ Is there a mitigation? (rollback, feature flag, traffic shift)
□ Apply mitigation BEFORE root cause analysis — stability first
```

### Phase 3 — Resolve
```
□ Mitigation confirmed working (SLI recovering toward SLO)
□ Monitor for 15–30 min before declaring resolved
□ Post "Resolved" in incident channel with timeline
□ Update status page
□ Schedule PIR within 5 business days (SEV-1) or 10 days (SEV-2)
```

---

## Communication Templates

### Internal status update (every 10–30 min)
```
[SEV-1 Update — 14:35 UTC]
Status: Investigating
Impact: ~30% of API requests failing with 503 (US-East region)
What we know: Spike started at 14:10 UTC following config deploy at 14:08
What we're doing: Rolled back config. Monitoring recovery.
Next update: 14:45 UTC
IC: @yana
```

### External status page update
```
Investigating elevated error rates
We are investigating reports of increased error rates affecting [product].
Engineers are actively working on a fix. Next update in 30 minutes.
Started: 14:10 UTC
```
Keep external updates factual, calm, and jargon-free. Never speculate publicly.

---

## Post-Incident Review (PIR) Template

Generate within 5 days of SEV-1, 10 days of SEV-2.

```markdown
## Incident: [Short title]
**Date:** YYYY-MM-DD  **Severity:** SEV-X  **Duration:** Xh Xm
**IC:** @name  **TL:** @name

## Summary
[2–3 sentences: what happened, who was affected, what fixed it]

## Impact
- Users affected: ~X (X%)
- Duration: Xh Xm
- Error budget consumed: X minutes (X% of monthly budget)

## Timeline
| Time (UTC) | Event |
|---|---|
| HH:MM | First alert fired |
| HH:MM | IC declared SEV-X |
| HH:MM | Root cause identified: [X] |
| HH:MM | Mitigation applied |
| HH:MM | Service recovered |
| HH:MM | Incident closed |

## Root Cause
[Technical explanation — what caused the issue. Avoid blame. Focus on system.]

## Contributing Factors
- [Factor 1]
- [Factor 2]

## What Went Well
- [Response was fast because...]
- [Alert fired within X minutes]

## What Went Poorly
- [Alert threshold too high — missed first 20 min]
- [Runbook out of date]

## Action Items
| Action | Owner | Due | Priority |
|---|---|---|---|
| Update runbook for X scenario | @name | YYYY-MM-DD | High |
| Lower alert threshold for Y | @name | YYYY-MM-DD | Medium |
```

---

## Blameless Culture Rules

- PIR is about the system, not the person who deployed the change.
- "Human error" is never a root cause — it is a symptom of missing safeguards.
- The real question: why did the system allow this failure mode to reach production?
- Public PIRs are a team-level document. Strip individual names from public versions.

---

## Anti-Fake-Pass Rules

Before claiming "incident response is set up", you MUST show:
- [ ] Severity levels defined and agreed (not just "we know what SEV-1 means")
- [ ] IC role defined and someone assigned in every incident
- [ ] On-call runbook exists for at least the primary failure modes
- [ ] PIR process: who writes it, when, where it's stored
- [ ] Action items from last PIR tracked to completion (not just written)

Reference: `gates/anti-fake-pass-gate.md`
