**Rule:** agent-hierarchy-law
**Status:** REVIEWED
**Gate:** L1 — authority enforcement layer
**Source:** yamtam-engine (swarm-orchestrator.sh), RBAC principles, hashicorp/raft consensus model

---

# Agent Hierarchy Law

## Principle

Agents are organized in authority tiers. Higher-tier agents can **veto** actions initiated by lower-tier agents. No agent can elevate its own tier. The hierarchy is enforced by `swarm-orchestrator.sh` before any action with external side-effects is executed.

## Authority Tiers

```
TIER 1 — security-team          [VETO POWER — overrides all lower tiers]
  • Can veto any action from any lower tier
  • Responsible for: gate enforcement, injection blocking, credential review
  • Voting weight: 2× in consensus rounds
  • Required quorum participant for: push, deploy, merge, publish

TIER 2 — core-development
  • Can initiate: write, edit, create, refactor
  • Cannot bypass: security-team review for commits touching core/rules/ or core/scripts/
  • Voting weight: 1×

TIER 3 — qa-team
  • Can initiate: test runs, smoke checks, report generation
  • Cannot initiate: code changes, deployments
  • Voting weight: 1×

TIER 4 — docs-team, design-team  [ADVISORY — no blocking vote]
  • Advisory votes only — cannot block consensus
  • Voting weight: 0.5× (rounded down in tally)
```

## Veto Protocol

```
1. security-team casts NO vote on any REQUEST message
2. swarm-orchestrator.sh detects VETO via VETO_AGENTS check
3. VETO message broadcast to all agents via agent-message-bus.sh
4. Action is BLOCKED — exit code 2
5. Initiating agent receives rejection with reason
6. Human review required to override a security-team veto

VETO cannot be:
  - Overridden by majority vote of lower-tier agents
  - Bypassed by spawning a sub-agent with elevated tier
  - Timed out (no TTL on veto decisions)

VETO can be:
  - Lifted only by the same security-team agent that issued it
  - Or by human operator with YAMTAM_IRREVERSIBLE_OK=1
```

## Consensus Thresholds

```
Standard actions (edit, read, test):
  Quorum: simple majority > 50% of casting votes
  Abstentions: do not count toward total
  Veto: security-team NO = immediate block

Irreversible actions (push, deploy, publish, DROP TABLE):
  Quorum: super-majority > 66%
  Requires: at least 1 vote from Tier 1 (security-team)
  Veto: security-team NO = immediate block

Emergency override (human-in-loop only):
  YAMTAM_IRREVERSIBLE_OK=1 set by human
  Logged to audit trail with operator identity
  Cannot be set by an agent (env-integrity-policy.md blocks it)
```

## File Access Restrictions by Tier

```
core/rules/        — Tier 1 write, Tier 2 read-only, others no access
core/scripts/      — Tier 1 write, Tier 2 write (with Tier 1 approval)
core/skills/       — Tier 2 write
core/agents/       — Tier 1 write only
core/bus/          — All tiers read/write (bus is shared)
releases/          — Tier 2 write with Tier 3 approval (test gate)
```

## Anti-Pattern Checklist

```
❌ Agent self-assigns to a higher tier in its own config
❌ Veto overridden by re-submitting same request with different wording
❌ Sub-agent spawned with elevated permissions to bypass parent veto
❌ Consensus proceeds without checking VETO_AGENTS list
❌ security-team mailbox monitored by lower-tier agent (information leak)
❌ Tier 4 advisory vote counted as blocking vote
❌ Human override (YAMTAM_IRREVERSIBLE_OK) set inside an agent script
```
