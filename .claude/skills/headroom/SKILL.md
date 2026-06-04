---
name: headroom
description: Context compression layer for agent tool outputs, RAG chunks, logs, and inter-agent messages — 60–95% token reduction with no answer quality loss. Deployable as Python lib, TypeScript lib, HTTP proxy, or MCP server.
license: MIT
compatibility: yamtam-engine >= 1.3.54
metadata:
  origin: yamtam-engine — synthesized from chopratejas/headroom (MIT)
  version: 1.0.0
triggers:
  - "headroom"
  - "headroom compress"
  - "compress tool output"
  - "compress agent context"
  - "reduce token from tool output"
  - "compress RAG chunk"
  - "shrink context window"
  - "lower LLM API cost"
  - "compress inter-agent message"
  - "context compression agent"
  - "token reduction LLM"
  - "headroom proxy"
  - "headroom MCP"
do_not_use_for:
  - Binary/stream compression at rest — use zlib-stream-compression instead
  - Cryptographic encoding or transmission-layer compression
  - File archiving — use zip-memory-operations instead
see_also:
  - prompt-caching-strategy
  - zlib-stream-compression
  - rag-architect
  - mem0
---

# headroom — Context Compression for LLM Agents

**Source:** chopratejas/headroom (MIT) — reversible context compression before LLM call

## Why headroom

Tool outputs, search results, and RAG chunks are verbose by design — they're made for humans.
headroom compresses them for LLMs: 60–95% token reduction, answers stay identical.

Key differentiator: **content-aware routing** — detects JSON vs code vs prose vs logs and
applies the right compressor automatically.

## Install

```bash
pip install headroom-ai
# TypeScript
npm install headroom-ai
```

## Core API

```python
from headroom import compress

# Universal entry — auto-detects content type via ContentRouter
result = compress(tool_output)
print(result.compressed)       # compressed string
print(result.ratio)            # e.g. 0.15 = 85% reduction
print(result.tokens_saved)     # estimated tokens saved

# Decompress (reversible)
from headroom import decompress
original = decompress(result.compressed)
```

## Compressor Types

```python
from headroom import SmartCrusher, CodeCompressor, SharedContext

# JSON arrays / objects
crusher = SmartCrusher()
compact = crusher.compress(large_json_response)

# Code files — AST-aware (Python, JS, Go, Rust, Java, C++)
code_comp = CodeCompressor()
compact_code = code_comp.compress(source_file)

# Shared inter-agent context (80% smaller)
ctx = SharedContext()
ctx.put("search_results", raw_results)   # compressed store
data = ctx.get("search_results")         # decompress on read
```

## Deployment Modes

```bash
# As HTTP proxy (OpenAI/Anthropic-compatible)
pip install headroom-ai[proxy]
headroom proxy --port 8080
# Point your SDK at http://localhost:8080 — compression transparent

# As MCP server
headroom mcp
# Add to .claude/settings.json mcpServers
```

## Agent Integration Pattern

```python
from headroom import compress

def call_tool(tool_name, args):
    raw_result = tools[tool_name](**args)
    # Compress before injecting into agent context
    compressed = compress(raw_result)
    return compressed.compressed   # pass to LLM, not raw

# Inter-agent: compress before handoff
from headroom import SharedContext
ctx = SharedContext()
ctx.put("agent_1_findings", agent_1_output)
# Agent 2 reads compressed — same info, 80% fewer tokens
```

## When to Use in YAMTAM

- Before passing large tool results to agent context
- When token budget warnings appear (budget-sentinel at 50%)
- Compressing search results in RAG pipelines
- Shrinking inter-agent handoff payloads in `/multi-run`
