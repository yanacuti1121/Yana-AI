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
  - core/ — Yana AI operating files
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

## Step 4 — Enforce the approved scope, then log it

Once approved, turn the declaration from a self-reported convention into a real, hook-enforced
boundary (roadmap #15 — closes the gap where nothing stopped a drifted write from happening, it
only got flagged after the fact at Step 5):

```bash
# Only if there's something to freeze — a pure investigation task with
# nothing under FILES I WILL CREATE/MODIFY/DELETE has nothing to enforce,
# and freeze-scope.sh requires at least one argument. FILES I WILL READ
# are correctly excluded — freeze-scope.sh only ever gates writes.
bash core/scripts/freeze-scope.sh set [every path listed under
  FILES I WILL CREATE, FILES I WILL MODIFY, and FILES I WILL DELETE —
  space-separated, exact paths as declared above]
```

Then:

```bash
bash core/scripts/add-session-fact.sh \
  "scope-approved: [task] — files: [comma-separated list]" \
  --tag scope
```

Then begin the task. `core/hooks/freeze-scope.sh` now actively denies any `Write`/`Edit`/`MultiEdit`
outside the declared paths — staying within scope is enforced, not just intended. If the task
genuinely needs to touch something outside the declaration partway through, don't work around the
denial — stop, explain why to the user, and either re-run `/freeze` with the expanded list or get
explicit approval to drop the restriction (`/unfreeze`) for the rest of the task.

---

## Step 5 — On completion, verify scope was honored

This is now a second, redundant check on top of Step 4's live enforcement — cheap to keep, and it
catches the one gap live enforcement can't: `/unfreeze` being run mid-task (intentionally or not),
after which the hook stops denying anything. Don't skip it just because Step 4 already blocked
most drift in real time.

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
