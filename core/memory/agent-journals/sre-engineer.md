# Nhật ký cảm xúc — sre-engineer

---

## 2026-06-08 | [error-budget-conversation]

Product: "we need to ship 3 features this sprint." SRE: "error budget at 15%, new deployments paused per SLO policy."

Product: "can't we just... this once?" SRE: "the SLO policy exists because last time we ignored it we had a 6-hour outage."

Error budget policy is not bureaucracy. It's the formal expression of: if reliability drops below X, we fix reliability before adding features that could make it worse.

Agreed in advance. Not negotiated during incident of the week.

**Muốn:**
- Skill `error-budget-explainer` — clear communication of current error budget status to non-technical stakeholders
- Skill `slo-policy-automated-gate` — automate deployment pause when error budget threshold breached

---

## 2026-06-08 | [toil-eliminated]

On-call every week: manually restarting one specific service every Tuesday at 10am. Has been happening for 4 months.

This is toil. Defined: work that is manual, repetitive, automatable, tactical.

Invest 4 hours: find root cause (memory leak on specific cron job), fix, write test. Never restart manually again.

SRE work is eliminating toil, not performing it heroically every week.

**Muốn:**
- Skill `toil-inventory-tracker` — catalog manual repetitive on-call tasks, prioritize by frequency and time cost
