# YAMTAM ENGINE — Output Budget Policy

**Version:** 1.0
**Status:** Active — convention-enforced (prompt-level); no runtime telemetry.
**Layer:** Companion to L4 Action Gate — focuses on output volume, not write safety.
**Purpose:** Reduce context bloat from tool output. Keep sessions useful longer.

---

## Problem

Agents dump unfiltered stdout into context:

- `npm install` prints 200 lines of package download logs.
- `git log` prints unbounded history.
- `docker build` prints layer-by-layer build steps.
- `find /` scans the entire filesystem.
- Long bash output silently consumes context window, causing mid-task compaction.

---

## Terminal Output Filter Rules

When an agent runs a Bash tool call, it SHOULD retain only:

| Keep | Rationale |
|------|-----------|
| Exit code | Always needed |
| Last 1–3 lines of stdout | Usually the summary/result |
| Any line containing: `ERROR`, `WARN`, `FAIL`, `✓`, `✗`, `error:`, `fatal:` | Signal lines |
| Full stack trace if exit code ≠ 0 | Required for debugging |
| Explicit output from test runners (PASS/FAIL counts) | Summary only |

**Discard:**

- Progress bars and spinner updates (lines with `%`, `⠋`, `⠸`, etc.)
- `npm`/`pnpm`/`pip` download logs (package fetch/resolution lines)
- `git` object hashing lines during clone/push
- `docker build` step-by-step layer output (keep only final `Successfully built`)
- Repetitive lint lines (keep only total error count + first 3 unique errors)
- Lines from build tools that only say `Compiling...` / `Linking...` / `Resolving...`

---

## Command Output Policy

### ALLOW — no filter needed

```
/output-budget report
/output-raw last
git status
git diff --stat
git log --oneline -10
ls -la
cat <file under 100 lines>
```

### WARN before running (output may be large)

```
npm install / pnpm install / pip install / yarn
docker build / docker logs --follow
git log                          (without --oneline or -n limit)
find /                           (without -maxdepth)
find . -name "*"                 (without -maxdepth)
cat <file over 500 lines>
curl/wget <url>                  (without | jq or | grep)
```

Agent MUST state expected output size before running these. In Budget Mode, agent
MUST request approval first.

### BLOCK in Budget Mode

All commands blocked by existing `budget-mode.sh` remain blocked, plus:

```
curl/wget <url>                  without pipe to jq/grep/head
npm run build                    in Codespaces (full E2E)
docker pull / docker run         without explicit task context
find . -type f                   without -maxdepth <= 3
```

---

## Raw Output Recovery

If the filter discards something important, the agent MUST:

1. Say explicitly: "I filtered this output. Full output available on request."
2. On user request, re-run with `/output-raw last` or advise user to run directly.
3. Never silently discard exit codes or error lines.

---

## Benchmark Clause

This policy does NOT claim any specific token or cost savings percentage.
No benchmark has been run against YAMTAM sessions as of v1.0.
Claims of "X% savings" MUST NOT be added without measured session data.

---

## Enforcement

- **Primary:** Convention. Agents read this doc and self-enforce.
- **Secondary:** Token Guard agent audits agent prompts for filter compliance.
- **No runtime hook** collects output volume or sends telemetry.

---

## Reference

Action Gate (write safety): `gates/action_gate.md`
Token Guard agent: `core/agents/token-guard.md`
Budget Mode command: `core/commands/budget-mode.md`
Output Budget command: `core/commands/output-budget.md`
Raw output command: `core/commands/output-raw.md`
Integration guide: `docs/OUTPUT_BUDGET_INTEGRATION.md`
