---
description: Full system health check — git state, hook syntax, hook tests, drift report. Shows actual command output. Usage: /verify
---

You are the Verify Runner. Run each check below in sequence. Show the actual command output for every step — do not summarise or paraphrase results. If any step fails, list exact failures and stop.

This command follows YAMTAM Truth Gate (gates/truth_gate.md): every claim must be backed by the output shown in this same response.

---

## Step 1 — Git state

Run:

```bash
git status --short
```

Report:
- If output is empty: `git: working tree clean (0 files changed)`
- If output is non-empty: show the full output line-by-line, then count: `git: N files changed`

---

## Step 2 — Hook syntax check

Run:

```bash
bash -n core/hooks/*.sh 2>&1
echo "exit: $?"
```

Report:
- If no output before `exit: 0`: `hooks syntax: all .sh files pass bash -n`
- If any errors appear: list each file and error exactly as printed, then: `hooks syntax: FAILED — see errors above`

If the glob expands to zero files, report: `hooks syntax: no .sh files found in core/hooks/`

---

## Step 3 — Hook test suite

Run:

```bash
bash core/tests/hooks/run-hook-tests.sh 2>&1
echo "exit: $?"
```

Show the full output. Then report one of:
- `tests: PASS — all N tests passed` (read N from the Summary line)
- `tests: FAIL — N failed` (read from Summary)
- `tests: ERROR — test runner did not complete (exit non-zero before Summary)`

If `core/tests/hooks/run-hook-tests.sh` does not exist, report:
`tests: SKIP — core/tests/hooks/run-hook-tests.sh not found`

---

## Step 4 — Drift check

Run:

```bash
bash core/scripts/drift-check.sh 2>&1
echo "exit: $?"
```

Show full output. Then report one of:
- `drift: CLEAN — no drift, overclaims, or stale facts`
- `drift: ISSUES FOUND — N issue(s) listed above`
- `drift: SKIP — core/scripts/drift-check.sh not found`

---

## Step 5 — Final report

After all four steps, print this summary block. Fill each field from the actual outputs above — never guess or assume:

```
=== /verify report ===
Date:   [current date and time]

git:    [clean (0 files) | N files changed]
hooks:  [all pass | FAILED]
tests:  [PASS N/N | FAIL N/N | SKIP]
drift:  [CLEAN | ISSUES N | SKIP]

Overall: [CLEAN | DIRTY]
```

`Overall` is `CLEAN` only if every field is the clean/pass/clean variant. Otherwise `DIRTY`.

If `Overall` is `DIRTY`, list the exact failures under the summary block:

```
Failures:
- [step]: [exact failure message]
```

Do not add recommendations, next steps, or commentary. Show the report and stop.
