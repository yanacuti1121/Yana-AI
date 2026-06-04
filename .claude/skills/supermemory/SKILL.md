---
name: supermemory
description: Managed Memory API for AI agents and apps — ingest content, auto-chunk into searchable memories, build user profiles, resolve contradictions, and retrieve the right context at query time. Ranked #1 on LongMemEval, LoCoMo, ConvoMem.
license: MIT
compatibility: yamtam-engine >= 1.3.54
metadata:
  origin: yamtam-engine — synthesized from supermemoryai/supermemory (MIT)
  version: 1.0.0
triggers:
  - "supermemory"
  - "supermemory API"
  - "long-term memory agent"
  - "agent memory across sessions"
  - "user profile memory"
  - "personalization layer chatbot"
  - "memory + RAG without vector DB"
  - "connect Slack Notion Gmail memory"
  - "recall past conversations"
  - "LongMemEval memory"
  - "managed memory API"
  - "supermemoryai"
do_not_use_for:
  - Tiered memory (user/session/agent) with fine-grained scoping — use mem0 instead
  - Self-managing OS-style memory with virtual context — use memgpt-virtual-context instead
  - Fully open-source self-hosted memory pipelines — use mem0 or Letta instead
see_also:
  - mem0
  - memgpt-virtual-context
  - rag-architect
  - in-memory-vector-storage
---

# supermemory — Managed Memory API for AI Agents

**Source:** supermemoryai/supermemory (MIT) — #1 LongMemEval · fast, scalable Memory API

## Why supermemory

Bundles memory storage + RAG into one hosted API. No vector DB to manage.
Auto-chunks ingested content, resolves contradictions, builds dynamic user profiles,
and returns the right memories at query time.

## Install

```bash
npm install supermemory    # TypeScript/JS
pip install supermemory    # Python
```

## Core API

```typescript
import Supermemory from 'supermemory'

const client = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY })

// Ingest memory (auto-chunked)
await client.add("User prefers dark mode and uses VS Code", {
  containerTag: "user_123"   // isolate per user/agent
})

// Search memories
const results = await client.search("user preferences", {
  containerTag: "user_123"
})

// Get user profile (built from all memories)
const profile = await client.profile({ containerTag: "user_123" })
console.log(profile.summary)   // "User is a developer who prefers dark mode..."
```

## REST API (direct)

```bash
# Ingest document
curl -X POST https://api.supermemory.ai/v3/documents \
  -H "Authorization: Bearer $SUPERMEMORY_API_KEY" \
  -d '{"content": "...", "containerTag": "agent_session_1"}'

# Search
curl "https://api.supermemory.ai/v3/search?q=past+decisions&containerTag=agent_session_1" \
  -H "Authorization: Bearer $SUPERMEMORY_API_KEY"
```

## Python SDK

```python
from supermemory import Supermemory

client = Supermemory(api_key=os.environ["SUPERMEMORY_API_KEY"])

# Add memory
client.add("Meeting notes: decided to use Rust for performance layer", {
    "container_tag": "project_yamtam"
})

# Recall
memories = client.search("architecture decisions", container_tag="project_yamtam")
for m in memories.results:
    print(m.content, m.relevance_score)
```

## Data Source Integrations

Supermemory connects natively to:
- Slack, Notion, Google Drive, Gmail
- GitHub (issues, PRs, commits)
- Web pages (via URL ingestion)
- Any REST endpoint via webhook

## YAMTAM Integration Pattern

```typescript
// Use supermemory as external L3 for cross-session agent memory
const memory = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY })

// On session end — persist important decisions
await memory.add(sessionSummary, { containerTag: "yamtam_agent" })

// On session start — recall relevant context
const ctx = await memory.search("current project state", {
  containerTag: "yamtam_agent",
  limit: 5
})
```

## vs mem0

| | supermemory | mem0 |
|--|--|--|
| Hosting | Managed API | Self-hosted or cloud |
| Memory tiers | Single container-tag scope | user/session/agent tiers |
| Benchmarks | #1 LongMemEval | Strong on structured recall |
| Setup | API key only | More config needed |
