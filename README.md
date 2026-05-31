<p align="center">
  <img src="./docs/yamtam-engine-hero.png" alt="YAMTAM ENGINE" width="100%" />
</p>

<h1 align="center">YAMTAM ENGINE</h1>

<p align="center">
  <strong>The safety layer that stops AI coding agents before they break your repo.</strong><br/>
  Hooks. Memory. Agents. Verification — all in one engine.
</p>

<p align="center">
  <em>Built by Vũ Văn Tâm · 17 · Vietnam</em>
</p>

<p align="center">
  <a href="https://github.com/phamlongh230-lgtm/yamtam-engine/actions/workflows/ci.yml">
    <img src="https://github.com/phamlongh230-lgtm/yamtam-engine/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <img src="https://img.shields.io/badge/version-v0.17.0-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-Apache_2.0-blue?style=for-the-badge" />
  <a href="https://www.npmjs.com/package/yamtam-engine">
    <img src="https://img.shields.io/npm/v/yamtam-engine?style=for-the-badge&logo=npm&color=cb3837" />
  </a>
  <a href="https://crates.io/crates/yamtam-rt">
    <img src="https://img.shields.io/crates/v/yamtam-rt?style=for-the-badge&logo=rust&color=ce422b" />
  </a>
  <a href="https://pypi.org/project/yamtam-engine/">
    <img src="https://img.shields.io/pypi/v/yamtam-engine?style=for-the-badge&logo=pypi&color=3775a9" />
  </a>
</p>

<p align="center">
  <img src="./docs/demo.svg" alt="Demo — hooks blocking rm -rf, prompt injection, pipe-to-shell" width="100%" />
</p>

---

## The problem

AI coding agents are powerful — and unpredictable. Left unguarded, they can delete production data, execute injected instructions, expose secrets, and deploy without approval. These aren't hypothetical:

- **Replit (July 2025)** — AI agent ran `rm -rf` on production data. Unguarded.
- **PocketOS (April 2026)** — Prompt injection caused unauthorized file exfiltration.

YAMTAM sits **outside** your codebase and intercepts every AI action before it runs:

```
You → Claude Code → [YAMTAM HOOKS] → blocked or allowed
```

---

## Before / After

| Without YAMTAM | With YAMTAM |
|---|---|
| `rm -rf /` silently executes | Hard blocked at L5 |
| `curl \| bash` runs untrusted code | Supply chain guard blocks it |
| AI claims "tests passed" with no evidence | Truth Gate requires proof |
| Prompt injection overrides instructions | L3.5 injection guard intercepts |
| `DROP TABLE users` in production | DB protect hook hard blocks |
| AI deploys without approval | Deploy gate blocks gh/kubectl/docker |

---

## Quick Start

```bash
# Scan your repo for AI agent risks
pip install yamtam-engine
yamtam audit .

# Health check before an agent session
yamtam doctor .
```

**Audit output:**
```
YAMTAM Agent Audit Report

  Score:  0 / 100   Risk: CRITICAL

  [CRITICAL] AC002  .claude/settings.json    allowedTools contains Bash(*) — wildcard shell
  [CRITICAL] SE001  .env:5                   Anthropic API key exposed
  [CRITICAL] MCP001 .mcp.json                filesystem MCP has full-root access
  [HIGH    ] SH005  scripts/deploy.sh:19     eval with variable content

  14 critical · 9 high · 6 medium · 4 low
```

---

## Install

```bash
# Python CLI — audit, doctor, scan, fix, report
pip install yamtam-engine

# Claude Code plugin — hooks, agents, commands → .claude/
npm install yamtam-engine && npx yamtam-install

# Rust runtime — ~29× faster, single binary
cargo install yamtam-rt
```

> `curl | bash` is intentionally not the primary install.  
> YAMTAM flags that pattern as a risk — we practice what we scan for.

---

## 6-Layer Gate System

Every tool call passes through this pipeline before executing:

```
L0  Audit         Every call logged to Merkle hash-chain
L1  Scope         Warn on secret/env access, cross-scope writes
L1.5 Validate     Block SSRF, path traversal, sensitive file reads
L2  Commit        Advisory warning on cross-scope commits
L3  Truth Gate    Block unsupported claims ("tests passed" → prove it)
L3.5 Inject       Block identity override, jailbreaks, prompt injection
L4  Deploy        Block gh / kubectl / docker / gcloud / fly
L4.5 Supply       Block pipe-to-shell, typosquatting, git-URL packages
L5  Destructive   Block rm -rf, DROP TABLE, DELETE without WHERE
```

**Emergency bypass:** `YAMTAM_DEPLOY_APPROVED=1` · `YAMTAM_SCOPE_OK=1` · `YAMTAM_TRUTH_GATE_BYPASS=1`

---

## Rust Runtime — 29× faster

```bash
yamtam-rt scan .       # 4ms  vs  117ms Python
yamtam-rt doctor .     # 4ms  vs  228ms Python
```

Agent bus, L3 shared memory, task tracking — all in one binary:

```bash
yamtam-rt bus emit planner executor task.assign '{"task":"review PR"}'
yamtam-rt memory store "arch.decision" "Use JSONL for bus" --tag arch
yamtam-rt task create "Fix auth bug" --scope "src/auth/"
```

---

## What's Included

| Asset | Count |
|---|---|
| Runtime hooks | 45 |
| Slash commands | 164 |
| Agents | 93 |
| Workflow skills | 2,211 |
| Operating rules | 61 |
| Utility scripts | 92 |
| Verification checks | 826 |

### Agents (93) — domain specialists

`fullstack-engineer` · `api-designer` · `security-engineer` · `devops-engineer` · `sre` · `cloud-architect` · `ml-engineer` · `llm-architect` · `data-engineer` · `business-analyst` · `penetration-tester` · `compliance-auditor` · [+81 more](core/agents/)

### Bundled Tools

| Tool | What it does |
|---|---|
| [`codexmate`](tools/codexmate) | Unified dashboard for Codex, Claude Code & OpenClaw — skills marketplace, MCP bridge |
| [`moss-tts-nano`](tools/moss-tts-nano) | 0.1B multilingual TTS, CPU-friendly, realtime streaming |
| [`codexmate-vi-patch`](tools/codexmate-vi-patch) | Vietnamese UI for Codexmate — 992 translated strings |

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  YAMTAM ENGINE                   │
│                                                  │
│  LAYER 3 — AGENT OS                              │
│  93 agents · 2,211 skills · 164 commands         │
│  core/agents/  core/skills/  core/commands/      │
│                                                  │
│  LAYER 2 — RUNTIME GATE (L0–L5)                  │
│  tool-proxy.sh · safe-run.sh · sandbox-exec.sh   │
│  core/gates/ · core/rules/ (61 rules)            │
│                                                  │
│  LAYER 1 — SCANNER (static, zero dependencies)   │
│  scanner/*.yml → audit_scanner.py → report       │
│  Output: score/100 · SARIF · JSON · HTML · MD    │
└──────────────────────────────────────────────────┘
```

---

## Cross-Engine Support

| Engine | Enforcement |
|---|---|
| **Claude Code** | Runtime blocking via hooks (L0–L5) |
| **Cursor** | Hard enforcement via safe-run.sh proxy |
| **Aider** | Hard enforcement via shell proxy |
| **GitHub Copilot** | Advisory via prompt layer |
| **Continue.dev** | Advisory via system prompt |
| **Gemini Code Assist** | Advisory via system prompt |

```bash
bash core/scripts/switch-engine.sh <engine>
```

---

## Verification

826 checks run before every release:

```bash
bash core/tests/hooks/run-hook-tests.sh           # 88 hook tests
bash core/tests/skills/test-skill-triggering.sh   # 678 skill trigger tests
```

---

## Try the demo repo

`examples/unsafe-agent-repo/` — intentionally misconfigured, 34 findings, score 0/100:

```bash
yamtam audit examples/unsafe-agent-repo
```

---

<p align="center">
  <a href="https://phamlongh230-lgtm.github.io/yamtam-engine/">Website</a> ·
  <a href="https://github.com/phamlongh230-lgtm/yamtam-engine/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/phamlongh230-lgtm/yamtam-engine/issues">Issues</a>
</p>

---

## Contact

**Vũ Văn Tâm** — Builder · Developer · 17 · Vietnam

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Phone | 010-6315-8995 |
| Facebook | [facebook.com/share/1DfsLZo8hG](https://www.facebook.com/share/1DfsLZo8hG/) |
| TikTok | [@.yana018](https://www.tiktok.com/@.yana018) |
