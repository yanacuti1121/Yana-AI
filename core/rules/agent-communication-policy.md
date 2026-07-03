**Rule:** agent-communication-policy
**Status:** REVIEWED
**Gate:** L0 — every subagent dispatch is traceable
**Source:** yana-ai (rewritten 2026-07-03 to match the real dispatch model — see "Why not async messaging" below)

---

# Agent Communication Policy

## Principle

Every "agent" a session actually spawns is a Task-tool subagent, dispatched synchronously by the main agent within the same Claude Code session, that runs to completion and returns a plain-text report. There is no persistent, always-on second process to send a message to. The canonical format for that dispatch and that report is already defined in [[subagent-policy]] — this file does not duplicate it, it points at it.

No agent may communicate with another via shared global variables or direct filesystem writes outside its own declared task scope. That constraint doesn't need a message-bus protocol to enforce — it's already covered by [[subagent-policy]]'s read-only-unless-main-agent rule.

## The real dispatch/report contract

**Dispatch** (main agent → subagent): a prompt stating the task, its scope, and what the subagent must not do (write, edit, commit, push, run hooks) — per [[subagent-policy]]'s dispatch template.

**Report** (subagent → main agent): plain text, not a file, not a message envelope. Structure:

```markdown
## Review Report — [scope]

**Files examined:** [list]
**Findings:**
- [finding 1]
- [finding 2]

**Evidence & Reasoning:**
- Why this conclusion? (cite the pattern/logic found)
- What was checked but found clean.

**Recommended actions for main agent:**
- [action 1] — at [file:line]

**No files were modified.**
```

The main agent receives every report directly in its own context — there is no separate delivery step, no queue, no "did it arrive" question, because it's a synchronous function-call-shaped return, not a network hop.

## What "logged" actually means here

Every subagent dispatch already passes through hooks wired in `.claude/settings.json`'s `PreToolUse`/`PostToolUse` matchers on `Agent|Task`: `agent-budget-gate.sh` and `agent-pixel-notify.sh` fire on dispatch, and the catch-all `audit-log.sh` (hash-chained JSONL, see `audit-hardening-policy.md`) logs every tool call including these. That's the real audit trail. There is no separate bus log to also maintain.

## Multiple subagents in the same turn — resolving what they report back

When 2+ subagents are dispatched for related work and their findings conflict or overlap, resolve per [[conflict-resolution]] — priority order Safety > Correctness > Performance > Style, with human escalation (Strategy C) for genuine conflicts the priority order doesn't settle. That file already covers this; this file doesn't re-specify it.

For the specific case of *reviewing a change before it lands in critical infrastructure* (rules, hooks, gates, agent personas), see [[54-bft-consensus-law]] for which reviewers to dispatch and what counts as a blocking finding.

## Why not async messaging

An earlier version of this policy specified a JSON message envelope (nonce, signature, TTL, clock-skew window), a file-based mailbox layout (`core/bus/mailboxes/<agent>/{inbox,processed}`), a replay-prevention nonce registry, and delivery guarantees (at-most-once, FIFO). None of that infrastructure exists on disk today except the mailbox script itself (`core/bus/agent-message-bus.sh`, kept as optional manual tooling — see below), and none of it is needed: a Task-tool dispatch has no network hop to defend, no delivery window (the call returns or the turn ends), and no second, independently-scheduled process that could receive a message hours later. That whole design solves problems a single-session, human-supervised system doesn't have.

If Yana AI ever runs multiple genuinely independent, concurrently-scheduled agent processes that need to coordinate without a shared context, an async protocol like the one this file used to describe becomes the right tool again. Until then, describing it here as the *current* mechanism was the actual bug — this rewrite exists so that gap doesn't quietly reopen the next time someone reads this file looking for how agents really talk to each other.

## Optional manual tooling (not part of the automatic pipeline)

`core/bus/agent-message-bus.sh` and `core/bus/swarm-router.js` still exist and still work — they're useful if a human wants to manually coordinate multiple *separate* Claude Code sessions (e.g. running in different terminals) via a shared file-based mailbox. Neither is invoked automatically by any hook, and neither should be treated as "how agents communicate" for the normal single-session case this policy governs.

## Anti-Pattern Checklist

```
❌ Subagent attempts Write/Edit/MultiEdit, git commit, git push, or running
   a hook — banned outright by subagent-policy.md, not a communication
   format issue
❌ Main agent silently merges conflicting subagent findings instead of
   applying conflict-resolution.md's priority order
❌ Subagent report omits "Evidence & Reasoning" or claims a conclusion
   without citing what was actually checked
❌ Subagent report is a file diff instead of a text report (the "No files
   were modified" line exists specifically to catch this)
❌ Treating core/bus/*.sh as the enforcement mechanism for anything —
   it's optional manual tooling for a scenario (independent concurrent
   sessions) most tasks aren't in
```
