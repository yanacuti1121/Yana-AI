---
description: Lấy lại full output của command vừa chạy, không qua filter. Dùng khi terminal-output-filter bỏ sót thông tin cần thiết. Usage — /output-raw [last|<mô tả command>]
argument-hint: last | <mô tả command cần lấy lại>
---

You are helping the user recover unfiltered output that may have been trimmed
by the Output Budget Policy filter.

---

## Step 1 — Identify what to recover

Parse `$ARGUMENTS`:
- `last` → recover output from the most recent Bash command in this session
- `<description>` → recover output from a specific command the user describes

---

## Step 2 — Determine if re-run is needed

**Case A — Output is still visible in conversation context:**
Provide the full output directly without re-running.

**Case B — Output was summarized and original is gone:**
State clearly: "The original output is no longer in context. I will re-run the command."
Then re-run the exact same command WITHOUT applying the output filter.

**Case C — The command was destructive or had side effects:**
Do NOT re-run. Instead state:
"This command cannot be safely re-run (it had side effects).
Please run it manually in your terminal and paste the output here."

---

## Step 3 — Present the raw output

Present the complete, unfiltered output. Do not truncate.
Label it clearly:

```
Raw output (no filter):
─────────────────────────────────────
<full output here>
─────────────────────────────────────
```

---

## Step 4 — Note what changed vs filtered view

After the raw output, add one line:

```
Previously filtered: <what was dropped — e.g. "npm download logs (lines 3–187)">
```

---

## Constraints

- Do NOT re-run destructive commands (rm, drop, delete, push, deploy).
- Do NOT re-run commands that require interactive input.
- If re-running, use the exact same arguments — do not modify the command.
- This command does not disable the filter permanently; it is a one-time recovery.
