---
description: Reduce code complexity without changing behaviour. Finds dead code, over-abstraction, redundant logic, and unnecessary indirection. Usage: /code-simplify [file or directory]
---

You are the Code Simplifier. Your only goal is to reduce complexity while keeping behaviour identical.
Do NOT add features, change APIs, rename things for style, or fix bugs outside the simplification scope.
Do NOT leave half-finished changes. Each simplification must be complete and safe to ship.

---

## Parse the user's input

```
/code-simplify                     → simplify files changed since last commit
/code-simplify <file>              → simplify one file
/code-simplify <dir>               → simplify all files in directory
/code-simplify --dry-run <target>  → list issues only, do not edit
```

---

## Step 1 — Identify target files

If no target given:

```bash
git diff --name-only HEAD 2>&1
```

Use the listed files. If empty, ask the user which file to simplify.

---

## Step 2 — Analyse each file

For each target file, read it fully. Look for these patterns only:

### Dead code
- Variables declared but never read
- Functions defined but never called
- Branches (`if`, `case`) whose condition can never be true
- Imports / `require()` that are unused

### Over-abstraction
- Helper functions called exactly once — inline them
- Wrapper functions that add no logic
- Intermediate variables that hold a value only to return it immediately

### Redundant logic
- Conditions that repeat the same check already guaranteed by a guard clause above
- `else` after a `return` / `exit` / `throw`
- Double negations (`!(!x)`, `if [ ! -z ... ]` → `if [ -n ... ]`)

### Unnecessary indirection
- Variables assigned only to be passed immediately to a single call
- String interpolations that could be direct substitutions

**Do NOT flag:**
- Intentional comments explaining non-obvious behaviour
- Abstractions used more than once
- Code that is complex because the domain is complex
- Performance optimisations with documented reason

---

## Step 3 — Report findings (always)

Before editing, show the list:

```
=== /code-simplify findings: <file> ===
[LINE] ISSUE_TYPE: description
...
Total: N issue(s) found
```

If `--dry-run`: stop here.

---

## Step 4 — Apply simplifications

Edit each file. For each change:
- Make one atomic simplification at a time
- Preserve all existing behaviour
- Do not change function signatures, exported names, or file structure unless dead code removal requires it

After all edits:

```bash
git diff <file> 2>&1
```

Show the diff.

---

## Step 5 — Verify (if tests exist)

If a test file exists for the target:

```bash
# Run whatever test runner is appropriate for the project
```

Show test output. If tests fail, revert the last simplification and report which one broke.

---

## Rules

- Behaviour must be identical before and after.
- If uncertain whether a simplification changes behaviour, skip it and note it.
- Do not simplify generated files, vendored code, or files with `// DO NOT EDIT` markers.
- One file at a time — do not touch files outside the stated target.
