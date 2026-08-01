---
name: deusdata--codebase-memory-mcp
description: "How to install and use codebase-memory-mcp — a single-binary MCP server that indexes a codebase into a persistent tree-sitter + Hybrid-LSP knowledge graph (158 languages), answering structural queries (call graph, dead code, HTTP/gRPC/GraphQL route linking, ADRs, Cypher-like queries) in sub-millisecond time with ~10x fewer tokens than file-by-file grep/read exploration. Triggers on: 'index this codebase', 'codebase memory mcp', 'code knowledge graph', 'find callers of', 'call graph', 'dead code detection', 'trace HTTP route', 'cypher query codebase', 'architecture overview mcp', 'deusdata codebase-memory', 'install codebase-memory-mcp'."
origin: DeusData/codebase-memory-mcp (MIT)
license: MIT
version: "1.0.0"
compatibility: "yana-ai >= 0.41.0"
allowed-tools: Bash, Read
---

# codebase-memory-mcp — Installable Code Knowledge Graph
# Source: DeusData/codebase-memory-mcp (MIT)
# Tier: TIER 3 — PRODUCTIVITY

Single static binary (C, zero runtime deps) that indexes a repo into a persistent
knowledge graph and exposes it via 14 MCP tools. This is an **install-and-wire-up**
skill, not a content-porting one — the skill's job is knowing when reaching for this
MCP server beats a normal grep/read exploration loop, and how to set it up safely.

**Do NOT use for:** general multimodal knowledge graphs over PDFs/screenshots/diagrams
— see `graphify-knowledge-graph` for that broader, non-code-specific tool. Do NOT use
for a one-off single-file read — the value here is structural, cross-file queries on a
codebase already indexed; indexing overhead isn't worth it for a single lookup.

---

## When this beats grep/read

```
Question shape                          → codebase-memory-mcp tool
─────────────────────────────────────────────────────────────────
"Who calls this function?"              → search_graph (CALLS edges)
"What's dead code in this module?"      → dead code detection tool
"What does this git diff actually risk?"→ detect_changes (impact mapping)
"What are the HTTP routes and their     → get_architecture / cross-service
 handlers across services?"                HTTP_CALLS edges
"Find functions semantically similar    → semantic_query (bundled embeddings,
 to X, no exact name match"                no API key needed)
"MATCH (f:Function)-[:CALLS]->(g)       → search_graph (Cypher-like query
 WHERE f.name = 'main' RETURN g.name"      language)
```

Per the project's own benchmark (arXiv:2603.27277, 31 real repos): ~10x fewer tokens
and ~2x fewer tool calls vs. file-by-file exploration, 83% answer quality. Reach for
it once a codebase is indexed and the question is structural (calls/imports/routes/
dead-code), not for content questions (what does this comment say).

---

## Install

```bash
# macOS / Linux — one-line, auto-detects installed coding agents and wires
# up MCP server entries + instruction files + hooks for each
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash

# With the optional 3D graph visualization UI (localhost:9749)
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash -s -- --ui
```

Per `44-supply-chain-vetting.md` / `dependency-vetting-law.md`: this is a pipe-to-shell
install pattern, normally a hard-block trigger. Before running it for anh, verify
provenance first — release binaries are signed, checksummed, and VirusTotal-scanned
(per the repo's own README claims), and the repo has SLSA 3 + OpenSSF Scorecard badges.
**Do not execute the curl|bash line without the sovereign's explicit per-action
confirmation** (`human-gate-policy.md` — this is exactly the "remote code execution"
pattern `02-terminal-validator.md` hard-blocks). Prefer the manual install path
(download the signed release archive, inspect, then run its bundled `install.sh`) when
in doubt, or ask anh to run it himself via the `!` prefix.

```bash
# Restart the coding agent after install, then simply say:
# "Index this project"
```

---

## Usage inside a Yana AI session

```bash
codebase-memory-mcp config set auto_index true    # auto-index new projects on connect
codebase-memory-mcp --ui=true --port=9749          # optional graph visualization UI
codebase-memory-mcp update                         # check for/apply updates
codebase-memory-mcp uninstall                       # removes agent configs/hooks/skills — NOT the binary or SQLite DBs
```

Once indexed, ask structural questions directly — the agent's MCP client routes them
to the appropriate tool (`get_architecture`, `search_graph`, `detect_changes`,
`semantic_query`, `search_code`, `manage_adr`, etc.) automatically.

---

## Security notes (per `agent-tool-poisoning-guard.md` / `network-egress-law.md`)

```
□ Add to core/config/mcp-whitelist.json before treating this as an approved server
  ("deny-by-default" policy — an unregistered MCP server is not auto-trusted)
□ All processing is claimed local (per README) — no code should leave the machine;
  verify this claim before indexing anything CONFIDENTIAL+ per 68-principal-
  confidentiality-law.md, don't take the README's word alone for sovereign-tier data
□ Snapshot the tool schema at registration time (rug-pull detection) — this is an
  actively-maintained project (pushed same day as this skill was written), re-verify
  schema hash on version bumps
```

---

## Anti-Fake-Pass Checks

```
❌ FAIL nếu chạy curl|bash install mà không xin xác nhận per-action trước (human-gate-policy.md)
❌ FAIL nếu claim tool đã "index xong" mà không thấy confirm output thực tế từ agent
❌ FAIL nếu dùng skill này cho single-file lookup — không có giá trị so với Read thẳng
❌ FAIL nếu bỏ qua mcp-whitelist.json registration bước
✅ PASS khi: câu hỏi có tính structural (calls/imports/routes/dead-code) trên codebase
   đã được index, và MCP server đã qua vetting gate trước khi dùng
```

## See also

- `graphify-knowledge-graph` — broader multimodal knowledge graph (code + PDF + markdown + screenshots), use when the question isn't purely structural code analysis
- `agent-tool-poisoning-guard.md` — MCP schema validation + rug-pull detection this skill's security notes point back to
- `44-supply-chain-vetting.md` — pipe-to-shell install vetting checklist referenced above
