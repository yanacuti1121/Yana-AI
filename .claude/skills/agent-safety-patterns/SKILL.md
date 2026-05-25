---
name: agent-safety-patterns
description: >
  Design safe AI agent systems — capability restriction, sandboxed execution,
  human-in-the-loop gates, anomaly detection, rollback on unexpected behavior,
  blast radius limiting, and output verification before acting. Use when asked
  about "agent safety", "safe agent design", "AI agent guardrails", "capability
  restriction", "agent sandbox", "human approval gate", "agent rollback",
  "blast radius", "agent anomaly detection", "agent going off the rails",
  "agent verification", "principle of least capability", or "how to make an
  agent safe to run autonomously". Do NOT use for: prompt injection defense
  — see adversarial-prompt-testing. Do NOT use for: hook-based blocking
  — see hook-block-commands.
origin: adapted:MIT © VoltAgent/awesome-agent-skills + yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Claude Code agent system, multi-agent architectures. Principles language-agnostic."
---

## When to Use

- Use when: deploying an agent that can write files, run commands, or call APIs
- Use when: an agent had unexpected behavior and needs a safety review
- Use when: designing the capability scope for a new autonomous agent
- Use when: determining what requires human approval vs can be auto-approved
- Do NOT use for: prompt injection defense — see adversarial-prompt-testing
- Do NOT use for: hook-level command blocking — see hook-block-commands

---

## Principle of Least Capability

```
Give the agent only the tools it needs for its specific task.
Never give an agent capabilities it might need "someday".

Read-only agent: Read, Bash (read-only commands), WebFetch
Write agent:     Read, Edit, Bash (scoped), Write (specific dirs only)
Deploy agent:    Read, Bash (deploy scripts only), NOT: Edit, Write to source

Capability matrix example:
  ┌────────────────┬──────┬────────┬───────┬──────────┐
  │ Agent          │ Read │ Edit   │ Write │ Bash     │
  ├────────────────┼──────┼────────┼───────┼──────────┤
  │ research       │  ✅  │  ❌    │  ❌   │ read-only│
  │ code-review    │  ✅  │  ❌    │  ❌   │ lint only│
  │ code-writer    │  ✅  │  ✅    │  ✅   │ test only│
  │ deploy         │  ✅  │  ❌    │  ❌   │ deploy/*  │
  └────────────────┴──────┴────────┴───────┴──────────┘
```

---

## Sandboxed Execution

```bash
# Run agent in read-only filesystem overlay (Linux)
# Agent can "write" to tmpfs overlay — host filesystem unchanged

mkdir -p /tmp/agent-sandbox/{upper,work,merged}
mount -t overlay overlay \
  -o lowerdir=/workspace,upperdir=/tmp/agent-sandbox/upper,workdir=/tmp/agent-sandbox/work \
  /tmp/agent-sandbox/merged

# Run agent in sandbox
cd /tmp/agent-sandbox/merged
claude --agent code-review --sandbox

# Inspect what agent would have written
diff -r /tmp/agent-sandbox/upper /workspace   # shows agent's proposed changes
# Accept: rsync to workspace  |  Reject: rm -rf /tmp/agent-sandbox
```

```yaml
# Docker-based sandboxing for Claude Code agents
services:
  agent-sandbox:
    image: claude-agent:latest
    read_only: true              # read-only root filesystem
    tmpfs: [/tmp, /workspace]   # agent writes go to tmpfs
    cap_drop: [ALL]              # no Linux capabilities
    security_opt: [no-new-privileges:true]
    volumes:
      - ./workspace:/workspace:ro   # read-only source mount
```

---

## Human-in-the-Loop Gates

```ts
// Define gate levels based on action risk
type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

function classifyAction(action: string, target: string): RiskLevel {
  if (action === 'read')                               return 'safe';
  if (action === 'write' && target.startsWith('src/')) return 'low';
  if (action === 'delete')                             return 'high';
  if (action === 'deploy' && target === 'production')  return 'critical';
  if (action === 'execute' && /rm|drop|truncate/.test(target)) return 'critical';
  return 'medium';
}

async function gatedAction(action: string, target: string, execute: () => Promise<void>) {
  const risk = classifyAction(action, target);

  if (risk === 'safe' || risk === 'low') {
    await execute();
    return;
  }

  if (risk === 'critical') {
    const approved = await requestHumanApproval({ action, target, risk });
    if (!approved) throw new Error(`Action denied: ${action} on ${target}`);
  }

  await execute();
  auditLog({ action, target, risk, outcome: 'executed' });
}
```

---

## Anomaly Detection

```ts
// Detect when agent behavior deviates from expected patterns
interface AgentBehaviorProfile {
  maxFilesWrittenPerRun: number;
  allowedPaths: RegExp[];
  allowedCommands: RegExp[];
  maxTokensPerRun: number;
}

const profiles: Record<string, AgentBehaviorProfile> = {
  'code-review': {
    maxFilesWrittenPerRun: 0,
    allowedPaths: [],
    allowedCommands: [/^(eslint|tsc|vitest)/],
    maxTokensPerRun: 50_000,
  },
  'refactor-agent': {
    maxFilesWrittenPerRun: 20,
    allowedPaths: [/^src\//, /^tests\//],
    allowedCommands: [/^(npm|pnpm) (test|run)/],
    maxTokensPerRun: 150_000,
  },
};

function checkAnomaly(agent: string, action: AgentAction): boolean {
  const profile = profiles[agent];
  if (!profile) return true;  // unknown agent = anomaly

  if (action.type === 'write' && !profile.allowedPaths.some(p => p.test(action.path))) {
    alert(`ANOMALY: ${agent} writing outside allowed paths: ${action.path}`);
    return true;
  }
  return false;
}
```

---

## Rollback on Anomaly

```bash
# Snapshot before agent run — rollback if anomaly detected
SNAPSHOT="snapshots/pre-agent-$(date +%s)"
git stash push -m "$SNAPSHOT" --include-untracked

# Run agent
if ! run_agent_with_monitoring; then
  echo "Anomaly detected — rolling back"
  git checkout -- .
  git clean -fd
  exit 1
fi

# Accept agent changes (post-review)
git stash drop
```

---

## Output Verification Before Acting

```ts
// Verify agent's proposed change before applying it
async function verifyAndApply(patch: string): Promise<void> {
  const analysis = await linter.analyze(patch);
  const tests    = await testRunner.dryRun(patch);

  if (analysis.errors.length > 0) {
    throw new Error(`Agent output fails lint: ${analysis.errors.join(', ')}`);
  }
  if (tests.failing > 0) {
    throw new Error(`Agent output breaks ${tests.failing} tests`);
  }
  if (!meetsOutputSchema(patch)) {
    throw new Error('Agent output does not match expected schema');
  }

  await applyPatch(patch);
}
```

---

## Anti-Fake-Pass Rules

Before claiming an agent is safe to run autonomously, you MUST show:
- [ ] Capability list is minimal — only tools the task actually requires
- [ ] Destructive actions (delete, deploy, drop) require explicit human approval
- [ ] Agent runs in isolated worktree or sandbox — host filesystem protected
- [ ] Anomaly detection checks paths, commands, and token budget per run
- [ ] Rollback mechanism tested — verified it can revert a bad agent run
- [ ] Agent output verified (lint + tests) before changes are committed
- [ ] All gated actions logged with caller, action, risk level, and outcome

Reference: `gates/anti-fake-pass-gate.md`
