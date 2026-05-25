---
description: Toggle Budget Mode for the current project. Budget Mode tightens cost-guard rules — see CLAUDE.md for the full rule set. Usage — /budget-mode [on|off|status]
argument-hint: on | off | status
---

You are toggling Budget Mode. **Do not write the state file yourself.** A real
shell script handles the state deterministically. Your job is to invoke it,
read its output, and explain what changed to the user.

## Step 1 — Determine action

Parse `$ARGUMENTS`:
- `on`  → activate
- `off` → deactivate
- `status` (or no argument) → just check

## Step 2 — Run the script

Use the Bash tool to execute:

```
.claude/scripts/budget-mode.sh on
```

or

```
.claude/scripts/budget-mode.sh off
```

or

```
.claude/scripts/budget-mode.sh status
```

The script writes/removes `.claude/state/BUDGET_MODE` and prints the new state.

## Step 3 — Explain to the user

After the script runs, summarize what Budget Mode changes:

When **ON**:
- `cost-guard.sh` warns on `npm install`, `pnpm install`, `docker`, `git push`, `gh workflow run`
- All Cost Guard rules from CLAUDE.md are still in effect (full E2E in Codespaces, unscoped repo scans, etc.)
- This is policy-level — it does not meter Claude API tokens

When **OFF**:
- Standard Cost Guard rules apply
- No extra warnings on install/docker/push commands

If the user asked for `status`, just report the current state.

## Constraints

- Never modify `.claude/state/BUDGET_MODE` directly with Write or Edit tools — always use the script.
- Never claim Budget Mode meters tokens or API costs — it does not.
- Never claim Budget Mode forces Sonnet over Opus — model choice is the user's, not the hook's.
