---
name: memgpt-virtual-context
description: MemGPT virtual context — OS virtual-memory analogy for LLM context management. Two-tier (main context = RAM, external store = disk), page-in/page-out tools, archival/core memory split. Foundation for Letta, Mem0, multi-session persistence. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yamtam-engine — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.54
---

# /memgpt-virtual-context

## When to Use

- Multi-session agents that must remember facts across conversations
- Long documents or tool traces that overflow the context window
- Agents where context dilution hurts (irrelevant facts crowd out key instructions)
- Building the memory layer for a Letta/Mem0-style production agent

## Do NOT use for

- Single-session tasks where the full context fits in the window
- Retrieval-only RAG pipelines (use [[rag-architect]])
- Tasks where freshness matters and all memory should reset each session

---

## The OS analogy (MemGPT, Packer et al. 2023)

```
OS concept     MemGPT concept          2026 production analog
──────────     ──────────────          ───────────────────────
RAM            main context (prompt)   Anthropic/OpenAI context window
Disk           external context        vector DB / KV / graph store
Page fault     memory tool call        memory.search / memory.read / memory.write
OS kernel      agent control loop      ReAct loop with memory tools
```

---

## Two-tier memory store (stdlib)

```python
from dataclasses import dataclass, field
import json, math

@dataclass
class MainContext:
    """Fixed-size prompt holding current task. Always visible to the model."""
    core_memory: dict[str, str] = field(default_factory=dict)
    max_chars: int = 2000

    def set(self, section: str, text: str) -> str:
        self.core_memory[section] = text[:self.max_chars]
        return "ok"

    def append(self, section: str, text: str) -> str:
        existing = self.core_memory.get(section, "")
        self.core_memory[section] = (existing + "\n" + text)[:self.max_chars]
        return "ok"

    def render(self) -> str:
        return "\n".join(f"[{k}]\n{v}" for k, v in self.core_memory.items())

@dataclass
class ArchivalStore:
    """Unbounded external store, searchable via embedding similarity."""
    records: list[dict] = field(default_factory=list)

    def insert(self, text: str, source: str = "") -> str:
        self.records.append({"text": text, "source": source, "id": len(self.records)})
        return f"inserted record #{len(self.records) - 1}"

    def search(self, query: str, top_k: int = 3) -> list[dict]:
        # Toy: keyword overlap scoring (replace with real embedding similarity)
        query_words = set(query.lower().split())
        scored = []
        for r in self.records:
            overlap = len(query_words & set(r["text"].lower().split()))
            scored.append((overlap, r))
        scored.sort(key=lambda x: -x[0])
        return [r for _, r in scored[:top_k]]
```

---

## Memory tool surface (4 canonical tools)

```python
class MemoryTools:
    def __init__(self, main: MainContext, archival: ArchivalStore):
        self.main = main
        self.archival = archival

    def core_memory_append(self, section: str, text: str) -> str:
        """Write to a persistent section of the prompt (always visible)."""
        return self.main.append(section, text)

    def core_memory_replace(self, section: str, old: str, new: str) -> str:
        """Edit a persistent section."""
        if section not in self.main.core_memory:
            return f"[error] section '{section}' not found"
        self.main.core_memory[section] = self.main.core_memory[section].replace(old, new, 1)
        return "ok"

    def archival_memory_insert(self, text: str) -> str:
        """Write to the searchable external store (not always in prompt)."""
        return self.archival.insert(text)

    def archival_memory_search(self, query: str, top_k: int = 3) -> str:
        """Retrieve from external store — page into next observation."""
        results = self.archival.search(query, top_k)
        if not results:
            return "[no results found]"
        return "\n".join(f"[{r['id']}] {r['text']}" for r in results)
```

---

## Wiring into the agent loop

```python
def build_system_prompt(memory_tools: MemoryTools) -> str:
    core = memory_tools.main.render()
    return f"""You are a persistent agent with access to memory tools.

Core memory (always visible):
{core}

Memory tools available:
- core_memory_append(section, text) — add to core memory
- core_memory_replace(section, old, new) — edit core memory
- archival_memory_insert(text) — save to external store
- archival_memory_search(query, top_k) — recall from external store

When you learn a new fact about the user or task, save it to core or archival memory.
When you need a fact that might be in archival memory, search for it first."""
```

---

## Memory poisoning defense

```python
# External memory is retrieved text — can contain attacker-controlled content.
# If user-uploaded documents land in archival store, they re-enter next session.

POISON_PATTERNS = [
    r'ignore (all )?previous',
    r'new instructions:',
    r'system:\s*you are',
    r'override rule',
]
import re

def safe_archival_insert(tools: MemoryTools, text: str) -> str:
    for pattern in POISON_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return "[insert rejected — content matches injection pattern]"
    return tools.archival_memory_insert(text)
```

---

## MemGPT → Letta evolution

```
MemGPT (2023)      Two tiers: core + archival. send_message/heartbeat loop.
Letta (2024+)      Three tiers: core + recall + archival.
                   Native reasoning replaces thought tokens.
                   Sleep-time agents: async agent reflects + writes to memory blocks.
                   Conflict detector: flags contradictory archival writes.
```

---

## Anti-Fake-Pass Checklist

```
❌ Core memory grows without bound → hits context limit; add a max_chars trim
❌ No citation on archival write → agent recalls "user asked X" but can't say which session
❌ Memory poisoning ignored → attacker doc saved to archival re-enters next session as instructions
❌ One-size archival store → mix tasks and personal facts → search results cross-contaminate
❌ Searching archival every turn regardless of need → unnecessary tokens + latency
❌ Forgetting that bigger windows don't eliminate context dilution — MemGPT paper shows 128k still misses long-horizon facts that 4k + archival catches
```
