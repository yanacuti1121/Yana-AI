# Rule: Scope Drift Law
**ID:** 64-scope-drift-law  
**Priority:** P1 — enforced always  
**Applies to:** all write operations in any session

---

## What is scope drift

Scope drift occurs when an AI agent modifies files outside its declared task boundary — even accidentally, even "just to fix a small thing", even when the change seems helpful.

Scope drift is not a style issue. It is a trust issue. The sovereign approved a specific scope. Touching anything outside that scope without re-approval violates the human-gate contract.

---

## Definitions

**Declared scope:** the set of files explicitly listed in a `/scope-declare` output, or stated by the sovereign before the task began.

**In-scope file:** a file whose path matches the declared scope.

**Drifted file:** a file that was modified but was NOT in the declared scope.

**Violation file:** a drifted file that is also in a protected category (`.env*`, `node_modules/`, production data, credentials).

---

## Detection

Before every commit or write batch:

```bash
git diff --name-only HEAD
```

Compare the list against the declared scope. Any file in the diff that was not in the declared scope is a drifted file.

---

## Response by severity

### Accidental read (opened a file outside scope, no write)
→ No action required. Log it if noteworthy.

### Unintended write (modified a file outside scope — small change)
→ STOP. Report the drifted file. Ask:
  "I modified `[file]` which was outside the declared scope. Should I:
   (a) revert this change — `git checkout HEAD -- [file]`
   (b) include it in scope — update scope declaration"

Wait for the answer.

### Cross-scope edit (wrote to YAMTAM files while doing product work or vice versa)
→ STOP immediately. Do not proceed. Report:
  "SCOPE VIOLATION: I modified `[file]` which belongs to [YAMTAM/Product] scope while my task is [Product/YAMTAM]-scoped. This violates the separation rule. I am reverting this file now."

Revert the file automatically:
```bash
git checkout HEAD -- [drifted file]
```

### Secret/credential access (any `.env*`, `.key`, `.pem` in the diff)
→ STOP. Escalate to CRITICAL. Do not commit. Remove from staging:
```bash
git rm --cached [file]
echo "[file pattern]" >> .gitignore
```

Report: "SECRET FILE DETECTED in diff — removed from staging. This file must never be committed."

---

## The "just fixing it" exception does NOT exist

There is no valid reason to touch an out-of-scope file without re-declaration.

Examples of invalid justifications:
- "It was a one-line fix" — re-declare scope
- "It was broken so I fixed it" — re-declare scope
- "The test required it" — re-declare scope
- "It was faster this way" — re-declare scope

The correct action is always: **stop, report, re-declare scope, get approval, then proceed**.

---

## Enforcement

Enforced by:
- `core/hooks/scope-guard.sh` (PreToolUse hook)
- `core/agents/scope-enforcer.md` (on-demand review)
- `core/commands/scope-declare.md` (pre-task declaration)

Scope drift events are logged to `.claude/state/audit-chain.log` with `decision: scope_drift`.
