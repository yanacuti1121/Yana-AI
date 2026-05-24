<p align="center">
  <img
    src="./docs/yamtam-engine-overview.png"
    alt="YAMTAM ENGINE Overview"
    width="100%"
  />
</p>

<h1 align="center">YAMTAM ENGINE</h1>

<p align="center">
  <strong>Personal Agent Operating System for Claude Code</strong><br/>
  Safety hooks that block before damage happens · Evidence-based verification · Cross-engine enforcement
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v1.7.0-orange?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/status-public-22c55e?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/built%20for-Claude%20Code-5c6bc0?style=for-the-badge" alt="Built for Claude Code" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/agents-90-ff8c00?style=flat-square" alt="Agents" />
  <img src="https://img.shields.io/badge/commands-164-7c3aed?style=flat-square" alt="Commands" />
  <img src="https://img.shields.io/badge/hooks-39-f97316?style=flat-square" alt="Hooks" />
  <img src="https://img.shields.io/badge/skills-350-06b6d4?style=flat-square" alt="Skills" />
  <img src="https://img.shields.io/badge/checks-826-ef4444?style=flat-square" alt="Checks" />
  <img src="https://img.shields.io/badge/rules-60-10b981?style=flat-square" alt="Rules" />
</p>

---

## What is YAMTAM?

YAMTAM ENGINE is a **standalone agent operating system** that wraps Claude Code (and other AI coding tools) with runtime safety enforcement, memory, agents, and verification — without touching your product repositories.

It sits **outside** your codebase and intercepts AI actions before they cause harm:

```
You → Claude Code → [YAMTAM HOOKS] → Tool executes (or gets blocked)
```

**Real incidents YAMTAM would have blocked:**
- Replit (July 2025) — AI agent deleted production data via unguarded `rm -rf`
- PocketOS (April 2026) — prompt injection caused unauthorized file exfiltration

---

## Why use it?

| Without YAMTAM | With YAMTAM |
|---|---|
| `rm -rf /` silently executes | Hard blocked at L5 |
| `curl \| bash` runs untrusted code | Supply chain guard blocks it |
| AI claims "tests passed" with no proof | Truth Gate requires evidence |
| Prompt injection overrides instructions | L3.5 injection guard intercepts |
| `DROP TABLE users` runs in prod | DB protect hook blocks it |
| AI deploys to prod without approval | Deploy gate hard blocks |

---

## Quick Install

```bash
# Install via Claude Code plugin
/plugin install phamlongh230-lgtm/yamtam-engine

# Or extract manually into your project
unzip releases/yamtam-engine-v1.7.0.zip -d /path/to/project/.claude/

# Verify all 826 checks pass
bash .claude/tests/hooks/run-hook-tests.sh
```

---

## 6-Layer Gate System (L0–L5)

```
L0 — Audit       audit-log.sh, telemetry-sender.sh
                 Every tool call logged with hash-chain

L1 — Scope       token-scope-guard.sh, scope-guard.sh
                 Warn on secret/env access, cross-scope writes

L1.5 — Validate  tool-validator.sh                          ← NEW v1.7.0
                 Block SSRF, path traversal, sensitive file reads

L2 — Commit      commit-gate.sh
                 Advisory warning on cross-scope commits

L3 — Truth       truth-gate-guard.sh
                 Block unsupported claims without evidence

L3.5 — Inject    prompt-injection-guard.sh                  ← NEW v1.7.0
                 Block identity override, system prompt extraction, jailbreaks

L4 — Deploy      deploy-gate.sh
                 Block gh/kubectl/docker/gcloud/fly/heroku

L4.5 — Supply    supply-chain-guard.sh                      ← NEW v1.7.0
                 Block pipe-to-shell, typosquatting, URL package installs

L5 — Destructive guard-destructive.sh, db-protect.sh, api-destruct-guard.sh
                 Block rm -rf, DROP TABLE, DELETE without WHERE
```

**Emergency bypass:** `YAMTAM_DEPLOY_APPROVED=1`, `YAMTAM_SCOPE_OK=1`, `YAMTAM_TRUTH_GATE_BYPASS=1`

---

## Key Features

### Truth Gate (L3)

AI must show evidence before claiming success:

```
❌  "Tests passed"                          ← blocked, no proof
✅  "Tests passed — 47 passed, 0 failed"   ← allowed, evidence shown
```

Claim verbs that require proof: `done`, `passed`, `clean`, `fixed`, `deployed`, `merged`, `verified`

### Action Gate (L0–L5)

Risk-tiered enforcement:

| Level | Action | Enforcement |
|---|---|---|
| L0 | Read | Always allowed |
| L1 | Local write | Logged |
| L2 | Commit | Warn if cross-scope |
| L3 | Push | Request approval |
| L4 | Deploy | Blocked by default |
| L5 | Production data | Hard block |

### Scope Guard

Prevents drift between YAMTAM tasks and product code:
- YAMTAM-scoped tasks cannot edit `app/`, `components/`, `lib/`
- Product-scoped tasks cannot edit YAMTAM files
- Crossing boundaries requires explicit approval

### Cross-Engine Support

| Engine | Enforcement |
|---|---|
| **Claude Code** | Runtime blocking via hooks (L0–L5) |
| **Cursor** | Hard enforcement via safe-run.sh proxy |
| **Aider** | Hard enforcement via shell proxy |
| **GitHub Copilot** | Advisory via prompt layer |

---

## Memory System

- **L1 Atomic Memory** — persistent facts, git-tracked, tagged, confidence-scored, expiry sweep
- **L2 Session Memory** — ephemeral facts, gitignored, cleared each session

---

## What's Included

| Asset | Count |
|---|---|
| Agents | 90 |
| Slash commands | 164 |
| Runtime hooks | 39 |
| Workflow skills | 350 |
| Operating rules | 60 |
| Utility scripts | 46 |
| Verification checks | 826 |

### Agents (90)

Specialized agents across domains:

- **Core Development** (8): fullstack-engineer, api-designer, microservices-architect
- **Quality Assurance** (6): test-automation-engineer, qa-lead, performance-tester
- **Infrastructure** (8): devops-engineer, sre, cloud-architect
- **Security** (4): security-engineer, penetration-tester, compliance-auditor
- **Data / AI** (6): data-engineer, ml-engineer, llm-architect
- **Business** (4): business-analyst, technical-writer, ux-researcher

### Skills (350)

| Category | Count |
|---|---|
| Security & Guardrails | 11 |
| AI / Agent Orchestration | 19 |
| Frontend / UI | 21 |
| IaC / DevOps | 5 |
| Data / Backend | 11 |
| Observability | 4 |
| Workflow / Core | 10 |
| + more | 269 |

### Key Commands

| Command | Purpose |
|---|---|
| `/verify` | Full health check (git + hooks + tests + drift) |
| `/memory [keyword]` | Search L1 + L2 memory |
| `/risk-scan` | Pre-execution risk analysis |
| `/scope-declare` | Declare file scope before edits |
| `/security-audit` | Security review |
| `/rollback` | List checkpoints and rollback |
| `/handoff` | Generate session handoff |
| `/status` | Project status card |

Full list: `core/commands/` (164 commands)

---

## Repository Structure

```
yamtam-engine/
├── core/
│   ├── agents/          90 agent definitions
│   ├── commands/        164 slash commands
│   ├── hooks/           39 runtime hooks
│   ├── skills/          350 workflow skills
│   ├── scripts/         46 utility scripts
│   ├── rules/           60 operating rules
│   └── tests/           826 verification checks
├── gates/               Gate specifications (truth, action, security)
├── memory/
│   ├── L1_atomic/       Persistent memory (git-tracked)
│   └── L2_session/      Session memory (gitignored)
├── releases/            Release packs
├── adapters/            Cross-engine adapters (Cursor, Aider, Copilot)
└── docs/                Documentation
```

---

## Verification

826 total checks — run before every release:

```bash
bash core/tests/hooks/run-hook-tests.sh        # 88 hook tests
bash core/tests/skills/test-skill-triggering.sh  # 334 skill trigger tests
```

Breakdown: 65 hook tests · 12 audit tests · 334 skill trigger tests · 65 red-team scenarios · 6 smoke tests

---

## What YAMTAM is NOT

- Not a product app or user-facing software
- Not bundled inside your product repo
- Not a replacement for IAM, backups, RBAC, or production monitoring
- Not allowed to claim success without evidence

---

## Contributing & Feedback

YAMTAM improves through real-world use. If a hook fires when it shouldn't, or misses something it should catch — that's the most valuable signal.

**Most useful feedback:**
- **False positives** — hook blocked something legitimate
- **False negatives** — hook missed a real threat
- **Real incidents** — AI behavior YAMTAM would have prevented
- **Missing patterns** — attack vectors not covered by current rules

Open an issue or PR. See `CONTRIBUTING.md` for how to add hooks, skills, or rules.

**Direct contact:** phamlongh230@gmail.com · +82 010 6315 8995 · +84 037 495 5390

---

## Documentation

| File | Purpose |
|---|---|
| `AGENTS.md` | Entry point for AI assistants — read first |
| `gates/truth_gate.md` | L3 Truth Gate specification |
| `gates/action_gate.md` | L0–L5 Action Gate specification |
| `docs/SEPARATION.md` | Boundary between YAMTAM and product repos |
| `docs/AGENT_BEHAVIOR.md` | Good vs bad agent behavior examples |
| `docs/HOOK_WIRING.md` | Hook configuration guide |
| `ROADMAP.md` | Feature roadmap |
| `CHANGELOG.md` | Release history |

---

## License

MIT License — Copyright © 2026 Vũ Văn Tâm.

Free to use, fork, modify, and distribute. See `LICENSE` for full terms.

---

<p align="center">
  <sub>v1.7.0 · Built for Claude Code · MIT License · Maintained by Vũ Văn Tâm</sub>
</p>
