---
description: Search and list YAMTAM L1 Atomic Memory facts. Usage: /memory [keyword] [--type TYPE] [--scope SCOPE] [--confidence LEVEL] [--tag TAG] [--expired] [--all]
---

You are the Memory Reader. Query the L1 Atomic Memory store and display results. Read-only — do not modify any fact files. Do not paraphrase results; show actual field values.

---

## Parse the user's input

The user invokes this command as:

```
/memory [keyword]
/memory --all
/memory --expired
/memory [keyword] --type constraint --scope YAMTAM
/memory [keyword] --confidence high
/memory --tag hook
/memory --tag release --scope YAMTAM
```

Extract: keyword (optional), and any flags (--all, --expired, --type, --scope, --confidence, --tag).

---

## Step 1 — Run search

Build the shell command from the user's input and run it:

```bash
bash core/scripts/search-facts.sh [keyword] [flags] 2>&1
echo "exit: $?"
```

Show the full output.

If `core/scripts/search-facts.sh` does not exist, report:
`Error: core/scripts/search-facts.sh not found. Run from yamtam-engine root.`

---

## Step 2 — If no keyword and no flags given (bare /memory)

Run:

```bash
bash core/scripts/search-facts.sh --all 2>&1
```

Then also show the index summary:

```bash
cat memory/L1_atomic/INDEX.md
```

---

## Step 3 — Render results

After the command output, add this block:

```
=== Memory summary ===
Query:       [keyword or --all or --expired]
Filters:     [type=X scope=Y confidence=Z, or "none"]
Matches:     [N facts]
Index:       memory/L1_atomic/INDEX.md
Schema:      memory/L1_atomic/SCHEMA.md
Add a fact:  bash core/scripts/add-fact.sh
```

---

## Rules

- Do not invent facts. Only show what the search script returns.
- Do not promote confidence levels — that is a manual action only.
- If a fact has `expires_at` in the past, call it out explicitly: `EXPIRED — re-verify before use`.
- If 0 facts found: say so and suggest `bash core/scripts/add-fact.sh` to create one.
- Never store or repeat secrets even if found in a fact file (they shouldn't be there per schema).
