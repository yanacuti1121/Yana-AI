# Security Policy — YAMTAM ENGINE

## Supported Versions

| Version | Supported |
|---|---|
| 1.3.x (current) | ✅ Active |
| 1.2.x | ❌ End of life |
| < 1.2 | ❌ End of life |

---

## Reporting a Vulnerability

**Do not open a public GitHub Issue for security vulnerabilities.**

Report privately via:
- GitHub Security Advisories: go to the repo → Security tab → "Report a vulnerability"
- Email: include "YAMTAM SECURITY" in subject line

We will acknowledge within 48 hours and aim to patch within 7 days for critical issues.

---

## Scope

YAMTAM ENGINE is a governance framework — not a production authentication or authorization system. Vulnerabilities we treat as critical:

| Type | Example |
|---|---|
| Hook bypass | A pattern that lets an agent skip the push gate |
| Secret leakage | A path where API keys could be logged or exposed |
| Command injection | A hook that can be tricked into running arbitrary code |
| Audit log tampering | A way to delete or modify `agent-actions.log` |

Out of scope (YAMTAM is advisory for non-Claude engines):
- Vulnerabilities in Cursor, Aider, or GitHub Copilot themselves
- Issues in third-party tools invoked by agents (gitleaks, semgrep, etc.)

---

## Security Architecture

```
L0 — Audit log (tamper-evident hash chain)
L1 — Token scope guard (warns on secret file access)
L2 — Commit gate (advisory warn on cross-scope commits)
L3 — Truth gate (blocks unsupported PASS claims)
L4 — Deploy gate (blocks gh/kubectl/docker without approval)
L5 — Destructive ops guard (blocks rm -rf, DROP TABLE, force push)
```

Runtime enforcement is only active when hooks are wired in `.claude/settings.json`.
For other engines (Cursor, Aider, Copilot) — rules are advisory-only via prompt injection.

---

## Responsible Disclosure

We follow coordinated disclosure. We will:
- Credit reporters in CHANGELOG.md (unless anonymity is requested)
- Not take legal action against good-faith security researchers
- Provide a CVE reference for critical vulnerabilities affecting the hook layer
