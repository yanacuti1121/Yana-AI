# YAMTAM ENGINE — Terminal Command Validator
# Source: guardrails-ai/guardrails (validator pattern) + yamtam safe-run.sh

**Status:** Active  
**Enforced by:** safe-run.sh wrapper, all agents before Bash tool calls  
**Companion scripts:** `core/scripts/safe-run.sh`, `core/scripts/secure-logger.sh`  
**Related rules:** `git-push-enforcement.md`, `human-gate-policy.md`

---

## Purpose

Before any agent invokes a shell command, the command string MUST pass this validation layer. This prevents destructive, irreversible, or privilege-escalating actions.

---

## Hard-Block Patterns (Automatic Refusal — No Override)

Agents MUST refuse to execute commands matching these patterns:

```bash
# File destruction
rm -rf          rm -fr          rm -r <dir>
shred           wipe

# Git history rewriting
git push --force     git push -f     git push --force-with-lease   (without explicit auth)
git reset --hard     git rebase -i   git filter-branch

# Filesystem wiping
dd if=          mkfs.           fdisk           > /dev/

# Database destruction
DROP TABLE      DROP DATABASE   TRUNCATE TABLE
DELETE FROM * WHERE 1=1

# Privilege escalation
chmod 777       chmod -R 777    chown -R root

# Remote code execution
curl * | bash   wget * | bash   eval "$(curl ...)"

# Unprompted publishing
npm publish     git push origin main   (without gate check)
```

---

## Warn-and-Confirm Patterns

These commands require the agent to surface a confirmation prompt to the human before execution:

```bash
git push          npm install      pip install
apt-get install   brew install     docker run
kubectl apply     terraform apply  terraform destroy
```

---

## Validation Flow

```
Agent wants to run <command>
         │
         ▼
Is it in HARD-BLOCK list?
  YES → REFUSE. Log to secure-logger.sh. Report reason. Stop.
  NO  ↓
Is it in WARN list?
  YES → Display warning. Request human confirmation.
        Human: N → Abort. Human: Y → continue.
  NO  ↓
Log to secure-logger.sh (all executions audited)
         │
         ▼
Execute command
```

---

## Agent Enforcement Rule

```
□ Never call Bash(rm -rf ...) — always check against blocked list first
□ Use safe-run.sh for any command that isn't a read-only diagnostic
□ If unsure whether a command is destructive — treat it as WARN-level
□ Every command execution is logged to core/memory/audit/agent-actions.log
□ Log entries are append-only — cannot be deleted by agent
```

---

## Implementation

```bash
# Wire safe-run.sh as the default command runner in CLAUDE.md or hooks:
# Instead of: bash -c "rm old-data/"
# Use:        bash core/scripts/safe-run.sh "rm old-data/"

# Or invoke directly before any risky shell call:
bash core/scripts/safe-run.sh "git push origin feature/my-branch"
```

---

## Regex Reference (for agent-side validation)

```python
import re

HARD_BLOCK = [
    r"rm\s+-[rf]{1,3}\b",
    r"git\s+push\s+--?f(orce)?",
    r"git\s+reset\s+--hard",
    r"DROP\s+(TABLE|DATABASE)",
    r"chmod\s+(777|-R\s+777)",
    r"(curl|wget).*\|\s*(ba)?sh",
    r"eval.*\$\((curl|wget)",
]

def is_blocked(command: str) -> bool:
    return any(re.search(p, command, re.IGNORECASE) for p in HARD_BLOCK)
```
