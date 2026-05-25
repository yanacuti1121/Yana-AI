# YAMTAM ENGINE — Security Scan Modes

**Version:** 1.0
**Used by:** core/skills/red-team-check, core/commands/security-scan.md
**Concept inspired by:** Strix scan mode taxonomy (Apache 2.0) — rewritten for YAMTAM

---

## Overview

Three scan modes let the agent choose the right depth for the task.
Always start with scope confirmation via `gates/security-scope-gate.md`.

---

## Mode 1 — Quick Scan

**Time budget:** under 5 minutes
**Output:** CRITICAL findings only

### What it covers
- Hardcoded secrets and API keys in source files
- Obvious SQL injection patterns in query-building code
- Production credentials in config files
- `.env` files accidentally committed
- `debug=True` / equivalent in production config
- Known dangerous function calls (`eval`, `exec`, `shell=True`)

### What it skips
- A04 Insecure Design (logic flaws — needs deeper review)
- A06 Vulnerable Components (requires running package audit)
- A08 Data Integrity (CI/CD pipeline review)

### When to use
- Pre-commit quick check
- "Is this safe to push?" during development
- Fast sanity check before handing off to a reviewer

### Output format
```
QUICK SCAN — [target] — [date]
Categories covered: A01 A02 A03 A05 A07 A09 A10
Categories skipped: A04 A06 A08 (quick mode — run deep scan for full coverage)

CRITICAL findings: N
[finding list or "No CRITICAL findings detected"]

Next step: run /security-scan --mode deep for full OWASP coverage.
```

---

## Mode 2 — Targeted Scan

**Time budget:** 5–15 minutes
**Output:** CRITICAL + HIGH findings for the specified scope

### What it covers
- All 10 OWASP categories but scoped to a specific file, module, or feature
- Caller-specified: "scan the auth module" / "scan the file upload feature"

### How to specify scope
```
/security-scan --mode targeted --scope "src/auth/"
/security-scan --mode targeted --scope "the file upload endpoint in api/upload.py"
```

### When to use
- Reviewing a new feature before merging a PR
- Auditing a specific module after a refactor
- Checking a third-party integration point

### Output format
```
TARGETED SCAN — [target] — scope: [specified scope] — [date]
Categories: all 10 OWASP (scoped to [specified scope])

CRITICAL: N | HIGH: N
[finding list]

Note: only files within [scope] were reviewed.
Run deep scan for full codebase coverage.
```

---

## Mode 3 — Deep Scan

**Time budget:** 15–60 minutes (depends on codebase size)
**Output:** Full finding list — CRITICAL / HIGH / MEDIUM / LOW / INFO

### What it covers
All 10 OWASP Top 10 categories across the full codebase:

| Category | Techniques |
|----------|-----------|
| A01 Broken Access Control | IDOR, missing auth checks, privilege escalation paths |
| A02 Cryptographic Failures | Weak hashing, plaintext secrets, bad TLS config |
| A03 Injection | SQL, command, template, LDAP injection patterns |
| A04 Insecure Design | Rate limiting, race conditions, predictable IDs |
| A05 Security Misconfiguration | Debug mode, default creds, missing headers |
| A06 Vulnerable Components | npm audit / pip-audit / govulncheck / cargo audit |
| A07 Auth Failures | Weak sessions, JWT issues, missing MFA |
| A08 Data Integrity | Unsigned deps, CI/CD injection surface |
| A09 Logging Failures | Missing auth event logs, PII in logs |
| A10 SSRF | User-controlled URLs, webhook abuse, internal metadata |

### Pre-conditions
- Ownership confirmed via security-scope-gate
- User acknowledges scan may take significant time
- For A06: user approves running package audit commands

### When to use
- Pre-release security review
- After a major architectural change
- Quarterly security audit
- Before enabling a new user-facing feature in production

### Output format
```
DEEP SCAN — [target] — [date]
All 10 OWASP categories scanned.

Summary:
  CRITICAL: N | HIGH: N | MEDIUM: N | LOW: N | INFO: N
  Total: N findings

Category coverage table: [all 10 rows, SCANNED status]
Finding list: [full list with severity, file, description, recommendation]

Recommended next step: /security-scan --fix to run blue-team-fix on findings.
```

---

## Choosing a Mode

```
Pre-commit check          → quick
Reviewing a new PR        → targeted (scope = changed files)
Before production deploy  → deep
After security incident   → deep
"Is this one file safe?"  → targeted
```

---

## Integration with Security Skill Pack

```
quick/targeted/deep scan → core/skills/red-team-check (input: mode + scope)
Fix findings             → core/skills/blue-team-fix  (input: finding list)
Generate report          → core/skills/purple-team-report (input: scan + fix output)
Run all three            → /security-scan --full
```

---

## Anti-Fake-Pass Notes

- Quick mode MUST list categories skipped — never claim "all clear" for full OWASP
- Targeted mode MUST note scope boundary — "only [scope] reviewed, not full codebase"
- Deep mode MUST show category coverage table with SCANNED for all 10
- Any mode: finding list must be shown even if empty (0 findings ≠ no output)
