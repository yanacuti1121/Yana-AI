# 62-sovereign-overlord-gate-law

**Status:** REVIEWED (rewritten 2026-07-03 — see "What this rule used to say" below)

## Rule

One human principal has final authority over this system. In the real architecture that authority isn't a cryptographic override layered on top of the agent — it's structural: nothing destructive or irreversible executes without that human's explicit approval in the current session, via the ordinary mechanisms already enforced elsewhere in this rule set. This file previously described a parallel, unimplemented authority stack (signed tokens, a tiered agent hierarchy, a "freeze the swarm" command) — replaced here with what's actually true.

## Real Authority Mechanisms

| Need | Real mechanism |
|---|---|
| Gate specific CLI commands to sovereign-only | `core/gates/identity-gate.sh` + `core/gates/require-tier.sh` — real SHA-256-hashed guest/operator/sovereign check, sets `YANA_TIER` |
| Block an irreversible action pending human confirmation | `core/rules/human-gate-policy.md` — the human keystroke gate already covering push/publish/deploy/delete |
| Prevent unreviewed pushes | `core/rules/git-push-enforcement.md` — no push without gate checks + explicit authorization |
| "Wipe state, restore baseline" | `git revert` / `git reset` — the actual rollback path, gated by the same human-approval rules as any other destructive git operation (see `git-push-enforcement.md`'s Rollback Protocol) |
| "Freeze work in progress" | The human stops sending messages, or says so — a single synchronous session has no background process that keeps running without a human turn driving it |

There is no persistent "agent RAM state" to wipe: subagents are dispatched synchronously per task (`subagent-policy.md`) and return a text report — they don't persist between dispatches, so there is nothing running in the background for a sovereign command to reach into.

## Prohibited

- Any agent claiming authority beyond what `require-tier.sh`'s real tier check grants
- Bypassing `human-gate-policy.md` or `git-push-enforcement.md` because "the sovereign authorized it" earlier in the session — authorization is per-action, not standing (see those files' own scoping rules)
- Reintroducing a tier/authority vocabulary for *agents* — `agent-hierarchy-law.md` already retired the "Level 0–3 agent hierarchy" version of this idea in its 2026-07-03 rewrite; it doesn't belong here either. The guest/operator/sovereign tiers in `require-tier.sh` are a different, real thing: human-operator privilege, not agent authority.

## References

- `core/gates/identity-gate.sh`, `core/gates/require-tier.sh` — the real, working tier check
- `core/rules/human-gate-policy.md` — human confirmation gate
- `core/rules/git-push-enforcement.md` — push gate + rollback protocol
- `core/rules/agent-hierarchy-law.md` — why agent-authority tiers (as opposed to human-operator tiers) were retired
- `core/skills/sovereign-overlord-gate/SKILL.md` — rewritten the same day to match this rule

## What this rule used to say

Before this rewrite: an ECDSA-P384-signed "Sovereign token" with a 60-second validity window and Merkle-logged nonce-reuse prevention, a `FREEZE_SWARM`/`WIPE_AGENT_STATE`/`FULL_ROLLBACK`/`RELEASE_QUARANTINE`/`EMERGENCY_SHUTDOWN` command set, a `SOVEREIGN_ABSENCE_ALERT` triggered after 72 hours without sovereign-key use, and a "Level 0 (Sovereign Human) → Level 1 (Orchestrator Agents) → Level 2 (Executor Agents) → Level 3 (Auditor Agents)" hierarchy. None of the token signing/verification or the absence-alert timer exist anywhere in code. The command *names* have one real trace: `core/gates/identity-gate.sh:75` lists `freeze-swarm rollback release-quarantine emergency-shutdown` in a `SOVEREIGN_ALLOWS` permission-matrix string — but that variable is assigned once and never read anywhere else in the file (confirmed by grep), so it's dead vocabulary describing the same fiction, not a working implementation of it; worth deleting from `identity-gate.sh` in a follow-up pass. The Level 0–3 hierarchy duplicated, with different names, the exact tier-authority vocabulary `agent-hierarchy-law.md` explicitly retired in its 2026-07-03 rewrite — reviving it here would have silently reopened the gap that rewrite closed.

## Related

- `core/rules/50-financial-deadman-switch-law.md` — the autonomous-runtime counterpart, rewritten the same day for the same reason
