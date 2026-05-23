---
name: a2a-protocol-patterns
description: Agent-to-Agent (A2A) protocol — Google 2025, 150+ org backing. Agent Cards discovery, task lifecycle (submitted→working→completed), artifacts (text/structured/video), opaque task model. MCP vs A2A split. Auth: bearer/mTLS/signed. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yamtam-engine — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.54
---

# /a2a-protocol-patterns

## When to Use

- Cross-organization agent calls: your agent calls an agent at another company/system
- Building a discoverable agent endpoint that any A2A-compatible client can invoke
- Replacing bespoke agent-to-agent HTTP contracts with a standard protocol
- Multi-agent systems where subagents are independent services (LangGraph, CrewAI, AutoGen)

## Do NOT use for

- Tool use within a single agent (use MCP — [[mcp-server-patterns]])
- Internal function calls between co-located agents in the same process
- Synchronous tool calls where task lifecycle overhead isn't worth it

---

## MCP vs A2A — the split

```
MCP  (Model Context Protocol)  — agent ↔ tool
                                  vertical: agent reads/writes to a tool server
                                  stateless by default, JSON-RPC

A2A  (Agent-to-Agent Protocol)  — agent ↔ agent
                                  horizontal peer: both sides are agents with reasoning
                                  stateful (task lifecycle), async by default

Production pattern: use both.
  Agent A —[A2A]→ Agent B —[MCP]→ tools on Agent B's side
```

---

## Agent Card (discovery at `/.well-known/agent.json`)

```typescript
// Agent Card spec — publish at /.well-known/agent.json
interface AgentCard {
  name:       string;
  version:    string;
  skills:     string[];          // e.g. ["code-review", "security-scan"]
  endpoints: {
    tasks:    string;            // POST /tasks
  };
  auth: {
    type:     "bearer" | "mtls" | "signed";
    scopes?:  string[];          // OAuth scopes if bearer
  };
  modalities: ("text" | "structured" | "image" | "video" | "audio")[];
  description?: string;
}

// Example
const yamtamAgentCard: AgentCard = {
  name:       "yamtam-security-agent",
  version:    "1.0.0",
  skills:     ["red-team-check", "blue-team-fix", "leak-check"],
  endpoints:  { tasks: "https://agents.example.com/tasks" },
  auth:       { type: "bearer", scopes: ["agent:invoke"] },
  modalities: ["text", "structured"],
};
```

---

## Task lifecycle

```
submitted → working → completed
                    → failed
                    → canceled
```

```typescript
// Task model
interface A2ATask {
  id:       string;
  skill:    string;
  input:    Record<string, unknown>;
  state:    "submitted" | "working" | "completed" | "failed" | "canceled";
  progress?: number;          // 0–100
  artifacts?: Artifact[];
  error?:   string;
}

interface Artifact {
  type:     "text" | "structured" | "image" | "video" | "audio";
  content:  string;           // text/JSON inline or file path
  mimeType?: string;
}
```

---

## Minimal A2A server (Node.js / Express)

```typescript
import express from "express";
import { randomUUID } from "crypto";

const app   = express();
const tasks = new Map<string, A2ATask>();

// Discovery
app.get("/.well-known/agent.json", (req, res) => res.json(yamtamAgentCard));

// Submit task
app.post("/tasks", express.json(), async (req, res) => {
  const task: A2ATask = {
    id:    randomUUID(),
    skill: req.body.skill,
    input: req.body.input,
    state: "submitted",
  };
  tasks.set(task.id, task);
  res.status(201).json({ task_id: task.id, state: task.state });

  // Process async
  processTask(task);
});

// Poll for status
app.get("/tasks/:id", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });
  res.json(task);
});

// SSE for streaming updates
app.get("/tasks/:id/events", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const interval = setInterval(() => {
    const t = tasks.get(req.params.id)!;
    send({ state: t.state, progress: t.progress });
    if (t.state === "completed" || t.state === "failed") {
      clearInterval(interval);
      res.end();
    }
  }, 500);
});

async function processTask(task: A2ATask) {
  task.state = "working";
  task.progress = 0;
  // ... run skill logic ...
  task.state = "completed";
  task.artifacts = [{ type: "text", content: "Scan complete. 0 critical findings." }];
}
```

---

## A2A client (discovery + task submission)

```typescript
async function callAgent(agentBaseUrl: string, skill: string, input: object): Promise<Artifact[]> {
  // 1. Discover
  const card = await fetch(`${agentBaseUrl}/.well-known/agent.json`).then(r => r.json());
  if (!card.skills.includes(skill)) throw new Error(`Agent does not support skill: ${skill}`);

  // 2. Submit
  const { task_id } = await fetch(card.endpoints.tasks, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
    body: JSON.stringify({ skill, input }),
  }).then(r => r.json());

  // 3. Poll until done
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const task: A2ATask = await fetch(`${agentBaseUrl}/tasks/${task_id}`).then(r => r.json());
    if (task.state === "completed") return task.artifacts ?? [];
    if (task.state === "failed")    throw new Error(`Task failed: ${task.error}`);
  }
  throw new Error("Task timed out");
}
```

---

## Auth patterns

```
Bearer token  — OAuth2 or opaque; declare required scopes in Agent Card
mTLS          — mutual TLS; both sides present certificates; for cross-org zero-trust
Signed request — HMAC-SHA256 over request body; lightweight; no PKI required
```

---

## Anti-Fake-Pass Checklist

```
❌ No Agent Card → client can't discover capabilities; bespoke integration required
❌ Task state not persisted → server restart loses in-progress tasks
❌ No auth on /tasks endpoint → anyone can invoke any skill
❌ Synchronous /tasks POST that blocks until done → timeouts on long skills; use async + poll/SSE
❌ Using A2A for tool calls within one agent → MCP is the right layer; A2A overhead unwarranted
❌ Opaque lifecycle violated → prescribing HOW remote agent solves the task defeats the abstraction
```
