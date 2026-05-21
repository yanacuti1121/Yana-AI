---
description: Run a security scan on the current codebase using the Red/Blue/Purple Team skill pack. Requires ownership confirmation.
---

# /security-scan

Run a structured security review of the current codebase.

## Usage

```
/security-scan                    → quick scan (CRITICAL findings only)
/security-scan --mode targeted    → targeted scan of a specific module
/security-scan --mode deep        → full OWASP Top 10 deep scan
/security-scan --report           → generate purple-team-report after scan
/security-scan --fix              → run blue-team-fix after red-team-check
/security-scan --full             → red-team + blue-team-fix + purple-team-report
```

## Flow

1. **Scope gate** — confirm ownership via `gates/security-scope-gate.md`
2. **Red team** — scan with `core/skills/red-team-check`
3. *(if --fix or --full)* **Blue team** — fix with `core/skills/blue-team-fix`
4. *(if --report or --full)* **Purple team** — report with `core/skills/purple-team-report`

## Scan Modes

| Mode | Scope | When to use |
|------|-------|-------------|
| quick | Secrets, obvious injections (default) | Fast pre-commit check |
| targeted | Specific file, module, or feature | Reviewing a PR or new feature |
| deep | Full OWASP Top 10 | Pre-release security review |

Full taxonomy: `docs/security-scan-modes.md`

## Rules

- Ownership confirmation is mandatory — the scope gate will prompt if not set
- Never runs against external URLs or third-party systems
- Does not auto-commit fixes — blue-team-fix proposes, user approves per fix
- All findings are local — not sent to any external service

## Output

Quick mode: CRITICAL finding list + category coverage table
Full mode: Red team findings + blue team fix diffs + purple team report

## References

- `gates/security-scope-gate.md` — ownership confirmation gate
- `gates/anti-fake-pass-gate.md` — evidence requirements before claiming scan done
- `core/skills/red-team-check/SKILL.md`
- `core/skills/blue-team-fix/SKILL.md`
- `core/skills/purple-team-report/SKILL.md`
- `core/agents/quality-assurance/penetration-tester.md`
- `docs/security-scan-modes.md`
