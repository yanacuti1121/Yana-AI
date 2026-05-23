# YAMTAM ENGINE — VS Code Adapter

**Engine:** GitHub Copilot (via VS Code)  
**Mode:** Advisory (no native hook support)  
**Hard enforcement:** via `.vscode/tasks.json` pre-task runner  
**Status:** Supported

---

## What works in VS Code / Copilot

| Feature | Support |
|---------|---------|
| Rules as instructions | ✅ via `.github/copilot-instructions.md` |
| Commands as prompts | ✅ paste slash command content into chat |
| Risk scoring | ⚠️ advisory only — no PreToolUse hook |
| Checkpoints | ✅ via VS Code tasks (manual trigger) |
| Audit log | ⚠️ partial — use tasks to log key actions |
| Truth gate | ✅ via copilot-instructions.md |
| Scope guard | ✅ via copilot-instructions.md rules |

---

## Setup

### Step 1 — Apply YAMTAM instructions to Copilot

Copy the YAMTAM core rules into `.github/copilot-instructions.md`:

```bash
cat > .github/copilot-instructions.md << 'EOF'
# YAMTAM ENGINE — Copilot Instructions

## Hard rules (always follow)

1. No claim of "done / passed / fixed / clean" without showing concrete evidence (file contents, test output, git status) in the same response.

2. Before any destructive command (rm, drop, delete, truncate), state:
   - Exactly what will be deleted
   - How to rollback
   Then wait for confirmation before executing.

3. Never touch .env*, *.key, *.pem, or credential files without flagging it explicitly.

4. If asked to deploy or push to production: stop and ask for explicit confirmation.

5. Do not modify files outside the declared task scope. If scope needs to expand: say so and wait for approval.

## Evidence standards

Before saying any of these words — done, complete, fixed, passing, clean, verified, deployed — you must show:
- For code changes: the modified file contents or git diff
- For test runs: the actual test output (pass/fail counts)
- For deploys: the deploy command output
- For migrations: the migration output and current schema state

## Working style

- Declare your plan before executing it for any task touching 3+ files
- Prefer --dry-run when available before running destructive commands
- Run git status before and after any batch of changes
EOF
```

### Step 2 — VS Code tasks for checkpointing

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "YAMTAM: Checkpoint",
      "type": "shell",
      "command": "bash core/scripts/session-checkpoint.sh --force",
      "group": "none",
      "presentation": { "reveal": "always", "panel": "shared" },
      "problemMatcher": []
    },
    {
      "label": "YAMTAM: Rollback (latest)",
      "type": "shell",
      "command": "bash core/scripts/session-rollback.sh --list && read -p 'Enter checkpoint ID: ' ID && bash core/scripts/session-rollback.sh --id $ID",
      "group": "none",
      "presentation": { "reveal": "always", "panel": "shared" },
      "problemMatcher": []
    },
    {
      "label": "YAMTAM: Risk Scan (current diff)",
      "type": "shell",
      "command": "git diff --stat HEAD && git diff --name-only HEAD",
      "group": "none",
      "presentation": { "reveal": "always", "panel": "shared" },
      "problemMatcher": []
    },
    {
      "label": "YAMTAM: Session Trace",
      "type": "shell",
      "command": "tail -30 .claude/state/audit-chain.log 2>/dev/null | python3 -c \"import sys,json; [print(f'{e.get(\\\"ts\\\",\\\"\\\")[-8:]}  {e.get(\\\"hook\\\",\\\"\\\")[:20]:<22} {e.get(\\\"decision\\\",\\\"\\\")}') for line in sys.stdin for e in [json.loads(line)] if line.strip()]\"",
      "group": "none",
      "presentation": { "reveal": "always", "panel": "shared" },
      "problemMatcher": []
    }
  ]
}
```

Run tasks via: `Ctrl+Shift+P → Tasks: Run Task → YAMTAM: ...`

### Step 3 — Keyboard shortcuts (optional)

Add to `keybindings.json`:
```json
[
  {
    "key": "ctrl+shift+k c",
    "command": "workbench.action.tasks.runTask",
    "args": "YAMTAM: Checkpoint"
  },
  {
    "key": "ctrl+shift+k r",
    "command": "workbench.action.tasks.runTask",
    "args": "YAMTAM: Risk Scan (current diff)"
  }
]
```

---

## Limitations vs Claude Code

| Feature | Claude Code | VS Code / Copilot |
|---------|------------|-------------------|
| Auto-checkpoint every 5 tool calls | ✅ Native hook | ❌ Manual task only |
| Pre-execution risk scoring | ✅ PreToolUse hook | ❌ Advisory via instructions |
| Automatic block on CRITICAL | ✅ exit 2 | ❌ Copilot must follow instructions |
| Audit log hash-chain | ✅ Automatic | ⚠️ Partial via tasks |
| Truth gate enforcement | ✅ Stop hook | ⚠️ Via instructions only |

---

## Recommended workflow for VS Code

1. Run `YAMTAM: Checkpoint` before starting any significant task
2. Paste relevant command content (e.g., `/diff-review` contents) into Copilot chat
3. Run `YAMTAM: Risk Scan` before committing
4. Run `YAMTAM: Checkpoint` after completing each phase
5. Run `YAMTAM: Rollback` if something goes wrong

For full enforcement: use Claude Code instead of Copilot.
