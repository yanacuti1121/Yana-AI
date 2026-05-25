---
name: agent-messaging-patterns
description: >
  Wire inter-agent communication — signal files, shared state via files/KV,
  approval queues, budget delegation, capability passing, and broadcast/
  subscribe patterns for agents running in parallel terminals or processes.
  Use when asked about "agents communicating", "agent signals", "how agent
  A tells agent B", "agent approval queue", "agent budget cap", "pass
  context between agents", "agent broadcast", "agent subscribe", "hcom",
  "inter-agent protocol", "agent pipeline", or "agent tool approval chain".
  Do NOT use for: git-based agent coordination — see git-native-agent-protocol.
  Do NOT use for: subagent spawning API — see subagent-dependency.
origin: adapted:MIT © andyrewlee/awesome-agent-orchestrators (hcom)
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Claude Code multi-agent, bash signal files, Node.js IPC. Shell-agnostic patterns."
---

## When to Use

- Use when: two agents run in separate terminals and need to signal each other
- Use when: an agent needs human/orchestrator approval before a destructive action
- Use when: one agent produces output that another agent consumes as input
- Use when: budget/capability restrictions must be enforced at agent boundaries
- Do NOT use for: full distributed message bus — this is file/signal-level coordination
- Do NOT use for: git-based task queuing — see git-native-agent-protocol

---

## Signal File Pattern (Simplest)

```bash
# Agent A writes a signal; Agent B polls for it
SIGNAL_DIR=".claude/signals"
mkdir -p "$SIGNAL_DIR"

# Agent A: signal completion
echo '{"status":"done","output":"dist/bundle.js","agent":"build-agent","ts":"'$(date -Iseconds)'"}' \
  > "$SIGNAL_DIR/build.done"

# Agent B: wait for signal (non-blocking check or polling loop)
until [[ -f "$SIGNAL_DIR/build.done" ]]; do sleep 2; done
BUILD_OUTPUT=$(jq -r '.output' "$SIGNAL_DIR/build.done")
echo "Build done, running tests on $BUILD_OUTPUT"
rm "$SIGNAL_DIR/build.done"   # consume the signal
```

---

## Approval Queue

```bash
# Agent requests human or orchestrator approval before proceeding
APPROVAL_DIR=".claude/approvals"
mkdir -p "$APPROVAL_DIR"

request_approval() {
  local id="$1"
  local action="$2"
  local risk="$3"

  local req_file="$APPROVAL_DIR/${id}.request"
  echo "{\"id\":\"$id\",\"action\":\"$action\",\"risk\":\"$risk\",\"ts\":\"$(date -Iseconds)\"}" \
    > "$req_file"

  echo "Waiting for approval: $action"
  until [[ -f "$APPROVAL_DIR/${id}.approved" || -f "$APPROVAL_DIR/${id}.denied" ]]; do
    sleep 3
  done

  if [[ -f "$APPROVAL_DIR/${id}.approved" ]]; then
    rm "$req_file" "$APPROVAL_DIR/${id}.approved"
    return 0
  else
    rm "$req_file" "$APPROVAL_DIR/${id}.denied"
    return 1
  fi
}

# Usage in agent
if request_approval "drop-table-$(date +%s)" "DROP TABLE legacy_sessions" "HIGH"; then
  psql "$DB_URL" -c "DROP TABLE legacy_sessions;"
else
  echo "Action denied by approver"
fi
```

---

## Budget Delegation

```json
// .claude/agents/deploy-agent/budget.json
// Parent orchestrator writes, child agent reads and respects
{
  "agent":         "deploy-agent",
  "token_cap":     50000,
  "tokens_used":   0,
  "tool_allow":    ["Bash", "Read", "Edit"],
  "tool_deny":     ["Write"],
  "scope":         "deploy/production only",
  "escalate_to":   "orchestrator",
  "expires":       "2026-05-22T18:00:00Z"
}
```

```ts
// Agent checks budget before each tool call
function checkBudget(tokensNeeded: number): boolean {
  const budget = JSON.parse(fs.readFileSync('.claude/agents/deploy-agent/budget.json', 'utf8'));
  if (budget.tokens_used + tokensNeeded > budget.token_cap) {
    signal('orchestrator', { type: 'budget_exceeded', agent: 'deploy-agent' });
    return false;
  }
  budget.tokens_used += tokensNeeded;
  fs.writeFileSync('.claude/agents/deploy-agent/budget.json', JSON.stringify(budget, null, 2));
  return true;
}
```

---

## Pipeline: Agent Output → Agent Input

```
Orchestrator
  ├─ spawn: research-agent  → writes ".claude/context/research.json"
  ├─ await: research.done signal
  ├─ spawn: code-agent      ← reads ".claude/context/research.json"
  │         code-agent      → writes ".claude/context/implementation.json"
  ├─ await: code.done signal
  └─ spawn: review-agent    ← reads ".claude/context/implementation.json"
```

```bash
# Shared context directory — agents read/write structured JSON
CONTEXT=".claude/context"
mkdir -p "$CONTEXT"

# research-agent writes output
jq -n --arg findings "$(cat research_notes.txt)" \
  '{agent:"research-agent",findings:$findings,ts:"'$(date -Iseconds)'"}' \
  > "$CONTEXT/research.json"
echo '{}' > ".claude/signals/research.done"

# code-agent reads it
FINDINGS=$(jq -r '.findings' "$CONTEXT/research.json")
```

---

## Broadcast / Subscribe

```bash
# Orchestrator broadcasts to all listening agents
broadcast() {
  local topic="$1"
  local payload="$2"
  local broadcast_dir=".claude/broadcast"
  mkdir -p "$broadcast_dir"
  echo "$payload" > "$broadcast_dir/${topic}.$(date +%s%N)"
}

# Agent subscribes to a topic
subscribe() {
  local topic="$1"
  local callback="$2"
  inotifywait -m ".claude/broadcast" -e create -e moved_to --format '%f' |
    while read -r file; do
      if [[ "$file" == "${topic}."* ]]; then
        payload=$(cat ".claude/broadcast/$file")
        $callback "$payload"
        rm ".claude/broadcast/$file"
      fi
    done
}

# Example: orchestrator broadcasts abort signal
broadcast "abort" '{"reason":"budget_exceeded","ts":"'$(date -Iseconds)'"}'
```

---

## Anti-Fake-Pass Rules

Before claiming agent messaging is set up, you MUST show:
- [ ] Signal files are JSON-structured — not empty touch files
- [ ] Signals are consumed (deleted) after reading — no stale signals
- [ ] Approval requests have unique IDs — no collision between concurrent agents
- [ ] Budget JSON is read before every tool call, not just at startup
- [ ] Pipeline stages wait for upstream signals — no hard-coded sleeps
- [ ] Context files are versioned per-run (timestamp or run ID in filename)

Reference: `gates/anti-fake-pass-gate.md`
