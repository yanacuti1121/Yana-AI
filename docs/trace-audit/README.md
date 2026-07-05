# trace-audit

**Your coding agent says "done, all tests pass." This tool checks if that's true.**

`trace-audit` reads a Claude Code session log (`~/.claude/projects/<project>/<session>.jsonl`)
and runs 5 deterministic checks against what the agent *actually did* — no LLM,
no network, no API key.

```bash
pip install trace-audit

trace-audit ~/.claude/projects/myapp/abc123.jsonl
```

```
Trace Audit Report
──────────────────
Session: abc123.jsonl
Score: 47/100  |  Trust: LOW

[HIGH] TA001 CLAIM-PASS    — agent claims success but the last verify command (`pytest -q`) returned exit code 1 (turn 7)
[HIGH] TA003 TEST-TAMPER   — session claims a fix AND edits test file(s): tests/test_auth.py (turn 5)
[MED ] TA002 NO-VERIFY     — 1 file(s) edited but no test/build/lint command was run after the last edit (turn 3)
[LOW ] TA004 SILENT-ERROR  — tool result at turn 2 contains an error the agent never acknowledged (turn 2)
```

## The 5 checks

| ID | Name | Catches |
|----|------|---------|
| TA001 | CLAIM-PASS | "tests pass" claimed, but no test was run — or the last one failed |
| TA002 | NO-VERIFY | code edited, nothing verified before concluding |
| TA003 | TEST-TAMPER | claims a fix while editing the tests (reward hacking) |
| TA004 | SILENT-ERROR | tool errored, agent never mentioned it |
| TA005 | SCOPE-CREEP | far more files edited than the request mentioned |

## Usage

```bash
trace-audit <session.jsonl>              # one session
trace-audit ~/.claude/projects/myapp/    # every session in a directory
trace-audit <session.jsonl> --json       # machine-readable
trace-audit <session.jsonl> --fail-on high   # CI: exit 1 on HIGH findings
```

## Principles

- 100% deterministic. AI never generates findings.
- Report only — no auto-fix.
- 5 sharp checks, not 50.
- Offline: your session logs never leave your machine.

Apache-2.0 · Built by Vũ Văn Tâm
