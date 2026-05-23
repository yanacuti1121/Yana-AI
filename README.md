<p align="center">
  <img
    src="./docs/yamtam-engine-overview.png"
    alt="YAMTAM ENGINE Overview"
    width="100%"
  />
</p>

<h1 align="center">YAMTAM ENGINE</h1>

<p align="center">
  <strong>Personal Agent Operating System</strong><br/>
  Multi-Agent Workflow · Secure Runtime Gates · Evidence-Based Verification
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v1.6.1-orange?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/status-private-111827?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/license-proprietary-red?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/owner-Vũ%20Văn%20Tâm-purple?style=for-the-badge" alt="Owner" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/agents-90-ff8c00?style=flat-square" alt="Agents" />
  <img src="https://img.shields.io/badge/commands-164-7c3aed?style=flat-square" alt="Commands" />
  <img src="https://img.shields.io/badge/hooks-35-f97316?style=flat-square" alt="Hooks" />
  <img src="https://img.shields.io/badge/scripts-46-22c55e?style=flat-square" alt="Scripts" />
  <img src="https://img.shields.io/badge/skills-351-06b6d4?style=flat-square" alt="Skills" />
  <img src="https://img.shields.io/badge/checks-826-ef4444?style=flat-square" alt="Checks" />
</p>

YAMTAM ENGINE là **Personal Agent Operating System** - hệ điều hành cho AI agents với khả năng điều phối đa tác nhân, kiểm soát workflow qua hooks/gates/rules, và verification dựa trên bằng chứng.

---

## Tính năng chính

- **90 Agents** — điều phối và thực thi theo vai trò chuyên môn
- **164 Commands** — giao diện slash command cho workflow AI
- **35 Hooks** — bảo vệ, giám sát và can thiệp runtime
- **351 Skills** — thư viện kỹ năng cho nhiều loại tác vụ
- **60 Rules** — quy tắc vận hành và kiểm soát chất lượng
- **46 Scripts** — công cụ checkpoint, rollback, sweep, release và verify
- **826 Checks** — hook tests, audit tests, skill checks, red-team scenarios và smoke tests
- **Evidence-Based Verification** — không tự nhận `done`, `passed`, `clean` nếu thiếu bằng chứng

---

## What YAMTAM is

YAMTAM is a standalone AI agent operating system designed to sit **outside** product repositories and control AI-assisted workflows through agents, commands, hooks, rules, gates, skills, memory, and verification tools.

## What YAMTAM is not

- Not a product app
- Not user-facing software
- Not part of any single product repo
- Not a replacement for real production safety (IAM, backups, RBAC, monitoring)
- Not allowed to claim success without evidence

---

## System Architecture

### 6-Layer Gate System (L0-L5)

```
L0 — Audit       audit-log.sh, telemetry-sender.sh
                 Log every tool call with hash-chain

L1 — Scope       token-scope-guard.sh, scope-guard.sh
                 Warn on secret/env access and cross-scope writes

L2 — Commit      commit-gate.sh
                 Advisory warning on cross-scope commits

L3 — Truth       truth-gate-guard.sh
                 Block unsupported claims without evidence

L4 — Deploy      deploy-gate.sh
                 Block gh/kubectl/docker/gcloud/fly/heroku

L5 — Destructive guard-destructive.sh, db-protect.sh, api-destruct-guard.sh
                 Block rm -rf, DROP TABLE, DELETE without WHERE
```

**Bypass:** `YAMTAM_DEPLOY_APPROVED=1`, `YAMTAM_SCOPE_OK=1`, `YAMTAM_TRUTH_GATE_BYPASS=1`

### Memory System

- **L1 Atomic Memory** — persistent facts, git-tracked, tagged, confidence-scored
- **L2 Session Memory** — ephemeral facts, gitignored, cleared each session

### Cross-Engine Support

| Engine | File | Enforcement |
|---|---|---|
| Claude Code | `.claude/settings.json` (hooks) | **Runtime blocking** (L0–L5 hooks) |
| Cursor | `.cursorrules` + `.cursor/rules/*.mdc` | **Hard enforcement** (safe-run.sh proxy) |
| Aider | `adapters/aider.md` + `.aider.conf.yml` | **Hard enforcement** (safe-run.sh shell proxy) |
| GitHub Copilot | `.github/copilot-instructions.md` | Advisory (prompt layer) |

---

## Repository Structure

```
yamtam-engine/
├── core/
│   ├── agents/          90 agent definitions
│   ├── commands/        164 slash commands
│   ├── hooks/           35 runtime hooks
│   ├── skills/          351 workflow skills
│   ├── scripts/         46 utility scripts
│   ├── rules/           60 operating rules
│   └── tests/           826 verification checks
├── gates/               Gate specifications (truth, action, security)
├── docs/                Documentation
├── memory/
│   ├── L1_atomic/       Persistent memory
│   └── L2_session/      Session memory
├── releases/            Release packs
└── adapters/            Cross-engine adapters
```

---

## Asset Counts

| Path | Count |
|---|---|
| `core/agents/` | 90 agents |
| `core/commands/` | 164 commands |
| `core/hooks/` | 35 hooks |
| `core/scripts/` | 46 scripts |
| `core/rules/` | 60 rules |
| `core/templates/` | 12 templates |
| `core/skills/` | 351 skills |
| `core/config/` | 6 config files |
| `core/tests/hooks/` | 65 test cases |
| `core/tests/skills/` | 334 skill trigger tests |
| `core/tests/commands/` | 6 smoke tests |
| `memory/L1_atomic/` | 4 seed facts (tagged) |
| `memory/L2_session/` | ephemeral — gitignored |

---

## Skill Categories (v1.6.1)

| Category | Count | Key Skills |
|---|---|---|
| **Security & Guardrails** | 11 | red-team-check, blue-team-fix, purple-team-report, adversarial-prompt-testing, supply-chain-security, zero-trust-patterns, agent-safety-patterns, leak-check, owasp-llm-top10, agent-attack-surface, agent-memory-security |
| **AI / Agent Orchestration** | 19 | rag-architect, prompt-engineering, llm-ui-patterns, auto-feedback-loop, prompt-caching-strategy, ai-team-workflow, agent-messaging-patterns, git-native-agent-protocol, research-team, tree-of-thoughts, ingest-repo, autonomous-patching-loop, state-machine-workflows, resilience-circuit-breakers, agent-telemetry, vector-store-patterns, type-safe-api-contracts, durable-task-queues, agent-middleware-gate |
| **LLM Output Quality** | 2 | llm-output-validation, llm-cost-optimizer |
| **Frontend / UI — Core** | 11 | baseline-ui, fixing-accessibility, fixing-motion-performance, shadcn-patterns, react-doctor, animation-principles, impeccable, interface-feel, design-engineering, apply-premium-background, generative-ui-patterns |
| **Frontend / UI — Design Systems** | 10 | design-tokens-system, color-math-system, typography-scale, motion-physics, component-layout-patterns, enterprise-design-systems, advanced-color-math, advanced-typography, advanced-motion-easing, smart-layout-aesthetics |
| **IaC / DevOps** | 5 | kubernetes-patterns, terraform-patterns, docker-patterns, serverless-patterns, cicd-patterns |
| **Stack Depth** | 6 | typescript-patterns, nextjs-patterns, state-management-patterns, unit-testing-patterns, monorepo-patterns, database-migrations |
| **Monorepo / Build** | 2 | monorepo-governance, build-system |
| **Observability** | 4 | slo-design, incident-response-runbook, observability-instrumentation, telemetry-analysis |
| **Data / Backend** | 11 | caching-patterns, api-rate-limiting, auth-patterns, resilience-patterns, event-driven-architecture, database-patterns, graphql-patterns, caching-memory-efficiency, high-perf-data-algorithms, profiling-benchmarking, database-query-safety |
| **Compilers / Parsing** | 3 | graph-dependency-resolution, ast-code-manipulation, grammar-lexer-dsl |
| **Workflow / Core** | 10 | plan-first, verify-before-done, tdd, debug-protocol, branch-finish, worktree-safety, session-context, pre-compact-backup, strategic-compact, memory-gc |
| **Token / Cost** | 1 | token-roi (loop detection, fast-tier auto-routing, ROI scoring) |
| **Other** | 256+ | error-handling, secret-management, distributed-tracing, contract-testing, load-testing, feature-flags, websocket-patterns, mlops, cloud-cost-optimization, i18n-patterns, data-privacy, adr-writing, refactor-patterns, + 240 more |

---

## How to Apply

YAMTAM applies to target projects via release packs:

```bash
# Extract release pack into target project
unzip releases/yamtam-engine-v1.6.1.zip -d /path/to/project/.claude/

# Verify installation
cd /path/to/project
bash .claude/tests/hooks/run-hook-tests.sh
```

Or install via Claude Code plugin:
```
/plugin install phamlongh230-lgtm/yamtam-engine
```

---

## Key Features

### Truth Gate (L3)

Blocks claims without evidence:
- ❌ "Tests passed" (no output shown)
- ✅ "Tests passed — 47 passed, 0 failed" (evidence shown)

Claim verbs require proof: `done`, `passed`, `clean`, `fixed`, `deployed`, `merged`, `verified`

### Action Gate (L0-L5)

Risk-based approval system:
- **L0 Read** — allowed
- **L1 Local write** — logged
- **L2 Commit** — warn on cross-scope
- **L3 Push** — request approval
- **L4 Deploy** — block by default
- **L5 Production data** — hard block

### Scope Guard

Prevents cross-scope edits:
- YAMTAM-scoped tasks cannot edit product code (`app/`, `components/`, `lib/`)
- Product-scoped tasks cannot edit YAMTAM files
- Requires explicit approval to cross boundaries

---

## Commands

Key slash commands:

| Command | Purpose |
|---|---|
| `/verify` | Full health check (git + hooks + tests + drift) |
| `/memory [keyword]` | Search L1 + L2 memory |
| `/session` | Manage session memory |
| `/rollback` | List checkpoints and rollback |
| `/risk-scan` | Pre-execution risk analysis |
| `/scope-declare` | Declare file scope before edits |
| `/security-audit` | Security review |
| `/handoff` | Generate session handoff |
| `/status` | Project status card |

Full list: `core/commands/` (164 commands)

---

## Agents

90 specialized agents across domains:

- **Core Development** (8): fullstack-engineer, api-designer, microservices-architect
- **Quality Assurance** (6): test-automation-engineer, qa-lead, performance-tester
- **Infrastructure** (8): devops-engineer, sre, cloud-architect
- **Security** (4): security-engineer, penetration-tester, compliance-auditor
- **Data/AI** (6): data-engineer, ml-engineer, llm-architect
- **Business** (4): business-analyst, technical-writer, ux-researcher

Full list: `core/agents/`

---

## Rules

60 operating rules enforcing:

- **Meta** (1): 00-meta-rule-enforcer
- **Security** (4): 43-prompt-jailbreak-advanced, 44-supply-chain-vetting
- **Isolation** (3): 03-privilege-isolation, 04-sandbox-isolation-law
- **Autonomous** (2): 63-autonomous-session-law, 64-scope-drift-law
- **Sovereign** (1): sovereign-overlord-gate-law

Full list: `core/rules/`

---

## Verification

826 total checks:
- 65 hook tests
- 12 audit tests
- 334 skill trigger tests
- 65 red-team scenarios
- 6 smoke tests

Run full verification:
```bash
bash core/tests/hooks/run-hook-tests.sh
bash core/tests/skills/test-skill-triggering.sh
```

---

## Release Process

```bash
# Build release pack
bash core/scripts/build-release.sh

# Runs: syntax check → 826 checks → drift check → zip

# Tag and push (triggers GitHub Actions)
git tag v1.6.1
git push origin v1.6.1
```

---

## Documentation

- `AGENTS.md` — Entry point for AI assistants (read first)
- `gates/truth_gate.md` — L3 Truth Gate specification
- `gates/action_gate.md` — L0-L5 Action Gate specification
- `docs/SEPARATION.md` — Boundary between YAMTAM and product repos
- `docs/AGENT_BEHAVIOR.md` — Good vs bad agent behavior examples
- `docs/HOOK_WIRING.md` — Hook configuration guide
- `ROADMAP.md` — Feature roadmap
- `CHANGELOG.md` — Release history

---

## What YAMTAM is NOT

- Not a product app
- Not user-facing software
- Not bundled with product repos by default
- Not a replacement for real production safety (IAM, backups, RBAC, monitoring)
- Not allowed to claim success without evidence

See `.out-of-scope/` for deliberately excluded features.

---

## License

YAMTAM ENGINE is proprietary software.

Copyright © 2026 Vũ Văn Tâm. All rights reserved.

No one is allowed to copy, modify, redistribute, publish, host, sell, or create derivative works from this project without prior written permission.

See `LICENSE` for details.

---

## Contact

**Owner:** Vũ Văn Tâm  
**Repository:** yamtam-engine  
**Version:** 1.6.1  
**Last Updated:** 2026-05-23
