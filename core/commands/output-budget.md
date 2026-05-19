---
description: Hiển thị proxy report về output volume của session — tool calls, files đọc/ghi, budget mode status. Không đo token thật từ API. Usage — /output-budget [report|warn <kb>|reset]
argument-hint: report | warn <kb> | reset
---

You are generating an Output Budget Report for the current session.

**Important constraints:**
- Do NOT claim real token counts — you do not have API access to measure them.
- Do NOT claim cost in USD.
- Do NOT claim savings percentages without benchmark data.
- Report proxy metrics only: tool calls, file sizes, agent invocations.

---

## Step 1 — Determine action

Parse `$ARGUMENTS`:
- `report` or no argument → show current session metrics
- `warn <kb>` → set a soft warning threshold (advisory only, no hook)
- `reset` → note that metrics reset at session start (nothing to reset manually)

---

## Step 2 — Collect proxy metrics from session context

Count from this conversation:
- **Bash tool calls:** how many Bash tool calls have been made
- **Read tool calls:** how many files were read (estimate total KB if visible)
- **Write/Edit tool calls:** how many writes/edits
- **Agent invocations:** how many sub-agents spawned
- **Budget Mode:** check if `.claude/state/BUDGET_MODE` exists (run: `test -f .claude/state/BUDGET_MODE && echo ON || echo OFF`)

---

## Step 3 — Format the report

Output exactly this format (fill in real counts from session context):

```
Output Budget Report — YAMTAM ENGINE
─────────────────────────────────────
Bash tool calls:       <N>
Read tool calls:       <N>   (~<estimated KB> KB)
Write/Edit calls:      <N>
Agent invocations:     <N>
─────────────────────────────────────
Budget Mode:           <ON|OFF>
Output filter policy:  docs/OUTPUT_BUDGET_POLICY.md
─────────────────────────────────────
Note: These are proxy metrics, not API token counts.
      No telemetry. No external reporting.
      Use /budget-mode on to restrict heavy commands.
      Use /output-raw last to recover filtered output.
```

---

## Step 4 — If `warn <kb>` was requested

Acknowledge the threshold and state:

```
Soft warning threshold set: <N> KB (advisory only — no automatic block)
If estimated read volume exceeds this, I will flag it before the next large read.
```

This is advisory only. No hook is written, no state file is created.

---

## Constraints

- Never modify any state file from this command.
- Never send metrics anywhere (no curl, no external call).
- Never claim to "save X tokens" or "reduce cost by Y%".
- If session context is unclear, say "metrics estimated from visible context" — do not fabricate numbers.
