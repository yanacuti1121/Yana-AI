---
name: ai-team-workflow
description: >
  Organize AI agents as a structured team — role assignment, proposal/vote/
  review/ship cycle, cross-agent code review, consensus mechanisms, and
  escalation to human for deadlocks. Use when asked about "AI team", "agents
  working as a team", "multi-agent workflow", "agent roles", "agent review",
  "agents vote", "Hivemoot", "AI proposes and votes", "agent consensus",
  "agents reviewing each other's work", "define agent roles", "AI standup",
  or "autonomous team of agents". Do NOT use for: git-based task coordination
  — see git-native-agent-protocol. Do NOT use for: safety gates — see
  agent-safety-patterns.
origin: adapted:MIT © Hivemoot project
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Claude Code multi-agent, any orchestration framework. Patterns are tool-agnostic."
---

## When to Use

- Use when: multiple agents need to tackle a feature from different angles simultaneously
- Use when: agent output quality improves with a review-before-merge step
- Use when: building an autonomous system that can propose and ship without human per-task approval
- Do NOT use for: single-agent tasks — overhead not justified
- Do NOT use for: real-time coordination — this is async, PR-cycle cadence

---

## Role Taxonomy

```
Architect    — breaks down requirements, designs the approach, creates task issues
Implementer  — writes code from the task spec (one per independent module)
Reviewer     — audits implementer's work: correctness, tests, security, style
QA Agent     — runs the test suite, e2e tests, performance checks
Integrator   — merges approved PRs, resolves conflicts, updates changelog
Watchdog     — monitors anomalies, triggers escalation on budget overrun or loop
```

---

## Propose / Vote / Implement / Review / Ship

```
Phase 1 — PROPOSE (Architect agent)
  → Reads requirements
  → Proposes 2-3 implementation approaches in a structured doc
  → Posts to shared channel: .claude/proposals/feat-X.md

Phase 2 — VOTE (All senior agents)
  → Each agent adds vote + rationale to the proposal
  → Majority wins; tie → escalate to human
  → Winning approach becomes the task spec

Phase 3 — IMPLEMENT (Implementer agents, parallel)
  → Each implementer claims an independent module
  → Works in own branch/worktree
  → Opens PR when complete

Phase 4 — REVIEW (Reviewer agent)
  → Checks each PR: logic, tests, security, style
  → Approves or requests changes
  → QA agent runs full test suite

Phase 5 — SHIP (Integrator agent)
  → Merges approved PRs in dependency order
  → Updates CHANGELOG
  → Tags release if all checks pass
```

---

## Proposal Format

```markdown
<!-- .claude/proposals/feat-payment-retry.md -->
# Proposal: Payment Retry with Exponential Backoff

## Context
Payment calls timeout ~5% of the time. Need retry with backoff.

## Option A — In-process retry (RetryPolicy class)
- Pros: no infra, simple, testable
- Cons: retries block request thread on synchronous endpoints
- Risk: LOW

## Option B — Queue-based retry (SQS + Lambda)
- Pros: decoupled, observable, handles crashes
- Cons: async — caller gets 202 Accepted, not result
- Risk: MEDIUM

## Option C — Istio retry policy (sidecar)
- Pros: zero code change
- Cons: no custom logic (backoff curve fixed), hides retries from logs
- Risk: LOW

## Votes
- [ ] architect-agent:
- [ ] backend-agent:
- [ ] security-agent:
```

---

## Vote Tallying (Automated)

```bash
# Extract votes from proposal file and tally
PROPOSAL=".claude/proposals/feat-payment-retry.md"

count_votes() {
  local option="$1"
  grep -c "^- \[x\] .*:.*Option ${option}" "$PROPOSAL" || echo 0
}

A=$(count_votes A); B=$(count_votes B); C=$(count_votes C)
echo "Option A: $A | Option B: $B | Option C: $C"

TOTAL_VOTERS=3
CAST=$(( A + B + C ))
if [[ "$CAST" -lt "$TOTAL_VOTERS" ]]; then
  echo "Voting incomplete — waiting for remaining agents"
elif [[ "$A" -gt "$B" && "$A" -gt "$C" ]]; then
  echo "Winner: Option A"
elif [[ "$B" -gt "$A" && "$B" -gt "$C" ]]; then
  echo "Winner: Option B"
else
  echo "Tie or Option C wins — escalate to human"
  gh issue create --title "Human decision needed: payment retry approach" --body "$(cat $PROPOSAL)"
fi
```

---

## Cross-Agent Review Protocol

```markdown
<!-- PR description template for agent-submitted PRs -->
## Agent
implementer-agent / module: payment-retry

## What was built
- RetryPolicy class with exponential backoff (1s, 2s, 4s)
- Skips retry on 4xx (client errors)
- Unit tests: 6 cases covering all paths

## Review checklist (for reviewer-agent)
- [ ] Logic matches proposal Option A spec
- [ ] Error paths tested (exhausted retries, 400, 500)
- [ ] No silent catch blocks
- [ ] No secrets hardcoded
- [ ] TypeScript strict mode passes

## QA gate (for qa-agent)
- [ ] `npm test` passes
- [ ] Integration test against payment stub passes
- [ ] No new lint warnings
```

---

## Escalation Triggers

```ts
const escalationTriggers = [
  { condition: 'voting_tie',       reason: 'Agents split evenly — human tiebreaker needed' },
  { condition: 'review_rejected_3x', reason: 'PR rejected 3 times — likely spec ambiguity' },
  { condition: 'budget_exceeded',  reason: 'Agent token budget exceeded — task may be too large' },
  { condition: 'anomaly_detected', reason: 'Agent wrote outside allowed paths' },
  { condition: 'test_fail_loop',   reason: 'Tests failing for > 5 fix attempts' },
];

// Escalation action: open GitHub issue + stop agent work
function escalate(trigger: string, context: object) {
  gh.issues.create({
    title: `[ESCALATION] ${trigger}`,
    body: JSON.stringify(context, null, 2),
    labels: ['agent:escalation', 'human-needed'],
  });
  process.exit(0);  // agent stops, human picks up
}
```

---

## Anti-Fake-Pass Rules

Before claiming AI team workflow is operational, you MUST show:
- [ ] Each agent has a documented role with explicit capability scope
- [ ] Proposals are written before any implementation begins
- [ ] Voting is recorded in the proposal file — not just verbal/in-context
- [ ] PRs include the cross-agent review checklist — reviewer signs off line by line
- [ ] Escalation triggers are defined and wired — not just documented
- [ ] Human is notified (issue created) for ties, repeated failures, and anomalies

Reference: `gates/anti-fake-pass-gate.md`
