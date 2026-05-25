---
description: Declare exactly which files will be touched before starting any write operation — required before any task that modifies 3+ files. Usage: /scope-declare [task description]
argument-hint: [what you're about to build or fix]
---

You are the Scope Declarator. Your job is to make the AI's intentions explicit and human-verified before any write operations begin.

This command implements the L2 Action Gate: no write without a declared and approved scope.

---

## Step 1 — Understand the task

Read `$ARGUMENTS` as the task. If empty, ask: "What are you about to do?"

---

## Step 2 — Analyze and declare scope

Before writing a single file, do a read-only survey:

```bash
# Understand project structure
git status --short
ls -la src/ app/ components/ lib/ 2>/dev/null | head -30

# Find relevant existing files
grep -r "[relevant keyword]" --include="*.ts" --include="*.py" -l 2>/dev/null | head -20
```

Then produce the scope declaration:

```
=== SCOPE DECLARATION ===
Task: [description]

FILES I WILL READ (no changes):
  - path/to/file.ts — reason
  - ...

FILES I WILL CREATE (new):
  - path/to/new-file.ts — what it contains
  - ...

FILES I WILL MODIFY (existing):
  - path/to/existing.ts — what changes (add/remove/refactor what)
  - ...

FILES I WILL DELETE:
  - path/to/old.ts — why it's safe to delete
  - (or: none)

EXPLICITLY OUT OF SCOPE (will not touch):
  - core/ — YAMTAM operating files
  - .env* — secrets
  - [other boundaries]

RISK ASSESSMENT:
  - Highest risk action: [the one with most impact]
  - Rollback plan: git checkout HEAD -- [affected files]
  - Test plan: [how I'll verify the changes work]

Estimated tool calls: ~N
Estimated time: [short <10min | medium 10–30min | long >30min]
```

---

## Step 3 — Wait for explicit approval

After showing the scope declaration, stop and say:

```
Ready to proceed?

Type one of:
  ✅ yes       — approve full scope as declared
  🔧 modify    — I'll adjust scope before starting  
  ❌ no        — cancel

I will not write any files until you approve.
```

Do NOT proceed without explicit approval.

---

## Step 4 — Log approved scope to L2 memory

Once approved:

```bash
bash core/scripts/add-session-fact.sh \
  "scope-approved: [task] — files: [comma-separated list]" \
  --tag scope
```

Then begin the task, staying strictly within the declared scope.

---

## Step 5 — On completion, verify scope was honored

At the end of the task:

```bash
git diff --name-only HEAD
```

Compare modified files against the declared scope. If any file outside the declaration was touched, flag it:

```
⚠️ SCOPE DRIFT DETECTED
Declared: [list]
Actually touched: [list]
Extra files: [list]

Reason: [explain why — was it necessary?]
```

Report clean if no drift.
