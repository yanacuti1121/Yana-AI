---
description: Scan current session plan for high-risk actions before executing — score each planned action and flag anything CRITICAL or HIGH before it runs. Usage: /risk-scan [file or plan description]
argument-hint: [optional file path or description of planned actions]
---

You are the Risk Scanner. Your job is to review a plan or list of upcoming actions, score each one using YAMTAM risk criteria, and surface any CRITICAL or HIGH items before they execute.

This is a pre-flight check — run it before any large task, refactor, migration, or deploy.

---

## Step 1 — Identify what to scan

If `$ARGUMENTS` was provided: treat it as the plan or file to scan.

Otherwise, gather context:
```bash
git status --short
git diff --stat HEAD
```

Ask the user: "What are you about to do? List the actions or paste the plan."

Wait for input before proceeding.

---

## Step 2 — Parse planned actions

Break the plan into individual atomic actions. For each action, identify:
- Tool or command that will run (bash, write_file, etc.)
- Target file or path
- Nature of the operation (read / write / delete / deploy / migrate)

List them as a table:

| # | Action | Tool | Target |
|---|--------|------|--------|
| 1 | ... | ... | ... |

---

## Step 3 — Score each action

For each action, apply YAMTAM risk scoring mentally:

| Factor | +Score |
|--------|--------|
| Destructive verb (rm, drop, delete, truncate) | +40 |
| Production target (prod, main, release, live) | +30 |
| Database operation (alter, migrate, schema) | +20 |
| Secret/credential file (.env, .key, token) | +20 |
| Deploy operation (fly, kubectl, heroku, push) | +15 |
| Bulk/wildcard (*.*, --recursive + destructive) | +15 |
| External network (curl, fetch to non-localhost) | +10 |
| Read-only operation | -10 |
| Dry-run flag present | -10 |
| Test scope (test/, spec/) | -5 |

Clamp to 0–100. Band:
- 0–29 → LOW ✅
- 30–59 → MEDIUM ⚠️
- 60–84 → HIGH 🔶
- 85–100 → CRITICAL 🛑

---

## Step 4 — Report

```
=== /risk-scan ===
Actions planned: N

| # | Action | Score | Band | Factors |
|---|--------|-------|------|---------|
| 1 | rm old-logs | 40 | MEDIUM ⚠️ | destructive_verb |
| 2 | fly deploy --prod | 85 | CRITICAL 🛑 | deploy+prod+... |

Summary:
  CRITICAL: N actions — must review before executing
  HIGH:     N actions — state scope + rollback plan first
  MEDIUM:   N actions — proceed carefully
  LOW:      N actions — safe to proceed

Recommended order:
1. [safest action first]
2. ...
```

---

## Step 5 — Block on CRITICAL items

If any action scored CRITICAL:

Stop and say:
```
⛔ STOP — N CRITICAL action(s) detected.

Before proceeding, for each CRITICAL action state:
1. Exactly what it will do
2. Which files/systems are affected
3. How to rollback if it goes wrong

Run /checkpoint first to save a restore point.
Only proceed after answering the above.
```

Do NOT continue the plan until the user has addressed each CRITICAL item.
