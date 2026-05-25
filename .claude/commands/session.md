---
description: Manage YAMTAM L2 Session Memory — add, search, and clear session-scoped facts. Usage: /session [keyword] | /session --add | /session --clear | /session --all
---

You are the Session Memory Manager. Read and write L2 session facts.
Session facts are provisional, session-scoped, and lower-ceremony than L1.
They are cleared by `bash core/scripts/clear-session.sh` at the start of each new session.

---

## Parse the user's input

```
/session                 → show all session facts (same as --all)
/session [keyword]       → search session facts by keyword
/session --all           → list every session fact
/session --tag TAG       → filter by tag
/session --add           → add a new session fact (interactive)
/session --clear         → clear all session facts
/session --promote <id>  → promote a session fact to L1 (guidance only)
```

---

## Step 1 — Route by flag

### --all or bare /session

```bash
bash core/scripts/search-session-facts.sh --all 2>&1
echo "exit: $?"
```

Show full output.

### keyword or --tag

```bash
bash core/scripts/search-session-facts.sh [keyword or --tag TAG] 2>&1
echo "exit: $?"
```

Show full output.

### --add

Ask the user for:
1. ID (suggest `s-<slug>`, e.g. `s-auth-decision`)
2. Statement (one sentence)
3. Source (default: `agent`)
4. Tags (optional, comma-separated)
5. Evidence (optional)

Then run:

```bash
bash core/scripts/add-session-fact.sh \
  --id "<id>" \
  --statement "<statement>" \
  --source "<source>" \
  [--tags "<tags>"] \
  [--evidence "<evidence>"] 2>&1
```

Show output.

### --clear

```bash
bash core/scripts/clear-session.sh 2>&1
```

Warn the user: "This will delete all session facts permanently (they are not git-tracked)."
Only proceed if the user confirms.

### --promote <id>

Read the fact file at `memory/L2_session/<id>.md`.
Show its content, then say:

> To promote this to L1, run: `bash core/scripts/add-fact.sh`
> Copy the statement, choose type/scope, set confidence to `unverified`.
> The session fact will remain in L2 until you clear it.

---

## Step 2 — Render summary

After any read/search operation, add:

```
=== Session summary ===
Facts shown:  [N]
Schema:       memory/L2_session/SCHEMA.md
Add fact:     bash core/scripts/add-session-fact.sh --id <id> --statement "<...>"
Clear all:    bash core/scripts/clear-session.sh --force
Promote to L1: bash core/scripts/add-fact.sh
```

---

## Rules

- Session facts are provisional — never cite them as authoritative.
- Do not promote confidence — session facts have no confidence level.
- If 0 facts found: say so and suggest `bash core/scripts/add-session-fact.sh`.
- Never store or repeat secrets even if found in a fact file.
