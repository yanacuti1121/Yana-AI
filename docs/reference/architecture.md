# Architecture reference

Moved from the main README (2026-07-05) so the top-level pitch stays short.
Content unchanged from the version that lived in `README.md`.

## Yana AI at a Glance

```
┌──────────────────────────────────────────────────────────────────┐
│                     Yana AI v0.43.0                        │
│      "The orchestration layer between humans and AI —            │
│        routing, safety, and context for every domain."           │
│                                                                  │
│        Built by Vũ Văn Tâm · 17 · Vietnam                       │
└──────────────────────────────────────────────────────────────────┘
```

```mermaid
graph TB
    %% ── Mission ──────────────────────────────────────────────────────
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
        SKILLS["📚 1,989 skills\nSKILL.md workflow defs\n(frontend, backend, AI, K8s, sec...)"]
        AGENTS["🤖 101 specialist agents\n(planner, security-auditor,\nhoc-tap, daily-assistant...)"]
        RULES["📜 70 enforced rules\n(security, git, UI, TypeScript,\nAPI security, core-lock...)"]
        HOOKS["🪝 55 hooks\nPreToolUse · PostToolUse · Stop\n(guard-destructive, truth-gate...)"]
        CMDS["⚡ 166 slash commands\n/audit · /scan · /route\n/tdd-cycle · /simplify..."]
        BUS["🚌 Agent message bus\nJSON + ECDSA sig\nreplay-protected, BFT consensus"]
        MEM["🧠 Memory tiers\nL1 permanent · L2 session\nMerkle-chained, AES-256-GCM"]
    end

    %% ── Rust runtime ─────────────────────────────────────────────────────
    subgraph RT["⚡ Rust Runtime — yana-rt"]
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
    subgraph HARNESS["🔌 Harness Adapters (15)"]
        direction LR
        H1["Claude Code\nCursor · Zed"]
        H2["Gemini · Copilot\nAider · OpenCode"]
        H3["Cloudflare Workers\nGitHub Actions"]
    end

    %% ── Active branches ──────────────────────────────────────────────────
    subgraph BRANCHES["🌿 Active Branches"]
        direction LR
        BMAIN["main ✅\nv0.43.0 — stable"]
        BVDEV["v1.8.0-dev\nnext release (in progress)"]
        BCF["cloudflare/workers-autoconfig\nWorkers zero-config setup"]
        BCX["codex/fix-hello-bug-in-bn\nCodex compatibility"]
    end

    %% ── Product funnel ───────────────────────────────────────────────────
    subgraph FUNNEL["📣 Product Funnel — 'Scan first. Guard later.'"]
        direction LR
        F1["① yana-ai audit .\n30s · no learning needed\nScan any repo for AI agent risks"]
        F2["② Policy Kit\nAdopt safe configs piece by piece\n(CLAUDE.md · .mcp.json · CI gates)"]
        F3["③ Full Control Layer\nAll 9 gates · 101 agents\nMerkle log · Sovereign veto"]
        F1 --> F2 --> F3
    end

    %% ── Connections ──────────────────────────────────────────────────────
    MISSION --> GATES
    GATES --> CORE
    CORE --> RT
    CORE --> TOOLS
    CORE --> HARNESS
```

> **Reading the diagram:** every AI tool call flows `MISSION → GATES → CORE`. The Rust runtime (`yana-rt`) accelerates the scanner. Sub-project tools (yana-web etc.) use the same gate system. Branches show active development fronts.

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

## Numbers

| | |
|---|---|
| 🧩 Skills | **1,989** workflow skill definitions |
| 🤖 Agents | **101** specialist agents |
| 📜 Safety rules | **70** enforced rules |
| 🪝 Hooks | **55** pre/post-execution hooks |
| ⚡ Slash commands | **166** |
| 🔌 Harness adapters | **15** (Claude Code, Cursor, Windsurf, Antigravity, Kiro, OpenCode, Zed, Gemini, Copilot, Aider...) |
| 🦀 Rust subcommands | **23** (`scan`, `graph`, `vault`, `route`, `mission`, `hunt`, `fix`, `doctor`...) |
| ✅ Rule checks in CI | **826** |
| 📦 Total codebase | **8,438 files** |

## Safety architecture

```
core/
├── hooks/          # 55 PreToolUse / PostToolUse / Stop hooks
├── rules/          # 70 enforced rules (security, correctness, UI, git)
├── scripts/        # safe-run.sh, verify-core-lock.sh, secure-logger.sh
├── gates/          # truth_gate.md, action_gate.md
├── agents/         # 101 specialist agent definitions
├── skills/         # 1,989 SKILL.md files
├── config/
│   ├── core-lock.json    # SHA-256 manifest — 239 core files pinned
│   └── skills-lock.json  # skill content hashes
└── memory/
    ├── L1_atomic/  # permanent facts — persist across sessions
    └── L2_session/ # session state — auto-expires
```

Key properties:
- **Merkle audit chain** — every action logged, tamper-detected
- **Core-lock integrity** — SHA-256 manifest detects drift, deletion, and rule injection in core/
- **BFT consensus** — 3-of-N vote required for core infrastructure writes
- **Sovereign overlord** — human can freeze all 101 agents instantly
- **Honeypot layer** — decoy files/env vars catch compromised agents
