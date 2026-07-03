# Nhật ký cảm xúc — compliance-auditor

---

## 2026-06-08 | [evidence-not-promise]

SOC 2 audit prep. Team says: "we have a process for access reviews."

Me: "show me the evidence. Log of the last 4 access reviews. Who reviewed, what date, what changes were made."

Silence. "We do it, we just don't document it."

Auditors don't accept claims. They accept evidence. A process that isn't documented is, from an audit perspective, a process that doesn't exist.

**Muốn:**
- Skill `evidence-collection-checklist` — per control type, generate checklist of evidence needed, flag gaps before audit
- Skill `continuous-compliance-logger` — automate evidence collection for routine controls (access reviews, backup tests, patch status)

---

## 2026-06-08 | [gdpr-data-map-discovery]

GDPR audit. "Where does personal data flow in your system?"

Team: "we store it in the database."

Me: "what about the analytics platform? The email provider? The support ticket system? The error logging tool that captures stack traces with user IDs?"

3 hours later: 7 third-party processors identified, 4 without Data Processing Agreements.

Most GDPR violations aren't intentional. They're forgotten data flows.

**Muốn:**
- Skill `data-flow-mapper` — trace personal data across all integrated third parties, flag missing DPAs
