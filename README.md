<p align="center">
  <img src="./docs/logo-chatgpt.png" alt="YAMTAM" width="160" />
</p>

<h1 align="center">YAMTAM ENGINE</h1>

<p align="center">
  <strong>The orchestration layer between humans and AI — routing, safety, and context for every domain.</strong>
</p>

<p align="center">
  <em>Built by Vũ Văn Tâm · 17 · Vietnam · 1,129,782 lines</em>
</p>

<p align="center">
  <a href="https://github.com/phamlongh230-lgtm/yamtam-engine/actions/workflows/ci.yml">
    <img src="https://github.com/phamlongh230-lgtm/yamtam-engine/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <img src="https://img.shields.io/badge/version-v0.41.0-orange?style=for-the-badge" />
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
  <a href="https://github.com/phamlongh230-lgtm/yamtam-engine">
    <img src="https://img.shields.io/badge/protected%20by-YAMTAM%20ENGINE-ff6b35?style=for-the-badge" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/🧩_skills-3,516-2f7e6e?style=flat-square" />
  <img src="https://img.shields.io/badge/🤖_agents-97-7d6aa8?style=flat-square" />
  <img src="https://img.shields.io/badge/📜_rules-63-b96b80?style=flat-square" />
  <img src="https://img.shields.io/badge/🪝_hooks-46-b78f3d?style=flat-square" />
  <img src="https://img.shields.io/badge/⚡_commands-164-3a7ca5?style=flat-square" />
  <img src="https://img.shields.io/badge/🔒_gates-9_layers-ce422b?style=flat-square" />
  <img src="https://img.shields.io/badge/🇻🇳_made_in-Vietnam-da251d?style=flat-square" />
</p>

---

**YAMTAM ENGINE** is a personal agent operating system for AI coding tools — runtime safety hooks, memory tiers, 97 specialist agents, 3,516 skills, and a Rust runtime that intercepts dangerous AI actions before they execute.

Works with **Claude Code**, **Cursor**, **OpenCode**, **Zed**, **Gemini**, **GitHub Copilot**, **Aider**, and more.

> **New in v0.41.0:** [Yana task router](#yana-task-router) — auto-classifies every task into simple/complex/external/**learn**/**daily** and dispatches agents. [Yana AI](#yana-ai) now runs on **100% real data** — encrypted key vault (AES-256-GCM), live provider stats, real L1 memory and audit-log dashboard. [Mission dispatcher](#mission-dispatcher) — wave-based parallel agent orchestration, built in Rust. **Core-lock** — SHA-256 integrity manifest pinning 216 core files against tampering (rule 67).

**→ [Full documentation & demo](https://phamlongh230-lgtm.github.io/yamtam-engine/)**

→ [VISION.md](VISION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [ROADMAP.md](ROADMAP.md)

---
What are the 97 agents?

The 97 agents are not 97 AI models running at the same time.

They are predefined specialist roles (security, frontend, backend, testing, learning, daily assistant, etc.) used for routing and task organization.

In normal usage, only the agent required for the current task is activated.
Most requests use a single model and a single agent route.

---

## YAMTAM at a Glance

```
┌──────────────────────────────────────────────────────────────────┐
│                     YAMTAM ENGINE v0.41.0                        │
│      "The orchestration layer between humans and AI —            │
│        routing, safety, and context for every domain."           │
│                                                                  │
│        Built by Vũ Văn Tâm · 17 · Vietnam · 1.1M+ lines          │
└──────────────────────────────────────────────────────────────────┘
```

```mermaid
graph TB
    %% ── Mission ──────────────────────────────────────────────────────────
    subgraph MISSION["🎯 Mission — AI coding agent safety layer"]
        direction LR
        AGENT["Agent wants\nto run a command"]
        GATE["9-layer gate\nintercepts every call"]
        OUT["Execute ✅\nor BLOCK + log 🚫"]
        AGENT --> GATE --> OUT
    end

    %% ── Gate layers ──────────────────────────────────────────────────────
    subgraph GATES["🔒 9-Layer Gate System (L1 → L9)"]
        direction LR
        G1["L1\nAnti-evasion\nbase64, pipe-to-shell"]
        G2["L2\nShell sanitize\nquoting, metacharacters"]
        G3["L3\nEgress / SSRF\nprivate IPs blocked"]
        G4["L4\nSupply chain\ntyposquatting, CVEs"]
        G5["L5\nBlast radius\ndestructive scope cap"]
        G6["L6\nPermission tier\nagent authority check"]
        G7["L7\nCode signing\nECDSA-P256"]
        G8["L8\nMerkle audit\nhash-chain, tamper-proof"]
        G9["L9\nSovereign overlord\nhuman veto / freeze swarm"]
        G1 --> G2 --> G3 --> G4 --> G5 --> G6 --> G7 --> G8 --> G9
    end

    %% ── Core engine ──────────────────────────────────────────────────────
    subgraph CORE["⚙️ Core Engine"]
        direction TB
        SKILLS["📚 3,516 skills\nSKILL.md workflow defs\n(frontend, backend, AI, K8s, sec...)"]
        AGENTS["🤖 97 specialist agents\n(planner, security-auditor,\nhoc-tap, daily-assistant...)"]
        RULES["📜 63 enforced rules\n(security, git, UI, TypeScript,\nAPI security, core-lock...)"]
        HOOKS["🪝 46 hooks\nPreToolUse · PostToolUse · Stop\n(guard-destructive, truth-gate...)"]
        CMDS["⚡ 164 slash commands\n/audit · /scan · /route\n/tdd-cycle · /simplify..."]
        BUS["🚌 Agent message bus\nJSON + ECDSA sig\nreplay-protected, BFT consensus"]
        MEM["🧠 Memory tiers\nL1 permanent · L2 session\nMerkle-chained, AES-256-GCM"]
    end

    %% ── Rust runtime ─────────────────────────────────────────────────────
    subgraph RT["⚡ Rust Runtime — yamtam-rt"]
        direction LR
        SCAN["scan · hunt · fix\nVulnerabilities, OWASP,\nsupply chain — 1256× faster"]
        ROUTE["route · mission\nTask classifier → simple/\ncomplex/external dispatch"]
        VAULT["graph · vault · doctor\nKnowledge graph,\nskill search, health check"]
    end

    %% ── Tools ────────────────────────────────────────────────────────────
    subgraph TOOLS["🛠️ Tools — sub-projects"]
        direction LR
        YANA["yana-ai ✅\nZero-dep Node.js web UI\nAnthropic · Groq · Gemini · OpenAI\nSkill routing · SSE streaming"]
        CODEXMATE["codexmate\nOpenAI Codex integration\nVietnamese patch"]
        MOSS["moss-tts-nano\nTTS engine"]
        FINETUNE["finetune-vi\nVietnamese LLM fine-tuning"]
    end

    %% ── Harness adapters ─────────────────────────────────────────────────
    subgraph HARNESS["🔌 Harness Adapters (12)"]
        direction LR
        H1["Claude Code\nCursor · Zed"]
        H2["Gemini · Copilot\nAider · OpenCode"]
        H3["Cloudflare Workers\nGitHub Actions"]
    end

    %% ── Active branches ──────────────────────────────────────────────────
    subgraph BRANCHES["🌿 Active Branches"]
        direction LR
        BMAIN["main ✅\nv0.41.0 — stable"]
        BVDEV["v1.8.0-dev\nnext release (in progress)"]
        BCF["cloudflare/workers-autoconfig\nWorkers zero-config setup"]
        BCX["codex/fix-hello-bug-in-bn\nCodex compatibility"]
    end

    %% ── Product funnel ───────────────────────────────────────────────────
    subgraph FUNNEL["📣 Product Funnel — 'Scan first. Guard later.'"]
        direction LR
        F1["① yamtam audit .\n30s · no learning needed\nScan any repo for AI agent risks"]
        F2["② Policy Kit\nAdopt safe configs piece by piece\n(CLAUDE.md · .mcp.json · CI gates)"]
        F3["③ Full Control Layer\nAll 9 gates · 97 agents\nMerkle log · Sovereign veto"]
        F1 --> F2 --> F3
    end

    %% ── Connections ──────────────────────────────────────────────────────
    MISSION --> GATES
    GATES --> CORE
    CORE --> RT
    CORE --> TOOLS
    CORE --> HARNESS
```

> **Reading the diagram:** every AI tool call flows `MISSION → GATES → CORE`. The Rust runtime (`yamtam-rt`) accelerates the scanner. Sub-project tools (yana-web etc.) use the same gate system. Branches show active development fronts.

---

## The problem

AI coding agents make mistakes. They `rm -rf` the wrong directory. They push force to main. They hallucinate test results. They commit secrets. By the time you notice, the damage is done.

YAMTAM sits between the agent and your system — every tool call passes through a 9-layer safety gate before execution.

---

## How it works

```
Agent wants to run a command
         ↓
[L1] Anti-evasion scan       — blocks base64 decode+exec, pipe-to-shell
[L2] Shell sanitization      — quotes all variables, strips metacharacters
[L3] Egress check            — blocks SSRF, private IP ranges, metadata endpoints
[L4] Supply chain gate       — vets every package install (typosquatting, CVEs)
[L5] Blast radius check      — caps destructive scope
[L6] Permission tier check   — verifies agent authority level
[L7] Signature verification  — ECDSA-P256 on generated code
[L8] Merkle audit log        — append-only, tamper-detected hash chain
[L9] Sovereign overlord gate — human veto, freeze swarm, full rollback
         ↓
Execute (or block + log)
```

---

## Numbers

| | |
|---|---|
| 🧩 Skills | **3,516** workflow skill definitions |
| 🤖 Agents | **97** specialist agents |
| 📜 Safety rules | **63** enforced rules |
| 🪝 Hooks | **46** pre/post-execution hooks |
| ⚡ Slash commands | **164** |
| 🔌 Harness adapters | **12** (Claude Code, Cursor, OpenCode, Zed, Gemini, Copilot, Aider...) |
| 🦀 Rust subcommands | **19** (`scan`, `graph`, `vault`, `route`, `mission`, `hunt`, `fix`, `doctor`...) |
| ✅ Rule checks in CI | **826** |
| 📦 Total codebase | **1,129,782 lines · 5,439 files** |

---

## Quick Install

```bash
# Claude Code plugin (hooks wire automatically)
npm install yamtam-engine && npx yamtam-install

# Python CLI
pip install yamtam-engine

# Rust runtime (1256x faster scanner)
cargo install yamtam-rt
```

```bash
# Verify everything is wired
yamtam doctor .
```

---

## Multi-harness support

YAMTAM adapts to whichever tool you use:

```bash
bash core/scripts/switch-engine.sh cursor    # .cursorrules + 7 .cursor/rules/*.mdc
bash core/scripts/switch-engine.sh opencode  # OPENCODE.md
bash core/scripts/switch-engine.sh zed       # .zed/settings.json
bash core/scripts/switch-engine.sh gemini    # GEMINI.md
bash core/scripts/switch-engine.sh copilot   # .github/copilot-instructions.md
bash core/scripts/switch-engine.sh status    # check all 12 adapters
```

---

## GitHub Action

Scan any repo's AI agent configuration on every PR — secrets, permissions, hook injection, MCP vulnerabilities.

```yaml
# .github/workflows/yamtam-scan.yml
- uses: phamlongh230-lgtm/yamtam-engine/.github/actions/scan@main
  with:
    fail-on: 'high'       # fail CI on HIGH or CRITICAL findings
    diff-only: 'true'     # scan only changed files on PRs
    comment-on-pr: 'true' # post findings summary as PR comment
```

Posts a comment on every PR:

```
🟠 YAMTAM Security Scan — HIGH

| Metric  | Value  |
|---------|--------|
| Risk    | HIGH   |
| Score   | 58/100 |
| Findings| 3      |
```

→ [Full workflow template](docs/install/github-action.yml)

---

## Rust runtime — `yamtam-rt`

19 subcommands. Zero Python dependency.

```bash
yamtam scan .                        # security scan — secrets, CVEs, supply chain risks
yamtam graph .                       # knowledge graph — file deps, import resolution
yamtam vault search Q                # search 3,516 skills by keyword
yamtam hunt .                        # hunt for security patterns (OWASP, injection, SSRF)
yamtam fix .                         # auto-fix rule violations
yamtam doctor .                      # full system health check
yamtam map .                         # blast radius map — what can the agent touch?
yamtam ci                            # run all gate checks (used in CI)
yamtam route classify "fix auth bug" # classify task → simple/complex/external
yamtam mission create "add-auth"     # create parallel agent mission
```

**Benchmark:** `yamtam scan` on a 10k-file repo: **1256x faster** than the Python equivalent.

---

## Safety architecture

```
core/
├── hooks/          # 46 PreToolUse / PostToolUse / Stop hooks
├── rules/          # 63 enforced rules (security, correctness, UI, git)
├── scripts/        # safe-run.sh, verify-core-lock.sh, secure-logger.sh
├── gates/          # truth_gate.md, action_gate.md
├── agents/         # 95 specialist agent definitions
├── skills/         # 3,516 SKILL.md files
├── config/
│   ├── core-lock.json    # SHA-256 manifest — 216 core files pinned
│   └── skills-lock.json  # skill content hashes
└── memory/
    ├── L1_atomic/  # permanent facts — persist across sessions
    └── L2_session/ # session state — auto-expires
```

Key properties:
- **Merkle audit chain** — every action logged, tamper-detected
- **Core-lock integrity** — SHA-256 manifest detects drift, deletion, and rule injection in core/
- **BFT consensus** — 3-of-N vote required for core infrastructure writes
- **Sovereign overlord** — human can freeze all 97 agents instantly
- **Honeypot layer** — decoy files/env vars catch compromised agents

---

## What it looks like in practice

```bash
# Agent tries: git push --force origin main
[yamtam/02-terminal-validator] BLOCKED — force push prohibited
  Command : git push --force origin main
  Gate    : L1
  Fix     : Run gate checks first, then push without --force

# Agent tries: curl http://169.254.169.254/latest/meta-data/
[yamtam/network-egress] BLOCKED — SSRF target detected
  Host    : 169.254.169.254
  Gate    : L3
  Exit    : 3

# Agent tries to install unvetted package
[yamtam/dependency-vetting] BLOCKED — unvetted package install
  Package : req-uests@2.28.0
  Reason  : typosquatting (similar to 'requests')
  Gate    : L4
```

---

## Yana AI

**[Live →](https://yamtam-engine-production.up.railway.app)**

Yana is the first interface built on YAMTAM core — a web UI that lets anyone chat with AI, switch providers, and use skill routing without knowing anything about the infrastructure underneath.

```
User → Yana AI → YAMTAM Core (Router · Safety · Context) → Model
```

- Zero signup — bring your own API key
- 🔐 **Encrypted key vault** — keys stored AES-256-GCM, master key non-extractable (WebCrypto + IndexedDB), never plaintext
- Multi-provider: Anthropic · Groq (Llama4 · Qwen3 · Gemma2) · Gemini 2.5 · OpenAI · DeepSeek · OpenRouter
- 📊 **100% real data** — live provider stats, L1 memory garden, audit-log health panel; zero demo numbers
- Skill routing built in — type naturally, YAMTAM dispatches the right agent
- **Non-coding use cases:** học tập (Socratic learning assistant), công việc hàng ngày (summarize / plan / draft)
- SSE streaming, mobile-friendly · Electron desktop shell (`tools/yana-desktop`)

If YAMTAM is the power grid, Yana is the first building plugged into it.

---

## Built by one person

One person. No team. No funding.

- Hook architecture, safety gates, Python CLI
- Rust runtime (`yamtam-rt`), 97 agents, 3,516 skills, multi-harness support
- 12 harness adapters (Claude Code, Cursor, Zed, Gemini, Copilot, Aider…)

The 3,516 skills cover: frontend, backend, AI/LLM, security, Kubernetes, WebAssembly, DevOps, databases, testing, and more. Two new agent personas cover non-coding use cases: learning (`hoc-tap`) and daily productivity (`daily-assistant`).

---

## Add YAMTAM to your repo

**Static badge** — paste into your README:

```markdown
[![Protected by YAMTAM](https://img.shields.io/badge/protected%20by-YAMTAM%20ENGINE-ff6b35?style=for-the-badge)](https://github.com/phamlongh230-lgtm/yamtam-engine)
```

**Dynamic audit badge** — shows live security score:

```bash
yamtam badge .           # prints badge markdown with current score
yamtam badge . --json    # machine-readable output
```

**GitHub Action** — scan every PR automatically:

```yaml
- uses: phamlongh230-lgtm/yamtam-engine/.github/actions/scan@main
  with:
    fail-on: 'high'
```

→ [Full workflow template](docs/install/github-action.yml)

---

## Yana task router

Every task is classified before execution — no more guessing whether to handle it inline or dispatch an agent.

```bash
yamtam route classify "implement JWT refresh token"
# → { "route": "complex", "gate": "harness", "confidence": 0.36,
#     "suggested_agents": ["security-engineer", "backend-developer"] }

yamtam route classify "xem git log 10 commit"
# → { "route": "simple", "gate": "auto", "confidence": 0.43 }

yamtam route classify "deploy to production"
# → { "route": "external", "gate": "confirm", "confidence": 0.30 }
```

Five routes:
- **simple** → Yana handles directly (read-only, no agents needed)
- **skill** → matched against 3,516-entry index, dispatches exact skill agent
- **learn** → routes to `hoc-tap` — Socratic learning assistant (học, giải thích, tại sao...)
- **daily** → routes to `daily-assistant` — summarize / plan / draft (tóm tắt, viết email, lên kế hoạch...)
- **complex** → dispatch specialist agent(s) with scoped brief
- **external** → stop, confirm with human before proceeding

Domain-aware agent selection: auth tasks → `security-engineer`, database → `database-expert`, UI → `frontend-developer + ui-ux-designer`.

---

## Mission dispatcher

Wave-based parallel orchestration with dependency resolution — built in Rust, zero Python.

```bash
# 1. Create mission
MID=$(yamtam mission create "implement-auth" | awk '/id:/{print $2}')

# 2. Declare tasks with dependencies
yamtam mission task $MID "design-schema"   --agent database-expert --produces schema.sql
yamtam mission task $MID "implement-auth"  --agent backend-developer \
  --consumes schema.sql --produces src/auth.ts
yamtam mission task $MID "write-tests"     --agent test-engineer \
  --consumes src/auth.ts --produces tests/auth.test.ts

# 3. Dispatch wave 1 — only tasks whose dependencies are satisfied
yamtam mission dispatch $MID --max-parallel 3
# → JSON briefs for each ready agent

# 4. Mark complete, dispatch next wave
yamtam mission done $MID "design-schema" --evidence schema.sql
yamtam mission dispatch $MID  # → wave 2 unlocked

# Cancel / retry stuck tasks
yamtam mission cancel $MID "implement-auth"
yamtam mission retry  $MID "write-tests"
```

Tasks marked **Running** on dispatch — re-running `dispatch` never double-dispatches the same task.

---

## Multi-agent launcher

Bật nhiều agents song song có kiểm soát — không bị vượt ngưỡng, có kill switch:

```bash
# Bật 3 agents cùng lúc, tối đa 3 chạy song song
bash core/scripts/multi-agent-launch.sh start \
  --agents "scanner,auditor,qa-team" \
  --concurrency 3

# Xem trạng thái real-time
bash core/scripts/multi-agent-launch.sh status

# Dừng một agent cụ thể
bash core/scripts/multi-agent-launch.sh kill scanner

# Kill switch — dừng tất cả ngay lập tức
bash core/scripts/multi-agent-launch.sh kill all

# Xem log của agent
bash core/scripts/multi-agent-launch.sh log auditor
```

Hoặc dùng file danh sách task:
```bash
# tasks.txt — mỗi dòng: agent_name:mô tả task
echo "scanner:quét toàn bộ repo
auditor:kiểm tra hooks
qa-team:chạy test suite" > tasks.txt

bash core/scripts/multi-agent-launch.sh start --tasks-file tasks.txt --concurrency 4
```

Output mẫu:
```
═══ YAMTAM Multi-Agent Launcher ═══
  Agents     : 3
  Concurrency: 3 (tối đa chạy song song)
  Kill switch: bash multi-agent-launch.sh kill all

[LAUNCH] scanner → quét toàn bộ repo    PID 12341
[LAUNCH] auditor → kiểm tra hooks       PID 12342
[LAUNCH] qa-team → chạy test suite      PID 12343

[OK] Đã launch 3/3 agents
```

---

## License

Apache 2.0 — free forever.

---

## Contact

**Vũ Văn Tâm** · Vietnam · 17

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [phamlongh230-lgtm.github.io/yamtam-engine](https://phamlongh230-lgtm.github.io/yamtam-engine/) |
| GitHub | [phamlongh230-lgtm](https://github.com/phamlongh230-lgtm) |
| Yana AI | [yamtam-engine-production.up.railway.app](https://yamtam-engine-production.up.railway.app) |

---

viet nam 

---

<p align="center">
<img src="./docs/logo-chatgpt.png" alt="YAMTAM" width="160" />
</p>

<h1 align="center">YAMTAM ENGINE</h1>

<p align="center">
<strong>Lớp điều phối giữa con người và AI — định tuyến, bảo mật và ngữ cảnh cho mọi lĩnh vực.</strong>
</p>

<p align="center">
<em>Phát triển bởi Vũ Văn Tâm · 17 tuổi · Việt Nam · 1,129,782 dòng mã</em>
</p>

<p align="center">
<a href="https://github.com/phamlongh230-lgtm/yamtam-engine/actions/workflows/ci.yml">
<img src="https://github.com/phamlongh230-lgtm/yamtam-engine/actions/workflows/ci.yml/badge.svg" alt="CI" />
</a>
<img src="https://img.shields.io/badge/version-v0.41.0-orange?style=for-the-badge" />
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
<a href="https://github.com/phamlongh230-lgtm/yamtam-engine">
<img src="https://img.shields.io/badge/protected%20by-YAMTAM%20ENGINE-ff6b35?style=for-the-badge" />
</a>
</p>

<p align="center">
<img src="https://img.shields.io/badge/🧩_skills-3,516-2f7e6e?style=flat-square" />
<img src="https://img.shields.io/badge/🤖_agents-97-7d6aa8?style=flat-square" />
<img src="https://img.shields.io/badge/📜_rules-63-b96b80?style=flat-square" />
<img src="https://img.shields.io/badge/🪝_hooks-46-b78f3d?style=flat-square" />
<img src="https://img.shields.io/badge/⚡_commands-164-3a7ca5?style=flat-square" />
<img src="https://img.shields.io/badge/🔒_gates-9_layers-ce422b?style=flat-square" />
<img src="https://img.shields.io/badge/🇻🇳_made_in-Vietnam-da251d?style=flat-square" />
</p>

YAMTAM ENGINE là một hệ điều hành agent cá nhân dành cho các công cụ lập trình AI — bao gồm các hook bảo mật trong thời gian chạy (runtime), các tầng bộ nhớ, 97 agent chuyên trách, 3,516 kỹ năng và một môi trường chạy bằng Rust giúp ngăn chặn các hành động nguy hiểm của AI trước khi chúng được thực thi.

Hoạt động với Claude Code, Cursor, OpenCode, Zed, Gemini, GitHub Copilot, Aider, và nhiều công cụ khác.

Điểm mới trong bản v0.41.0: Yana task router — tự động phân loại mọi tác vụ thành đơn giản/phức tạp/bên ngoài/học tập/hàng ngày và điều phối các agent. Yana AI hiện chạy trên 100% dữ liệu thực — kho lưu trữ khóa được mã hóa (AES-256-GCM), số liệu thống kê trực tiếp từ nhà cung cấp, bộ nhớ L1 thực và bảng điều khiển lịch sử kiểm tra (audit-log). Mission dispatcher — hệ thống điều phối agent song song theo mô hình làn sóng (wave-based), được xây dựng bằng Rust. Core-lock — cơ chế ghim tính toàn vẹn SHA-256 bảo vệ 216 tệp cốt lõi khỏi bị can thiệp trái phép (quy tắc 67).

→ Tài liệu hướng dẫn đầy đủ & bản thử nghiệm

→ VISION.md · ARCHITECTURE.md · ROADMAP.md

97 agent này là gì?

97 agent không phải là 97 mô hình AI chạy cùng một lúc.

Chúng là các vai trò chuyên gia được định nghĩa trước (bảo mật, frontend, backend, kiểm thử, học tập, trợ lý hàng ngày, v.v.) được sử dụng để định tuyến và tổ chức công việc.

Trong quá trình sử dụng bình thường, chỉ có agent cần thiết cho tác vụ hiện tại mới được kích hoạt.
Hầu hết các yêu cầu chỉ sử dụng một mô hình duy nhất và một tuyến agent duy nhất.

---
Tổng quan về YAMTAM

---

graph TB
    %% ── Mission ──────────────────────────────────────────────────────────
    subgraph MISSION["🎯 Mission — AI coding agent safety layer"]
        direction LR
        AGENTS["Agent muốn\nchạy một lệnh"]
        GATE["Cổng bảo mật 9 lớp\nchặn mọi lượt gọi"]
        OUT["Thực thi ✅\nhoặc CHẶN + ghi log 🚫"]
        AGENTS --> GATE --> OUT
    end

    %% ── Gate layers ──────────────────────────────────────────────────────
    subgraph GATES["🔒 9-Layer Gate System (L1 → L9)"]
        direction LR
        G1["L1\nChống lẩn tránh\nbase64, pipe-to-shell"]
        G2["L2\nLàm sạch shell\nquotes, ký tự đặc biệt"]
        G3["L3\nEgress / SSRF\nchặn IP riêng tư"]
        G4["L4\nChuỗi cung ứng\ntyposquatting, lỗ hổng CVE"]
        G5["L5\nBán kính ảnh hưởng\ngiới hạn phạm vi hủy hoại"]
        G6["L6\nTầng phân quyền\nkiểm tra quyền của agent"]
        G7["L7\nKý số mã nguồn\nECDSA-P256"]
        G8["L8\nKiểm toán Merkle\nchuỗi băm, chống giả mạo"]
        G9["L9\nQuyền tối cao\ncon người phủ quyết / đóng băng"]
        G1 --> G2 --> G3 --> G4 --> G5 --> G6 --> G7 --> G8 --> G9
    end

    %% ── Core engine ──────────────────────────────────────────────────────
    subgraph CORE["⚙️ Core Engine"]
        direction TB
        SKILLS["📚 3,516 kỹ năng\nĐịnh nghĩa luồng trong SKILL.md\n(frontend, backend, AI, K8s, bảo mật...)"]
        AGENTS["🤖 97 agent chuyên trách\n(planner, security-auditor,\nhoc-tap, daily-assistant...)"]
        RULES["📜 63 quy tắc bắt buộc\n(bảo mật, git, UI, TypeScript,\nbảo mật API, core-lock...)"]
        HOOKS["🪝 46 hook\nPreToolUse · PostToolUse · Stop\n(guard-destructive, truth-gate...)"]
        CMDS["⚡ 164 lệnh slash\n/audit · /scan · /route\n/tdd-cycle · /simplify..."]
        BUS["🚌 Trục tin nhắn Agent\nJSON + chữ ký ECDSA\nchống gửi lại, đồng thuận BFT"]
        MEM["🧠 Các tầng bộ nhớ\nL1 vĩnh viễn · L2 phiên làm việc\nChuỗi Merkle, AES-256-GCM"]
    end

    %% ── Rust runtime ─────────────────────────────────────────────────────
    subgraph RT["⚡ Rust Runtime — yamtam-rt"]
        direction LR
        SCAN["scan · hunt · fix\nLỗ hổng, OWASP,\nchuỗi cung ứng — nhanh hơn 1256×"]
        ROUTE["route · mission\nPhân loại tác vụ → điều phối\nđơn giản/phức tạp/bên ngoài"]
        VAULT["graph · vault · doctor\nĐồ thị tri thức,\ntìm kiếm kỹ năng, kiểm tra sức khỏe"]
    end

    %% ── Tools ────────────────────────────────────────────────────────────
    subgraph TOOLS["🛠️ Tools — sub-projects"]
        direction LR
        YANA["yana-ai ✅\nGiao diện web Node.js không phụ thuộc\nAnthropic · Groq · Gemini · OpenAI\nĐịnh tuyến kỹ năng · SSE streaming"]
        CODEXMATE["codexmate\nTích hợp OpenAI Codex\nBản vá tiếng Việt"]
        MOSS["moss-tts-nano\nCông cụ chuyển văn bản thành giọng nói"]
        FINETUNE["finetune-vi\nTinh chỉnh LLM tiếng Việt"]
    end

    %% ── Harness adapters ─────────────────────────────────────────────────
    subgraph HARNESS["🔌 Harness Adapters (12)"]
        direction LR
        H1["Claude Code\nCursor · Zed"]
        H2["Gemini · Copilot\nAider · OpenCode"]
        H3["Cloudflare Workers\nGitHub Actions"]
    end

    %% ── Active branches ──────────────────────────────────────────────────
    subgraph BRANCHES["🌿 Active Branches"]
        direction LR
        BMAIN["main ✅\nv0.41.0 — ổn định"]
        BVDEV["v1.8.0-dev\nphiên bản tiếp theo (đang phát triển)"]
        BCF["cloudflare/workers-autoconfig\nTự động cấu hình Workers không thiết lập"]
        BCX["codex/fix-hello-bug-in-bn\nTương thích Codex"]
    end

    %% ── Product funnel ───────────────────────────────────────────────────
    subgraph FUNNEL["📣 Product Funnel — 'Scan first. Guard later.'"]
        direction LR
        F1["① yamtam audit .\n30 giây · không cần học trước\nQuét rủi ro của agent AI trên mọi repo"]
        F2["② Bộ công cụ chính sách\nÁp dụng cấu hình an toàn từng phần\n(CLAUDE.md · .mcp.json · cổng CI)"]
        F3["③ Lớp kiểm soát toàn diện\nTất cả 9 cổng · 97 agent\nLog Merkle · Quyền phủ quyết tối cao"]
        F1 --> F2 --> F3
    end

    %% ── Connections ──────────────────────────────────────────────────────
    MISSION --> GATES
    GATES --> CORE
    CORE --> RT
    CORE --> TOOLS
    CORE --> HARNESS

    ---

Cách đọc sơ đồ: mọi lượt gọi công cụ của AI đều chảy theo hướng MISSION → GATES → CORE. Môi trường chạy Rust (yamtam-rt) giúp tăng tốc bộ quét. Các công cụ dự án phụ (yana-web, v.v.) sử dụng cùng một hệ thống cổng bảo mật. Các nhánh (branches) hiển thị các mặt trận đang được phát triển tích cực.

---
Vấn đề hiện tại

Các agent lập trình AI thường mắc sai lầm. Chúng có thể chạy lệnh rm -rf nhầm thư mục. Chúng đẩy mã nguồn bằng lệnh force push lên nhánh main. Chúng tạo ra các kết quả kiểm thử giả lập. Chúng vô tình để lộ các chuỗi bảo mật (secrets). Cho đến khi bạn nhận ra, thiệt hại đã xảy ra rồi.

YAMTAM nằm giữa agent và hệ thống của bạn — mọi lượt gọi công cụ đều phải đi qua một cổng an toàn 9 lớp trước khi thực thi.

---
Cơ chế hoạt động

Agent muốn chạy một lệnh
         ↓
[L1] Quét chống lẩn tránh    — chặn giải mã thực thi base64, chuyển hướng shell (pipe-to-shell)
[L2] Làm sạch mã Shell       — đặt các biến trong dấu nháy, loại bỏ ký tự đặc biệt
[L3] Kiểm tra đầu ra ngoại vi — chặn tấn công SSRF, dải IP riêng tư, các endpoint siêu dữ liệu
[L4] Cổng chuỗi cung ứng     — xác thực mọi gói cài đặt (lỗi chính tả cố ý, mã lỗ hổng CVE)
[L5] Kiểm tra bán kính phá hủy — giới hạn phạm vi tác động nguy hiểm
[L6] Kiểm tra tầng phân quyền — xác minh cấp độ thẩm quyền của agent
[L7] Xác thực chữ ký số      — áp dụng ECDSA-P256 trên mã nguồn được tạo ra
[L8] Nhật ký kiểm toán Merkle — chuỗi băm chỉ cho phép ghi thêm, phát hiện giả mạo
[L9] Cổng tối cao hệ thống    — con người phủ quyết, đóng băng toàn bộ hệ thống, hoàn tác toàn diện
         ↓
Thực thi (hoặc chặn + ghi nhật ký log)

---
Bảng thống kê số liệu
🧩 Kỹ năng	3,516 định nghĩa kỹ năng quy trình công việc
🤖 Agent	97 agent chuyên trách
📜 Quy tắc an toàn	63 quy tắc được thực thi
🪝 Hook	46 hook trước/sau thực thi
⚡ Lệnh Slash	164
🔌 Adapter tích hợp	12 (Claude Code, Cursor, OpenCode, Zed, Gemini, Copilot, Aider...)
🦀 Lệnh phụ Rust	19 (scan, graph, vault, route, mission, hunt, fix, doctor...)
✅ Kiểm tra quy tắc trong CI	826
📦 Tổng dung lượng mã nguồn	1,129,782 dòng · 5,439 tệp

---

Cài đặt nhanh
# Plugin dành cho Claude Code (các hook tự động kết nối)
npm install yamtam-engine && npx yamtam-install

# Python CLI
pip install yamtam-engine

# Môi trường chạy bằng Rust (bộ quét nhanh hơn 1256 lần)
cargo install yamtam-rt

# Xác minh mọi thứ đã được kết nối đúng cách
yamtam doctor .

---
Hỗ trợ đa nền tảng
YAMTAM tự động thích ứng với bất kỳ công cụ nào bạn đang sử dụng:
bash core/scripts/switch-engine.sh cursor    # .cursorrules + 7 .cursor/rules/*.mdc
bash core/scripts/switch-engine.sh opencode  # OPENCODE.md
bash core/scripts/switch-engine.sh zed        # .zed/settings.json
bash core/scripts/switch-engine.sh gemini    # GEMINI.md
bash core/scripts/switch-engine.sh copilot   # .github/copilot-instructions.md
bash core/scripts/switch-engine.sh status    # kiểm tra tất cả 12 bộ chuyển đổi

---

GitHub Action
Quét cấu hình agent AI của bất kỳ kho lưu trữ nào trên mỗi PR — kiểm tra mã bảo mật, quyền hạn, chèn hook độc hại, lỗ hổng MCP.
# .github/workflows/yamtam-scan.yml
- uses: phamlongh230-lgtm/yamtam-engine/.github/actions/scan@main
  with:
    fail-on: 'high'       # làm thất bại quy trình CI khi phát hiện rủi ro CAO hoặc NGUY HIỂM
    diff-only: 'true'     # chỉ quét các tệp đã thay đổi trên PR
    comment-on-pr: 'true' # đăng tóm tắt kết quả phát hiện dưới dạng bình luận trên PR
  Tự động gửi một bình luận trên mỗi PR:
  🟠 YAMTAM Security Scan — HIGH

| Tiêu chí | Giá trị |
|---------|--------|
| Rủi ro  | CAO    |
| Điểm số  | 58/100 |
| Phát hiện| 3      |

→ Mẫu quy trình làm việc đầy đủ
Môi trường chạy bằng Rust — yamtam-rt
19 lệnh phụ. Hoàn toàn không phụ thuộc vào Python.

yamtam scan .                         # quét bảo mật — phát hiện rò rỉ mã, CVE, rủi ro chuỗi cung ứng
yamtam graph .                        # đồ thị tri thức — sự phụ thuộc tệp, giải quyết import
yamtam vault search Q                 # tìm kiếm 3,516 kỹ năng theo từ khóa
yamtam hunt .                         # săn lùng các mẫu bảo mật (OWASP, chèn mã độc, SSRF)
yamtam fix .                          # tự động sửa đổi các vi phạm quy tắc
yamtam doctor .                       # kiểm tra toàn diện sức khỏe hệ thống
yamtam map .                          # bản đồ bán kính ảnh hưởng — agent có quyền chạm vào những gì?
yamtam ci                             # chạy tất cả các bước kiểm tra cổng (sử dụng trong CI)
yamtam route classify "fix auth bug" # phân loại tác vụ → đơn giản/phức tạp/bên ngoài
yamtam mission create "add-auth"     # tạo một nhiệm vụ agent chạy song song
Thử nghiệm hiệu năng: Lệnh yamtam scan trên một kho lưu trữ gồm 10k tệp: chạy nhanh hơn 1,256 lần so với phiên bản tương đương viết bằng Python.

---

Kiến trúc bảo mật

core/
├── hooks/          # 46 hook PreToolUse / PostToolUse / Stop
├── rules/          # 63 quy tắc bắt buộc thực thi (bảo mật, tính chính xác, UI, git)
├── scripts/        # safe-run.sh, verify-core-lock.sh, secure-logger.sh
├── gates/          # truth_gate.md, action_gate.md
├── agents/         # 95 định nghĩa vai trò agent chuyên trách
├── skills/         # 3,516 tệp SKILL.md
├── config/
│   ├── core-lock.json    # Bảng SHA-256 manifest — ghim cố định 216 tệp cốt lõi
│   └── skills-lock.json  # mã băm nội dung của kỹ năng
└── memory/
    ├── L1_atomic/  # dữ kiện vĩnh viễn — duy trì qua các phiên làm việc
    └── L2_session/ # trạng thái phiên làm việc — tự động hết hạn

Các thuộc tính chính:

Chuỗi kiểm toán Merkle — mọi hành động đều được ghi log và phát hiện can thiệp.

Tính toàn vẹn Core-lock — bảng kiểm tra SHA-256 phát hiện sự thay đổi, xóa tệp hoặc chèn quy tắc trái phép trong thư mục core/.

Đồng thuận BFT — yêu cầu bỏ phiếu tối thiểu tỷ lệ 3 trên N để ghi dữ liệu vào hạ tầng cốt lõi.

Quyền tối cao con người — người dùng có thể đóng băng lập tức tất cả 97 agent ngay lập tức.

Tầng bẫy mật (Honeypot) — các tệp nhử/biến môi trường giả nhằm phát hiện các agent đã bị chiếm quyền kiểm soát.

---
Trải nghiệm thực tế
# Khi Agent cố gắng chạy lệnh: git push --force origin main
[yamtam/02-terminal-validator] BLOCKED — nghiêm cấm hành vi force push
  Lệnh chạy : git push --force origin main
  Cổng chặn  : L1
  Cách xử lý: Chạy các bước kiểm tra cổng trước, sau đó push không có tùy chọn --force

# Khi Agent cố gắng chạy lệnh: curl http://169.254.169.254/latest/meta-data/
[yamtam/network-egress] BLOCKED — phát hiện mục tiêu tấn công SSRF
  Địa chỉ    : 169.254.169.254
  Cổng chặn  : L3
  Mã thoát   : 3

# Khi Agent cố gắng cài đặt một gói thư viện chưa được kiểm duyệt
[yamtam/dependency-vetting] BLOCKED — cài đặt gói chưa qua kiểm duyệt
  Gói gói    : req-uests@2.28.0
  Lý do      : lỗi chính tả cố ý (gần giống với gói 'requests')
  Cổng chặn  : L4

 ---

 Yana AI
 
  Trực tuyến →

Yana là giao diện đầu tiên được xây dựng trên nền tảng lõi YAMTAM — một giao diện web cho phép bất kỳ ai cũng có thể trò chuyện với AI, chuyển đổi nhà cung cấp mô hình và sử dụng tính năng định tuyến kỹ năng mà không cần có kiến thức sâu về hạ tầng bên dưới.

Người dùng → Yana AI → YAMTAM Core (Định tuyến · Bảo mật · Ngữ cảnh) → Mô hình AI
Không cần đăng ký — sử dụng trực tiếp mã khóa API của chính bạn

🔐 Kho khóa mã hóa — các khóa được lưu trữ bằng thuật toán AES-256-GCM, khóa chính không thể trích xuất (WebCrypto + IndexedDB), không bao giờ ở dạng văn bản thuần túy.

Đa nhà cung cấp: Anthropic · Groq (Llama4 · Qwen3 · Gemma2) · Gemini 2.5 · OpenAI · DeepSeek · OpenRouter

📊 100% dữ liệu thực — hiển thị trực tiếp số liệu thống kê của nhà cung cấp, phân khu bộ nhớ L1, bảng sức khỏe lịch sử kiểm toán; hoàn toàn không sử dụng số liệu giả lập để trình diễn.

Tích hợp sẵn tính năng định tuyến kỹ năng — chỉ cần nhập văn bản tự nhiên, YAMTAM sẽ tự động điều phối đúng agent phù hợp.

Ứng dụng ngoài việc lập trình: học tập (trợ lý học tập theo phương pháp Socratic), công việc hàng ngày (tóm tắt / lên kế hoạch / soạn thảo).

Luồng truyền dữ liệu SSE, giao diện thân thiện với thiết bị di động · Có phiên bản ứng dụng desktop bằng Electron (tools/yana-desktop).

Nếu ví YAMTAM như mạng lưới điện quốc gia, thì Yana chính là tòa nhà đầu tiên được kết nối vào dòng điện đó.

Phát triển bởi một cá nhân
Dự án được thực hiện bởi một người duy nhất. Không có đội ngũ. Không gọi vốn.

Xây dựng kiến trúc hook, các cổng an toàn, công cụ dòng lệnh Python CLI.

Môi trường chạy bằng Rust (yamtam-rt), thiết lập 97 agent, 3,516 kỹ năng, hỗ trợ tích hợp đa nền tảng.

Phát triển 12 bộ chuyển đổi adapter kết nối (Claude Code, Cursor, Zed, Gemini, Copilot, Aider…).

Hệ thống 3,516 kỹ năng bao gồm các mảng kiến thức: frontend, backend, AI/LLM, bảo mật máy tính, Kubernetes, WebAssembly, DevOps, cơ sở dữ liệu, kiểm thử phần mềm, v.v. Hai thực thể agent mới được bổ sung nhằm phục vụ các nhu cầu ngoài lập trình: học tập (hoc-tap) và năng suất làm việc hàng ngày (daily-assistant).

---

Thêm YAMTAM vào kho lưu trữ của bạn
Huy hiệu tĩnh — dán đoạn mã này vào tệp README của bạn:

[![Protected by YAMTAM](https://img.shields.io/badge/protected%20by-YAMTAM%20ENGINE-ff6b35?style=for-the-badge)](https://github.com/phamlongh230-lgtm/yamtam-engine)

---

Huy hiệu kiểm toán động — hiển thị điểm số bảo mật trực tiếp theo thời gian thực:

yamtam badge .           # in ra đoạn mã markdown hiển thị huy hiệu cùng điểm số hiện tại
yamtam badge . --json    # xuất kết quả định dạng cấu trúc cho máy đọc

GitHub Action — tự động quét mã nguồn trên mỗi PR:

- uses: phamlongh230-lgtm/yamtam-engine/.github/actions/scan@main
  with:
    fail-on: 'high'

→ Mẫu quy trình làm việc đầy đủ

---

Bộ định tuyến tác vụ Yana (Task router)
Mỗi tác vụ đều được phân loại rõ ràng trước khi chạy — không còn phải đoán xem nên xử lý trực tiếp tại chỗ hay cần điều động một agent chuyên biệt.

yamtam route classify "implement JWT refresh token"
# → { "route": "complex", "gate": "harness", "confidence": 0.36,
#     "suggested_agents": ["security-engineer", "backend-developer"] }

yamtam route classify "xem git log 10 commit"
# → { "route": "simple", "gate": "auto", "confidence": 0.43 }

yamtam route classify "deploy to production"
# → { "route": "external", "gate": "confirm", "confidence": 0.30 }

---

Hệ thống gồm năm tuyến định hướng chính:

simple (đơn giản) → Yana trực tiếp xử lý (chỉ đọc dữ liệu, không cần gọi agent).

skill (kỹ năng) → đối chiếu với danh mục 3,516 kỹ năng hiện có để chỉ định chính xác agent phụ trách.

learn (học tập) → chuyển hướng sang agent hoc-tap — trợ lý học tập theo phương pháp gợi mở Socratic (đóng vai trò giải thích, phân tích nguyên nhân lý do...).

daily (hàng ngày) → chuyển hướng sang agent daily-assistant — hỗ trợ các tác vụ văn phòng (tóm tắt văn bản, soạn email, lên lộ trình kế hoạch...).

complex (phức tạp) → điều phối một hoặc nhiều agent chuyên gia xử lý theo một bản tóm tắt phân quyền giới hạn.

external (bên ngoài) → tạm dừng thao tác, yêu cầu xác nhận trực tiếp từ con người trước khi tiếp tục thực hiện.

Lựa chọn agent thông minh theo đúng chuyên môn: Tác vụ xác thực mã nguồn → gọi security-engineer, liên quan cơ sở dữ liệu → gọi database-expert, thiết kế giao diện UI → phối hợp frontend-developer + ui-ux-designer.

Hệ thống điều phối nhiệm vụ (Mission dispatcher)
Hệ thống điều phối song song theo mô hình làn sóng (wave-based) đi kèm cơ chế giải quyết ràng buộc phụ thuộc — xây dựng hoàn toàn bằng ngôn ngữ Rust, hoàn toàn không phụ thuộc vào ngôn ngữ Python.

# 1. Khởi tạo một nhiệm vụ mới
MID=$(yamtam mission create "implement-auth" | awk '/id:/{print $2}')

# 2. Khai báo các đầu việc nhỏ cùng các điều kiện ràng buộc phụ thuộc kèm theo
yamtam mission task $MID "design-schema"   --agent database-expert --produces schema.sql
yamtam mission task $MID "implement-auth"  --agent backend-developer \
  --consumes schema.sql --produces src/auth.ts
yamtam mission task $MID "write-tests"     --agent test-engineer \
  --consumes src/auth.ts --produces tests/auth.test.ts

# 3. Kích hoạt làn sóng điều phối thứ 1 — chỉ chạy các công việc đã thỏa mãn đủ các điều kiện ràng buộc phụ thuộc trước đó
yamtam mission dispatch $MID --max-parallel 3
# → Xuất các tệp tóm tắt dữ liệu cấu trúc JSON gửi đến từng agent đã sẵn sàng nhận lệnh

# 4. Đánh dấu hoàn thành công việc, chuẩn bị kích hoạt làn sóng tiếp theo
yamtam mission done $MID "design-schema" --evidence schema.sql
yamtam mission dispatch $MID  # → Làn sóng thứ 2 chính thức được mở khóa và kích hoạt

# Lệnh hủy hoặc thực hiện thử lại các công việc đang bị tắc nghẽn hoặc dừng hoạt động
yamtam mission cancel $MID "implement-auth"
yamtam mission retry  $MID "write-tests"

Các công việc sẽ tự động chuyển sang trạng thái Running khi bắt đầu được điều phối — việc chạy lại lệnh dispatch sẽ không bao giờ xảy ra tình trạng điều phối trùng lặp cho cùng một công việc.

Trình khởi chạy đa agent (Multi-agent launcher)
Bật nhiều agent song song có kiểm soát — không bị vượt ngưỡng, có kèm cơ chế ngắt khẩn cấp (kill switch):
# Bật 3 agent cùng lúc, cấu hình tối đa 3 tiến trình chạy song song cùng thời điểm
bash core/scripts/multi-agent-launch.sh start \
  --agents "scanner,auditor,qa-team" \
  --concurrency 3

# Theo dõi hiển thị trạng thái hoạt động theo thời gian thực (real-time)
bash core/scripts/multi-agent-launch.sh status

# Dừng hoạt động của một tiến trình agent cụ thể được chỉ định
bash core/scripts/multi-agent-launch.sh kill scanner

# Cơ chế ngắt khẩn cấp — dừng toàn bộ tất cả tiến trình ngay lập tức
bash core/scripts/multi-agent-launch.sh kill all

# Xem nhật ký log hoạt động của một agent cụ thể
bash core/scripts/multi-agent-launch.sh log auditor

Hoặc bạn có thể sử dụng một tệp danh sách ghi sẵn các tác vụ:
# tệp tasks.txt — cấu trúc mỗi dòng: tên_agent:mô tả chi tiết tác vụ cần xử lý
echo "scanner:quét toàn bộ repo
auditor:kiểm tra hooks
qa-team:chạy test suite" > tasks.txt

bash core/scripts/multi-agent-launch.sh start --tasks-file tasks.txt --concurrency 4

Mẫu kết quả hiển thị đầu ra (output):
═══ YAMTAM Multi-Agent Launcher ═══
  Agents     : 3
  Concurrency: 3 (tối đa chạy song song)
  Kill switch: bash multi-agent-launch.sh kill all

[LAUNCH] scanner → quét toàn bộ repo        PID 12341
[LAUNCH] auditor → kiểm tra hooks        PID 12342
[LAUNCH] qa-team → chạy test suite      PID 12343

[OK] Đã launch 3/3 agents

---
Bản quyền mã nguồn (License)
Apache 2.0 — hoàn toàn miễn phí mãi mãi.

---
Bảng thông tin liên hệ
Vũ Văn Tâm · Việt Nam · 17 tuổi
| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [phamlongh230-lgtm.github.io/yamtam-engine](https://phamlongh230-lgtm.github.io/yamtam-engine/) |
| GitHub | [phamlongh230-lgtm](https://github.com/phamlongh230-lgtm) |
| Yana AI | [yamtam-engine-production.up.railway.app](https://yamtam-engine-production.up.railway.app) |
