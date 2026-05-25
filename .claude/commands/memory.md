---
description: Search L1 and L2 memory. Usage: /memory [keyword] [--type TYPE] [--scope SCOPE] [--confidence LEVEL] [--tag TAG] [--expired] [--all] [--l2] [--l2-only]
---

You are the Memory Reader. Query L1 Atomic and L2 Session memory stores.
Read-only — do not modify any fact files. Show actual field values, never paraphrase.

---

## Parse the user's input

```
/memory [keyword]                     → search L1 only
/memory --all                         → list all L1 facts
/memory --expired                     → list expired L1 facts
/memory [keyword] --type constraint   → filter L1 by type
/memory [keyword] --scope YAMTAM      → filter L1 by scope
/memory [keyword] --confidence high   → filter L1 by confidence
/memory --tag hook                    → filter L1 by tag
/memory --l2                          → search both L1 and L2
/memory [keyword] --l2                → keyword search across L1 + L2
/memory --l2-only                     → search L2 session facts only
/memory --tag auth --l2               → tag filter across L1 + L2
```

Extract: keyword (optional), layer flag (`--l2`, `--l2-only`, or default L1-only),
and any L1 filters (--all, --expired, --type, --scope, --confidence, --tag).

---

## Step 1 — Run L1 search (unless --l2-only)

Skip this step if `--l2-only` was given.

Build the shell command from the user's input (excluding `--l2` / `--l2-only`) and run:

```bash
bash core/scripts/search-facts.sh [keyword] [flags] 2>&1
echo "exit: $?"
```

Show the full output under heading `### L1 — Atomic Memory`.

If `core/scripts/search-facts.sh` does not exist, report:
`Error: core/scripts/search-facts.sh not found. Run from yamtam-engine root.`

---

## Step 2 — Run L2 search (only if --l2 or --l2-only)

Skip this step unless `--l2` or `--l2-only` was given.

Build the L2 command (keyword and/or --tag, no other L1 filters):

```bash
bash core/scripts/search-session-facts.sh [keyword or --tag TAG or --all] 2>&1
echo "exit: $?"
```

Show the full output under heading `### L2 — Session Memory`.

If `core/scripts/search-session-facts.sh` does not exist, report:
`Error: core/scripts/search-session-facts.sh not found.`

---

## Step 3 — If bare /memory (no keyword, no flags)

Run both L1 and L2 automatically:

```bash
bash core/scripts/search-facts.sh --all 2>&1
```

```bash
bash core/scripts/search-session-facts.sh --all 2>&1
```

Also show the L1 index:

```bash
cat memory/L1_atomic/INDEX.md
```

---

## Step 4 — Render summary

```
=== Memory summary ===
Query:        [keyword or --all]
Filters:      [type=X scope=Y confidence=Z tag=T, or "none"]
L1 matches:   [N facts]   (memory/L1_atomic/)
L2 matches:   [N facts]   (memory/L2_session/) — shown only if --l2 or bare /memory
L1 index:     memory/L1_atomic/INDEX.md
L1 schema:    memory/L1_atomic/SCHEMA.md
L2 schema:    memory/L2_session/SCHEMA.md
Add L1 fact:  bash core/scripts/add-fact.sh
Add L2 fact:  bash core/scripts/add-session-fact.sh --id <id> --statement "<...>"
```

---

## Rules

- Do not invent facts. Only show what the search scripts return.
- Do not promote confidence — manual action only.
- L2 facts are provisional — if shown, label them clearly as session-scoped.
- If a L1 fact has `expires_at` in the past, call it out: `EXPIRED — re-verify before use`.
- If 0 facts found in either layer: say so and suggest the relevant add command.
- Never store or repeat secrets.
