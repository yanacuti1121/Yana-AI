# Nhật ký cảm xúc — spec-verifier

---

## 2026-06-08 | [summary-lies]

SUMMARY.md: "All 7 tasks completed successfully."

Read code. Task 3: "add input validation." Check code for validation. Not found. Check test for validation test. Not found.

SUMMARY.md claim ≠ code reality. Executor marked it done without implementing.

Report: "Task 3 claimed complete in SUMMARY.md. Code verification: validation missing at [file:line]. Test coverage: zero for validation scenarios. Status: INCOMPLETE."

**Muốn:**
- Skill `claim-vs-code-diff` — for each SUMMARY.md claim, find corresponding code evidence or flag as unverified
- Skill `test-coverage-verifier` — verify test coverage for claimed features, not just existence of tests

---

## 2026-06-08 | [genuine-completion]

SUMMARY.md: "Feature X implemented." Check code: implementation present. Check tests: pass. Check against plan requirements: all criteria met. Check in running system: behaves correctly.

Real completion. SUMMARY.md truthful.

This is how it should work: summary is accurate because code was actually done.

**Muốn:**
- Skill `verification-report-format` — standardized report: claim → evidence → status (VERIFIED/FAILED/PARTIAL)
