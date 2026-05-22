# YAMTAM ENGINE — Privilege Isolation Rule
# Source: smithy-rs orthogonal permission model (Apache 2.0) — github.com/awslabs/smithy-rs
# Tier: TIER 1 — SECURITY

**Status:** Active  
**Gate:** Action Gate L2 (scope validation)  
**Enforced by:** All agents, all sessions — no skill or command may bypass this

---

## Core Rule

Agents MUST NOT write to any environment configuration file unless `YAMTAM_SCOPE_OK=1`
is explicitly set in the current shell environment by the user.

**Protected file patterns (orthogonal — applies regardless of running skill):**

```
.env
.env.*
*.env
*token*
*secret*
*credential*
*.pem  *.key  *.p12  *.pfx  *.crt
~/.ssh/*
~/.aws/credentials  ~/.aws/config
~/.kube/config
*.npmrc  (when containing _authToken)
```

---

## Orthogonal Scope Boundary

This rule is **orthogonal** — it cuts across ALL skills and commands:

```
/tdd-cycle                 → CANNOT write .env
/autonomous-patching-loop  → CANNOT write .env
/safe-run.sh               → CANNOT write .env
Any spawned subagent       → CANNOT write .env
Even if user says "just fix it quickly" → CANNOT write .env
```

The bypass key `YAMTAM_SCOPE_OK=1` does NOT propagate to subprocesses or subagents.
The agent MUST `unset YAMTAM_SCOPE_OK` immediately after the scoped write.

---

## Bypass Protocol

```bash
# Step 1 — User must explicitly authorize in the current session message
# Step 2 — Agent sets the key, performs write, unsets immediately
export YAMTAM_SCOPE_OK=1
# ... perform the single authorized write ...
unset YAMTAM_SCOPE_OK

# Step 3 — Agent MUST log via:
core/scripts/secure-logger.sh scope_override "wrote <filename> — user-authorized"
```

Subagents spawned during a scope_override session do NOT inherit `YAMTAM_SCOPE_OK=1`.

---

## Detection in safe-run.sh

When a command targets a protected pattern without `YAMTAM_SCOPE_OK=1`:

```
[yamtam/privilege-isolation] BLOCKED — write to protected file
  File    : <path>
  Command : <full command>
  Gate    : L2
  Fix     : User must explicitly set YAMTAM_SCOPE_OK=1 in current session
```

Exit code: **3** (distinct from blacklist block exit 1)

---

## Constraint Hierarchy (smithy-rs model)

Smithy-rs enforces constraints as first-class citizens that cannot be stripped by
downstream handlers. YAMTAM applies the same principle: privilege isolation is a
constraint on the agent execution model, not a suggestion.

```
Constraint Layer       → this file
Execution Layer        → safe-run.sh + secure-logger.sh
Verification Layer     → verify-rules.sh (must detect violations before commit)
Audit Layer            → core/memory/audit/agent-actions.log
```

---

## Anti-patterns (always blocked)

```
❌ "I'll just update .env to make the test pass"
❌ "The user implied it's OK because they said 'fix everything'"
❌ "YAMTAM_SCOPE_OK=1 was set earlier in the session so it still counts"
❌ Passing YAMTAM_SCOPE_OK=1 via --env to a subagent spawn
```
