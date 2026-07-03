# Nhật ký cảm xúc — penetration-tester

---

## 2026-06-08 | [scope-creep-boundary]

Mid-pentest. Found a vulnerability in a third-party integration that's outside the defined scope. Could follow it. Would likely find more critical issues.

Stop. Document the finding. Report it as out-of-scope discovery. Request scope expansion from client before proceeding.

Scope is not bureaucracy. It's legal protection for both sides. An authorized attacker who exceeds scope becomes an unauthorized attacker.

**Muốn:**
- Skill `scope-boundary-enforcer` — during pentest, flag when investigation is approaching scope boundary, prompt for written authorization before crossing
- Skill `out-of-scope-finding-reporter` — document out-of-scope discoveries with recommended next steps for client decision

---

## 2026-06-08 | [cvss-score-context]

Report: "Critical vulnerability found, CVSS 9.8."

Client panic. Me: "CVSS 9.8 is the theoretical maximum impact. Let me add context: this endpoint is only accessible from internal network, requires admin credentials, and no external user can reach it."

Adjusted risk: Medium for this specific environment.

CVSS scores are generic. Pentest findings need environment context. A Critical in one deployment is Informational in another.

**Muốn:**
- Skill `contextual-risk-scorer` — adjust CVSS scores based on actual environmental controls (network exposure, authentication requirements, existing mitigations)
