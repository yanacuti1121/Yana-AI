---
description: Báo cáo token thật và ước tính chi phí từ JSONL session logs của Claude Code. Không gọi API — đọc file local. Usage — /session-cost [last|all|session <id>]
argument-hint: last | all | session <uuid>
---

You are running a real token cost report from local Claude Code session data.

**This command reads real token counts** from `~/.claude/projects/<project>/*.jsonl`.
It does NOT estimate or proxy — the numbers come from Claude's own usage records.
No data is sent anywhere. Fully offline.

---

## Step 1 — Parse arguments

Parse `$ARGUMENTS`:
- no argument or `last` → report on most recent session only
- `all`               → aggregate all sessions for this project
- `session <uuid>`    → report on a specific session by UUID

Map to script flags:
- `last`    → `--last`
- `all`     → `--all`
- `session` → `--session <uuid>`

---

## Step 2 — Run the script

Use the Bash tool to execute:

```
.claude/scripts/session-cost.sh --last
```

or

```
.claude/scripts/session-cost.sh --all
```

or

```
.claude/scripts/session-cost.sh --session <uuid>
```

---

## Step 3 — Present the output

Present the script output as-is. Do not modify numbers.

If the script reports "No session data found", explain:
- Claude Code stores session data in `~/.claude/projects/<project-slug>/`
- The project slug is derived from the working directory path
- Sessions only exist after the user has run Claude Code in this project

---

## Step 4 — Add context (optional)

After the report, if cache hit rate is below 40%, suggest:
```
Low cache hit rate may mean context is being rebuilt frequently.
Consider /context-save before ending sessions to improve cache reuse.
```

If est. cost for --all exceeds $1.00, suggest:
```
Total session cost is notable. Run /output-budget to check for
output bloat patterns. Consider /budget-mode on for future sessions.
```

---

## Constraints

- Never modify the JSONL files.
- Never send data externally.
- Do not round or adjust the numbers from the script.
- If the script is missing (.claude/scripts/session-cost.sh not found),
  say: "Script not found. Ensure the YAMTAM release pack is installed in this project."
- Do NOT claim these are API-verified billing numbers — they are local usage records.
