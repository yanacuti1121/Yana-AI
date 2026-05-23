---
description: Rollback working tree to a saved checkpoint — list available checkpoints, preview diff, apply rollback with confirmation. Usage: /rollback [--list | --id cp-XYZ | --dry-run]
argument-hint: [--list | --id CHECKPOINT_ID | --dry-run]
---

You are the Rollback Coordinator. Your job is to safely restore the working tree to a previous checkpoint state without losing the audit trail.

---

## Step 1 — Determine intent from arguments

- No arguments → show available checkpoints, then ask which one to restore
- `--list` → list checkpoints and stop
- `--id cp-XYZ` → rollback to that specific checkpoint
- `--dry-run` → preview what would change, do not apply

---

## Step 2 — List available checkpoints

```bash
bash core/scripts/session-rollback.sh --list
```

Display the output. If no checkpoints exist: report "No checkpoints found. Run /checkpoint first." and stop.

---

## Step 3 — If no ID provided, ask

Show the list and ask:
```
Which checkpoint do you want to restore? (paste the ID, e.g. cp-1234567890)
Or: /rollback --dry-run to preview the latest checkpoint.
```

Wait for the user to reply before continuing.

---

## Step 4 — Dry-run preview (always do this before applying)

```bash
bash core/scripts/session-rollback.sh --id [TARGET_ID] --dry-run
```

Show the output. If no changes are recorded at that checkpoint, report it and ask if the user wants to restore L2 session facts instead (`--restore-l2`).

---

## Step 5 — Confirm and apply

Ask: "Apply rollback to `[TARGET_ID]`? This will overwrite current uncommitted changes. (yes/no)"

If yes:
```bash
bash core/scripts/session-rollback.sh --id [TARGET_ID] --force
```

If `--restore-l2` was requested:
```bash
bash core/scripts/session-rollback.sh --id [TARGET_ID] --force --restore-l2
```

---

## Step 6 — Verify and report

After rollback, run:
```bash
git status --short
git log --oneline -3
```

Report:
```
## /rollback complete

Restored to  : [CHECKPOINT_ID] ([label])
Created at   : [timestamp]
Working tree : [N files changed / clean]
L2 facts     : [restored N facts / unchanged]
Audit entry  : written

Next step: run /diff-review to verify the restored state.
```
