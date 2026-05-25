# YAMTAM ENGINE — Output Budget Layer: Integration Guide

**Version:** 1.0
**Applies to:** Claude Code, Cursor, Gemini CLI, Gemini Code Assist
**Prerequisite:** Read `docs/OUTPUT_BUDGET_POLICY.md` first.

---

## Overview

The Output Budget Layer has three components:

| Component | File | Purpose |
|-----------|------|---------|
| Filter policy | `docs/OUTPUT_BUDGET_POLICY.md` | What to keep/drop from bash output |
| Budget report | `core/commands/output-budget.md` | Proxy metrics for current session |
| Raw recovery | `core/commands/output-raw.md` | Recover dropped output on demand |

Each AI tool integrates differently. This guide covers what is possible per tool.

---

## Claude Code

Full integration. All three components work natively.

### Commands

```bash
/output-budget          # Proxy report: tool calls, reads, writes, budget mode
/output-budget warn 200 # Set advisory warning at 200 KB read volume
/output-raw last        # Recover full output of last filtered command
/budget-mode on         # Activate existing Budget Mode (adds block rules)
/budget-mode off        # Deactivate Budget Mode
/budget-mode status     # Check current state
```

### Filter policy enforcement

Claude Code agents read `docs/OUTPUT_BUDGET_POLICY.md` via the YAMTAM pack.
The filter is convention-enforced (agents self-apply). No hook is required.

To add hook enforcement in the future (optional):

```json
// .claude/settings.json — add under "hooks"
{
  "PostToolUse": [
    {
      "matcher": "Bash",
      "hooks": [{ "type": "command", "command": ".claude/scripts/output-budget-log.sh" }]
    }
  ]
}
```

`output-budget-log.sh` does not exist yet. Only add when there is a real use case,
not pre-emptively.

### Token Guard agent

`/token-guard` already audits context bloat. Output Budget Policy extends its scope:
Token Guard should check whether agents are respecting the filter rules in
`docs/OUTPUT_BUDGET_POLICY.md` when reviewing agent prompts.

---

## Cursor

Partial integration. No slash command system. Policy applies as convention only.

### What works

1. Add the filter rules to Cursor's custom instructions (`.cursor/rules` or
   the "Rules for AI" field in Cursor settings):

```
When running terminal commands, apply the Output Budget Filter:
- Keep: exit code, last 1-3 lines, lines with ERROR/WARN/FAIL/✓/✗
- Drop: progress bars, npm download logs, docker build layer lines
- If I need the full output, I'll ask for /output-raw recovery
Source: yamtam-engine/docs/OUTPUT_BUDGET_POLICY.md
```

2. Warn rules for large commands apply the same way — paste the WARN list from
   `OUTPUT_BUDGET_POLICY.md` into Cursor's custom instructions.

### What does not work

- `/output-budget` and `/output-raw` commands do not exist in Cursor.
- No Budget Mode toggle (no state file system).
- No hook enforcement.

### Workaround for raw recovery

Ask Cursor in chat: "Show me the full unfiltered output of the last command."
Cursor will re-run or surface the full output from its terminal context.

---

## Gemini CLI

Minimal integration. Apply policy via system prompt snippet.

### Setup

Add to your Gemini CLI system prompt or `~/.config/gemini/system_prompt.md`:

```markdown
## Output Budget Policy (YAMTAM)

When running shell commands, apply these filter rules:
- Keep: exit code, last 1-3 lines, lines with ERROR/WARN/FAIL
- Drop: progress bars, package download logs, build step-by-step lines
- For large-output commands (npm install, docker build, git log),
  summarize; offer to show full output on request.

Do not claim token savings percentages without measured data.
Full policy: yamtam-engine/docs/OUTPUT_BUDGET_POLICY.md
```

### What does not work

- No `/output-budget` or `/output-raw` commands.
- No Budget Mode. No hook system.
- No session metrics.

### Raw recovery

Ask in chat: "Show me the complete output without summarizing."

---

## Gemini Code Assist (IDE extension)

Same as Gemini CLI — policy via custom instructions in IDE settings.

Add the filter snippet above to the "Custom instructions" field in Gemini Code
Assist settings. No command or hook integration is available.

---

## What is NOT integrated anywhere

| Feature | Status |
|---------|--------|
| Real token counts from API | Not available — no API access in any agent mode |
| Cost reporting in USD | Not available — same reason |
| Automatic filter enforcement via hook | Not implemented (optional future) |
| Telemetry or usage reporting | Intentionally absent |
| Cross-tool session sync | Not implemented, not planned |

---

## Adding a new tool in the future

To integrate a new AI tool with the Output Budget Layer:

1. Check if the tool has a custom instructions / system prompt field → paste filter policy.
2. Check if the tool has a slash command system → port `output-budget.md` and `output-raw.md`.
3. Check if the tool has a hook/event system → optionally wire a log script.
4. Document it here under a new section.

Do not add a new agent for each new tool integration.

---

## Reference

Policy: `docs/OUTPUT_BUDGET_POLICY.md`
Commands: `core/commands/output-budget.md`, `core/commands/output-raw.md`
Budget Mode: `core/commands/budget-mode.md`
Token Guard: `core/agents/token-guard.md`
Action Gate: `gates/action_gate.md`
