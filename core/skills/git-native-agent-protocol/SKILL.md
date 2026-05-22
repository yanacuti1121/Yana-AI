---
name: git-native-agent-protocol
description: >
  Coordinate multiple AI agents using Git as the shared protocol — issues as
  task queues, branches as agent workspaces, PRs as deliverables, and commit
  messages as structured agent signals. Use when asked about "GNAP", "git
  native agent", "agents coordinating through git", "issue-driven agent",
  "PR as agent output", "multi-agent git workflow", "agent task board",
  "agents sharing work via repo", "agent kanban in git", or "how do agents
  hand off work without a message bus". Do NOT use for: real-time inter-agent
  messaging — see agent-messaging-patterns. Do NOT use for: single-agent
  worktree isolation — see worktree-safety.
origin: adapted:MIT © andyrewlee/awesome-agent-orchestrators (GNAP)
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Git ≥ 2.40, GitHub CLI (gh). Works in Codespaces, devcontainers, any git-backed env."
---

## When to Use

- Use when: multiple agents need to divide and claim tasks without a separate message broker
- Use when: agent work needs full audit trail baked into version control
- Use when: humans need visibility into what each agent did and why
- Use when: running agents in parallel across Codespaces / worktrees
- Do NOT use for: real-time < 1s agent coordination — use in-process signaling
- Do NOT use for: single agent tasks — overhead not worth it

---

## The Mental Model

```
Git repo = shared coordination layer (no separate message bus)

Issues   = task queue    — agents claim issues by assigning themselves
Branches = workspaces    — one branch per agent per task
PRs      = deliverables  — agent opens PR when task complete, requests review
Labels   = routing tags  — "agent:ready", "agent:in-progress", "agent:blocked"
Comments = status signals — agents post structured JSON progress updates
```

```
Human or Orchestrator
  └─ Creates issue: "feat: implement payment retry logic"
       Labels: "agent:ready", "backend"

Agent A (claims it)
  └─ Assigns issue to itself, label → "agent:in-progress"
  └─ Creates branch: agent/payment-retry-{issue-number}
  └─ Works in worktree: git worktree add ../payment-retry agent/payment-retry-42
  └─ Opens PR: links to issue, structured checklist
  └─ Posts progress comment: { "status": "blocked", "reason": "need DB schema decision" }

Agent B (reviewer)
  └─ Sees "agent:review-needed" label
  └─ Reviews PR, approves or requests changes
  └─ Merge → issue closes → branch deleted → worktree cleaned
```

---

## Issue as Task Spec

```markdown
<!-- Issue body — structured for agent consumption -->
## Task
Implement exponential backoff retry for payment API calls.

## Acceptance Criteria
- [ ] Retry up to 3 times with 1s, 2s, 4s delays
- [ ] Do NOT retry on 4xx errors (client fault)
- [ ] Log each retry attempt with attempt number and delay
- [ ] Unit tests cover: success on retry 2, exhausted retries, no-retry on 400

## Context
- File: `src/services/payment.ts`
- Dependency: `resilience-patterns` skill for circuit breaker integration
- Related: #38 (payment timeout fix)

## Agent Instructions
Branch: `agent/payment-retry-{issue_number}`
Commit prefix: `fix(payment):`
```

---

## Agent Branch + Worktree Convention

```bash
# Orchestrator or agent claims issue
gh issue edit 42 --add-assignee "@me" --add-label "agent:in-progress"

# Create isolated worktree (no checkout conflict with main work)
ISSUE=42
BRANCH="agent/payment-retry-${ISSUE}"
git worktree add "../workspace-${ISSUE}" -b "$BRANCH"
cd "../workspace-${ISSUE}"

# Work, commit with structured prefix
git commit -m "fix(payment): add exponential backoff retry

agent: payment-agent
issue: #${ISSUE}
attempt: 1/3
status: implementation complete, tests pending"

# Open PR linking to issue
gh pr create \
  --title "fix(payment): exponential backoff retry (#${ISSUE})" \
  --body "Closes #${ISSUE}

## Changes
- Added RetryPolicy class with exponential backoff
- Integrated with circuit breaker (resilience-patterns)

## Checklist
- [x] Retry up to 3 times
- [x] Skip retry on 4xx
- [x] Unit tests pass

agent: payment-agent | branch: ${BRANCH}" \
  --label "agent:review-needed"
```

---

## Agent Status Comment Protocol

```ts
// Agents post structured JSON progress to issue/PR comments
// Parseable by orchestrator for status aggregation

const statusUpdate = {
  agent:     'payment-agent',
  issueRef:  42,
  status:    'blocked',           // ready | in-progress | blocked | done
  progress:  '2/4 criteria met',
  blockedBy: 'schema decision needed — see comment #3',
  timestamp: new Date().toISOString(),
};

await gh.issues.createComment({
  body: `<!-- agent-status -->\n\`\`\`json\n${JSON.stringify(statusUpdate, null, 2)}\n\`\`\``,
});
```

---

## Orchestrator: Claim Next Available Task

```bash
#!/usr/bin/env bash
# Claim oldest unassigned agent-ready issue

ISSUE=$(gh issue list \
  --label "agent:ready" \
  --assignee "" \
  --json number,title \
  --jq '.[0].number')

if [[ -z "$ISSUE" ]]; then
  echo "No tasks available"
  exit 0
fi

gh issue edit "$ISSUE" \
  --add-assignee "@me" \
  --remove-label "agent:ready" \
  --add-label "agent:in-progress"

echo "Claimed issue #$ISSUE"
```

---

## Cleanup After Merge

```bash
# Post-merge: clean worktree + archive branch
ISSUE=42
git worktree remove "../workspace-${ISSUE}" --force
git branch -d "agent/payment-retry-${ISSUE}"
gh issue close "$ISSUE" --comment "Completed by agent. PR merged."
```

---

## Anti-Fake-Pass Rules

Before claiming GNAP coordination is set up, you MUST show:
- [ ] Issues have structured acceptance criteria + agent instructions section
- [ ] Branch naming follows `agent/{task}-{issue_number}` convention
- [ ] Each agent uses a separate worktree — no shared working directory
- [ ] Agents post structured JSON status comments — not free-text
- [ ] PRs link to issue with `Closes #N` — auto-closes on merge
- [ ] Orchestrator script can claim next available task idempotently
- [ ] Worktrees and branches cleaned up post-merge

Reference: `gates/anti-fake-pass-gate.md`
