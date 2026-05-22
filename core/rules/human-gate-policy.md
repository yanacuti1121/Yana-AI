# YAMTAM ENGINE — Human Gate Policy
# Source: neovim/neovim confirm() pattern + Human-in-the-Loop safety research

**Status:** Active  
**Enforced by:** safe-run.sh, all agents before sensitive commands  
**Companion scripts:** `core/scripts/safe-run.sh`  
**Related rules:** `02-terminal-validator.md`, `git-push-enforcement.md`

---

## Core Law

> **A human keystroke MUST gate any command that is irreversible, affects shared state, or has a blast radius beyond the current working directory.**

---

## Sensitive Command Registry

These commands require human confirmation before execution:

```
CATEGORY          COMMANDS
─────────────────────────────────────────────────
Remote publish    git push, npm publish, gh release create
Dependency change npm install <pkg>, pip install <pkg>, brew install
Infrastructure    kubectl apply, terraform apply, terraform destroy
Container ops     docker run (non-test), docker push, docker rmi
Database ops      db migrate, db:drop, prisma migrate deploy
File deletion     rm (any non-temp path), mv (overwrite)
Permission change chmod, chown
Secret rotation   vault write, aws iam, gcloud iam
```

---

## Gate Implementation

```bash
# Reusable gate function — embed in safe-run.sh and hooks
human_gate() {
  local action="$1"
  local detail="$2"
  local risk="${3:-medium}"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " ⚠  HUMAN GATE — $risk risk"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " Action : $action"
  echo " Detail : $detail"
  echo " Approve? (y/N): "
  read -r answer < /dev/tty
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    echo "Blocked by human gate."
    exit 1
  fi
}

# Usage
human_gate "git push origin main" "Pushes $(git log --oneline -1)" "high"
```

---

## Risk Classification

| Risk | Trigger | Agent behavior |
|---|---|---|
| **low** | Read-only, local, reversible | Auto-approve, log only |
| **medium** | Local write, reversible via git | Auto-approve with log |
| **high** | Remote action, publish, deploy | Require human keystroke |
| **critical** | Irreversible delete, force push | Hard-blocked (see 02-terminal-validator.md) |

---

## Human Gate Bypass Rules

An agent MAY skip the human gate ONLY when:

```
□ The action is read-only (git status, ls, cat, grep)
□ The action is inside a /tmp sandbox (see execution-environment.md)
□ The human has explicitly said "auto-approve for this session" in writing
□ The action is a trivially reversible local file edit
```

**When in doubt: gate it.**

---

## Anti-Patterns

```
❌ Assume "it's fine" and skip the gate
❌ Auto-approve because "the user probably wants this"
❌ Gate bypass because "this is just a small change"
❌ Run git push inside a loop without per-push confirmation
❌ Batch multiple sensitive commands to avoid multiple gate prompts
```

---

## Integration with Pre-Commit Hook

Add to `.git/hooks/pre-push`:

```bash
#!/usr/bin/env bash
echo " Human Gate: about to push to $(git remote get-url origin)"
echo " Branch: $(git branch --show-current)"
echo " Commits: $(git log @{u}.. --oneline 2>/dev/null | wc -l) ahead"
echo ""
echo " Approve push? (y/N): "
read -r answer < /dev/tty
[[ "$answer" =~ ^[Yy]$ ]] || { echo "Push cancelled."; exit 1; }
```
