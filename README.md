<p align="center">
  <img
    src="./docs/yamtam-agents-workshop.png"
    alt="YAMTAM ENGINE Agents Workshop"
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
  <img src="https://img.shields.io/badge/status-private%20candidate-111827?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/license-proprietary-red?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/owner-Vũ%20Văn%20Tâm-purple?style=for-the-badge" alt="Owner" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/agents-90-ff8c00?style=flat-square" alt="Agents" />
  <img src="https://img.shields.io/badge/commands-164-7c3aed?style=flat-square" alt="Commands" />
  <img src="https://img.shields.io/badge/hooks-34-f97316?style=flat-square" alt="Hooks" />
  <img src="https://img.shields.io/badge/scripts-46-22c55e?style=flat-square" alt="Scripts" />
  <img src="https://img.shields.io/badge/skills-350-06b6d4?style=flat-square" alt="Skills" />
  <img src="https://img.shields.io/badge/checks-826-ef4444?style=flat-square" alt="Checks" />
</p>

YAMTAM ENGINE là **Personal Agent Operating System** dùng để điều phối nhiều AI agents,
kiểm soát workflow bằng hooks, gates, rules, skills và hệ thống verification có evidence.

---

## Tính năng chính

- **90+ Agents**: điều phối và thực thi theo vai trò.
- **164 Commands**: giao diện slash command cho workflow AI.
- **34 Hooks**: bảo vệ, giám sát và can thiệp runtime.
- **350 Skills**: thư viện kỹ năng cho nhiều loại tác vụ.
- **60 Rules**: quy tắc vận hành và kiểm soát chất lượng.
- **46 Scripts**: công cụ checkpoint, rollback, sweep, release và verify.
- **826 Checks**: hook tests, audit tests, skill checks, red-team scenarios và smoke tests.
- **Evidence-Based Verification**: không tự nhận `done`, `passed`, `clean` nếu thiếu bằng chứng.

---

## What YAMTAM is

YAMTAM is a standalone AI agent operating system.

It is designed to sit **outside** product repositories and control AI-assisted workflows
through agents, commands, hooks, rules, gates, skills, memory, and verification tools.

## What YAMTAM is not

- Not a product app.
- Not user-facing software.
- Not part of JNMT or any single repo.
- Not a replacement for real production safety such as IAM, backups, RBAC, or monitoring.
- Not allowed to claim success without evidence.

<p align="center">
  <img src="https://img.shields.io/badge/Agents-90-00C2FF?style=flat-square" alt="Agents" />
  <img src="https://img.shields.io/badge/Commands-164-7C3AED?style=flat-square" alt="Commands" />
  <img src="https://img.shields.io/badge/Hooks-34-F97316?style=flat-square" alt="Hooks" />
  <img src="https://img.shields.io/badge/Scripts-46-22C55E?style=flat-square" alt="Scripts" />
  <img src="https://img.shields.io/badge/Skills-350-06B6D4?style=flat-square" alt="Skills" />
  <img src="https://img.shields.io/badge/Checks-826-EF4444?style=flat-square" alt="Checks" />
</p>

---

## 🧠 System Architecture

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║                         ⚡ YAMTAM ENGINE v1.6.1                            ║
║                    Personal Agent Operating System                         ║
║                                                                              ║
║        Secure · Autonomous · Auditable · Sovereign-Controlled Workflow       ║
╚══════════════════════════════════════════════════════════════════════════════╝

 👤 VŨ VĂN TÂM ── SOVEREIGN OWNER (Tier 2)
      │
      │  🟢 Identity Gate
      │  ├─ SHA-256 auto-auth
      │  ├─ Case-insensitive identity validation
      │  └─ Env-var bypass reserved for sovereign control
      │
      ▼

╔══════════════════════════════════════════════════════════════════════════════╗
║                              🤖 AI ENGINE LAYER                            ║
║                                                                              ║
║   ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐  ║
║   │   🟦 Claude Code   │   │    🟪 Cursor       │   │  🟩 Aider/Copilot  │  ║
║   │                    │   │                    │   │                    │  ║
║   │  Native hooks      │   │  .mdc rules        │   │  .aider.conf.yml   │  ║
║   │  settings.json     │   │  safe-run.sh       │   │  safe-run proxy    │  ║
║   │  full hook wiring  │   │  HARD MODE         │   │  advisory prompt   │  ║
║   └─────────┬──────────┘   └─────────┬──────────┘   └─────────┬──────────┘  ║
║             │                        │                        │             ║
╚═════════════╪════════════════════════╪════════════════════════╪═════════════╝
              │                        │                        │
              └────────────────────────┴────────────────────────┘
                                       │
                                       ▼

╔══════════════════════════════════════════════════════════════════════════════╗
║                         🧱 L0.5 COMMAND FIREWALL                           ║
║                              safe-run.sh                                    ║
║                                                                              ║
║   🔴 BLOCKED PATTERNS                                                       ║
║   ├─ rm -rf                                                                  ║
║   ├─ git push --force                                                        ║
║   └─ curl | bash                                                             ║
║                                                                              ║
║   🟡 WARN PATTERNS                                                          ║
║   ├─ eval                                                                    ║
║   ├─ xargs rm                                                                ║
║   ├─ sudo                                                                    ║
║   └─ pip install --user                                                      ║
║                                                                              ║
║   ⚡ HARD MODE                                                              ║
║   └─ Cursor / Aider: warning becomes instant block, no TTY prompt            ║
║                                                                              ║
║   🗝️ SOVEREIGN BYPASS                                                       ║
║   └─ YAMTAM_SAFE_RUN_BYPASS=1                                                ║
╚═══════════════════════════════════════╦══════════════════════════════════════╝
                                        │
                                        ▼

╔══════════════════════════════════════════════════════════════════════════════╗
║                            🛡️ HOOK GATE STACK                              ║
║                       PreToolUse · PostToolUse · Stop                       ║
║                                                                              ║
║   🟣 L0  AUDIT LAYER                                                        ║
║   ├─ audit-log.sh                                                           ║
║   └─ telemetry-sender.sh                                                    ║
║      Every tool call logged with SHA-256 hash-chain                         ║
║                                                                              ║
║   🔵 L1  SCOPE LAYER                                                        ║
║   ├─ token-scope-guard.sh                                                   ║
║   └─ scope-guard.sh                                                         ║
║      Warns on secret/env access and writes to product directories            ║
║                                                                              ║
║   🟠 L2  COMMIT LAYER                                                       ║
║   └─ commit-gate.sh                                                         ║
║      Advisory warning on commits touching cross-scope paths                  ║
║                                                                              ║
║   🟡 L3  TRUTH LAYER                                                        ║
║   └─ truth-gate-guard.sh                                                    ║
║      Blocks unsupported "done / passed / clean" claims                      ║
║      Trust score tracks violations                                          ║
║      score < 50 requires double evidence                                    ║
║                                                                              ║
║   🔴 L4  DEPLOY LAYER                                                       ║
║   └─ deploy-gate.sh                                                         ║
║      DENY: kubectl · docker push · gh workflow run · gcloud · fly            ║
║      BYPASS: YAMTAM_DEPLOY_APPROVED=1                                       ║
║                                                                              ║
║   🧨 L5  DESTRUCTIVE ACTION LAYER                                           ║
║   ├─ guard-destructive.sh                                                   ║
║   ├─ db-protect.sh                                                          ║
║   └─ api-destruct-guard.sh                                                  ║
║      DENY: rm -rf · DROP TABLE · DELETE /prod · prisma migrate              ║
║                                                                              ║
║   ⚡ CIRCUIT BREAKER                                                        ║
║   └─ token-budget-guard.sh                                                  ║
║      CLOSED → OPEN after 5 consecutive calls without success                ║
║      HARD BLOCK with escalating cooldown: 60s → 300s → 1800s                ║
║      Fast-tier route: claude-haiku-4-5 on loop                              ║
╚═══════════════════════════════════════╦══════════════════════════════════════╝
                                        │
                                        │  ✅ ALLOW
                                        ▼

╔═══════════════════════════════════════╦══════════════════════════════════════╗
║            🧬 MEMORY STACK            ║             📚 KNOWLEDGE LAYER       ║
║                                       ║                                      ║
║   🟦 L1 ATOMIC MEMORY                 ║   🧩 350 Skills                      ║
║   ├─ Persistent facts                 ║   └─ On-demand workflow library      ║
║   ├─ Tagged records                   ║                                      ║
║   ├─ Confidence scoring               ║   ⚙️ 156 Commands                    ║
║   └─ Git-tracked memory               ║   └─ Slash command interface         ║
║                                       ║                                      ║
║   🟪 L2 SESSION MEMORY                ║   🤖 87 Agents                       ║
║   ├─ Ephemeral session facts          ║   └─ Specialized sub-agents          ║
║   ├─ Gitignored runtime memory        ║                                      ║
║   └─ Cleared each session             ║   📜 58 Rules                        ║
║                                       ║   └─ Always-on operating constraints ║
║                                       ║                                      ║
║                                       ║   🔐 Security Rule Families          ║
║                                       ║   ├─ prompt-jailbreak-advanced       ║
║                                       ║   ├─ supply-chain-vetting            ║
║                                       ║   ├─ anti-evasion-law                ║
║                                       ║   ├─ shell-sanitize-law              ║
║                                       ║   └─ sovereign-overlord-gate-law     ║
╚═══════════════════════════════════════╩══════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════╗
║                            🔐 SECURITY PERIMETER                           ║
║                                                                              ║
║      ✅  65 Hook Tests                                                       ║
║   +  ✅  12 Audit Tests                                                      ║
║   +  ✅ 334 Skill Checks                                                     ║
║   +  ✅  65 Red-Team Scenarios                                               ║
║   +  ✅   6 Smoke Tests                                                      ║
║   ─────────────────────────                                                  ║
║      🧪 826 Total Verification Checks                                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

Execution Flow:
Owner → Identity Gate → AI Engine Layer → Command Firewall → Hook Gates
      → Memory + Knowledge Layer → Verification → Evidence Report
```

 SECURITY PERIMETER: 65 hook tests · 12 audit tests · 334 skill checks
                     65 red-team scenarios · 6 smoke tests = 826 checks
```

---

## Repo structure

```txt
yamtam-engine/
├── README.md              ← you are here
├── AGENTS.md              ← entry point for AI assistants (read first if AI)
├── CONTRIBUTING.md        ← skill format guide, PR checklist
├── SECURITY.md            ← vulnerability disclosure + L0-L5 scope
├── CHANGELOG.md
├── ROADMAP.md
├── MANIFEST.json
├── LICENSE
├── .cursorrules           ← Cursor legacy rules (security + code constraints)
├── .gitignore
│
├── core/                  ← runtime assets
│   ├── agents/            ← 90 agent definitions (quality-testing, infrastructure, security-team, core-development, forge, risk-analyst, scope-enforcer, session-historian, etc.)
│   ├── commands/          ← 164 slash commands (incl. /rollback, /risk-scan, /scope-declare, /session-stats, /env-check, /tech-debt, /cost-forecast, /session-trace, /cost-report, …)
│   ├── hooks/             ← 34 hooks (.sh + .js) — L0 audit → L5 destructive guard, confidence-scorer, intent-inference, self-healing, hook-timeout-guard
│   ├── scripts/           ← 46 utility scripts (safe-run.sh, session-checkpoint.sh, session-rollback.sh, rotate-audit-log.sh, memory-provenance.sh, resolve-memory-conflict.sh, …)
│   ├── rules/             ← 60 rules (00-meta-rule-enforcer, 03-privilege-isolation, 43-prompt-jailbreak-advanced, 44-supply-chain-vetting, 63-autonomous-session-law, 64-scope-drift-law, circuit-breaker-law, sovereign-overlord-gate-law, …)
│   ├── templates/         ← 12 project templates (incl. SKILL_TEMPLATE.md)
│   ├── skills/            ← 350 skill definitions
│   │     Workflow/Core    : plan-first, verify-before-done, debug-protocol, branch-finish, worktree-safety, tdd, memory-gc
│   │     Security         : red-team-check, blue-team-fix, purple-team-report, adversarial-prompt-testing, supply-chain-security, zero-trust-patterns, agent-safety-patterns, leak-check
│   │     AI/Agent         : rag-architect, prompt-engineering, auto-feedback-loop, prompt-caching-strategy, research-team, tree-of-thoughts, ingest-repo, autonomous-patching-loop, llm-output-validation
│   │     Frontend/UI      : baseline-ui, shadcn-patterns, react-doctor, design-tokens-system, color-math-system, typography-scale, motion-physics, component-layout-patterns, enterprise-design-systems, advanced-color-math, advanced-typography, advanced-motion-easing, smart-layout-aesthetics + 8 more
│   │     IaC/DevOps       : kubernetes-patterns, terraform-patterns, docker-patterns, serverless-patterns, cicd-patterns
│   │     Data/Backend     : database-patterns, database-query-safety, caching-memory-efficiency, high-perf-data-algorithms, profiling-benchmarking, graphql-patterns, resilience-patterns + 4 more
│   │     Monorepo/Build   : monorepo-governance, monorepo-patterns, build-system
│   │     Stack depth      : typescript-patterns, nextjs-patterns, state-management-patterns, unit-testing-patterns, database-migrations
│   │     Token/Cost       : token-roi (loop detection, fast-tier routing, ROI scoring)
│   │     + 62 more        : error-handling, secret-management, load-testing, feature-flags, mlops, websocket-patterns, i18n-patterns, …
│   ├── config/            ← 6 config JSON files (skills-lock.json, …)
│   └── tests/
│       ├── hooks/         ← run-hook-tests.sh + test-audit-chain.sh (65+12 test cases)
│       ├── skills/        ← test-skill-triggering.sh (310 skill trigger checks)
│       └── commands/      ← test-hook-review-smoke.sh (6 smoke tests)
│
├── adapters/              ← cross-engine governance adapters
│   ├── README.md          ← engine matrix + switch-engine.sh docs
│   └── aider.md           ← Aider --system-prompt adapter
│
├── .cursor/rules/         ← Cursor MDC rules (Cursor ≥ 0.40)
│   ├── yamtam-security.mdc
│   └── yamtam-code-quality.mdc
│
├── memory/
│   ├── L1_atomic/         ← persistent fact store (tagged, confidence-gated)
│   └── L2_session/        ← session-scoped facts (gitignored, cleared each session)
│
├── gates/
│   ├── truth_gate.md           ← L3 spec + runtime hook (truth-gate-guard.sh)
│   ├── action_gate.md          ← L4 spec (L0–L5 coverage table)
│   ├── anti-fake-pass-gate.md  ← evidence hierarchy (PASS/REVIEWED/UNKNOWN)
│   ├── security-scope-gate.md  ← ownership confirmation before security scans
│   └── ui-quality-gate.md      ← L1–L7 UI gate (baseline → accessible → generative UI)
│
├── prompts/
│   └── system_prompt.md   ← copy-paste prompt block for AI operators
│
├── docs/
│   ├── HOOK_WIRING.md, MAINTENANCE_POLICY.md, CLAUDE_MD_GUIDE.md
│   ├── SEPARATION.md, RUNBOOK.md, AGENT_BEHAVIOR.md
│   ├── AUDIT_HARDENING.md, OUTPUT_BUDGET_POLICY.md
│   ├── third-party-inspiration.md   ← attribution log for all external sources
│   ├── skill-spec.md, skill-writing-guide.md, skill-evaluation-rules.md
│   └── model-routing-strategy.md    ← Power/Balanced/Fast tier routing map
│
├── .out-of-scope/         ← features deliberately not built
├── .claude-plugin/        ← plugin manifest for /plugin install
│   ├── plugin.json
│   └── marketplace.json
├── .github/
│   ├── workflows/release.yml
│   ├── copilot-instructions.md   ← GitHub Copilot governance adapter
│   └── security-advisories/
│
└── releases/
    ├── yamtam-engine-v1.3.48.zip
    └── yamtam-engine-latest.zip
```

---

## Asset counts

| Path | Count |
|---|---|
| `core/agents/` | 90 agents |
| `core/commands/` | 164 commands |
| `core/hooks/` | 34 hooks |
| `core/scripts/` | 46 scripts |
| `core/rules/` | 60 rules |
| `core/templates/` | 12 templates |
| `core/skills/` | 350 skills |
| `core/config/` | 6 config files |
| `adapters/` | aider.md + .cursorrules + .cursor/rules/ + copilot-instructions.md |
| `core/tests/hooks/` | 65 test cases |
| `core/tests/skills/` | 310 skill trigger tests |
| `core/tests/commands/` | 6 smoke tests |
| `memory/L1_atomic/` | 4 seed facts (tagged) |
| `memory/L2_session/` | ephemeral — gitignored |

---

## Skill categories (v1.6.1)

| Category | Count | Skills |
|---|---|---|
| Security & guardrails | 11 | red-team-check, blue-team-fix, purple-team-report, adversarial-prompt-testing, supply-chain-security, zero-trust-patterns, agent-safety-patterns, leak-check, owasp-llm-top10, agent-attack-surface, agent-memory-security |
| AI / Agent orchestration | 19 | rag-architect, prompt-engineering, llm-ui-patterns, auto-feedback-loop, prompt-caching-strategy, ai-team-workflow, agent-messaging-patterns, git-native-agent-protocol, research-team, tree-of-thoughts, ingest-repo, autonomous-patching-loop, state-machine-workflows, resilience-circuit-breakers, agent-telemetry, vector-store-patterns, type-safe-api-contracts, durable-task-queues, agent-middleware-gate |
| LLM output quality | 2 | llm-output-validation, llm-cost-optimizer |
| Frontend / UI — Core | 11 | baseline-ui, fixing-accessibility, fixing-motion-performance, shadcn-patterns, react-doctor, animation-principles, impeccable, interface-feel, design-engineering, apply-premium-background, generative-ui-patterns |
| Frontend / UI — Design systems | 10 | design-tokens-system, color-math-system, typography-scale, motion-physics, component-layout-patterns, enterprise-design-systems, advanced-color-math, advanced-typography, advanced-motion-easing, smart-layout-aesthetics |
| IaC / DevOps | 5 | kubernetes-patterns, terraform-patterns, docker-patterns, serverless-patterns, cicd-patterns |
| Stack depth | 6 | typescript-patterns, nextjs-patterns, state-management-patterns, unit-testing-patterns, monorepo-patterns, database-migrations |
| Monorepo / Build | 2 | monorepo-governance, build-system |
| Observability | 4 | slo-design, incident-response-runbook, observability-instrumentation, telemetry-analysis |
| Data / Backend | 11 | caching-patterns, api-rate-limiting, auth-patterns, resilience-patterns, event-driven-architecture, database-patterns, graphql-patterns, caching-memory-efficiency, high-perf-data-algorithms, profiling-benchmarking, database-query-safety |
| Compilers / Parsing | 3 | graph-dependency-resolution, ast-code-manipulation, grammar-lexer-dsl |
| Workflow / Core | 10 | plan-first, verify-before-done, tdd, debug-protocol, branch-finish, worktree-safety, session-context, pre-compact-backup, strategic-compact, memory-gc |
| Token / Cost | 1 | token-roi (loop detection, fast-tier auto-routing, ROI scoring) |
| Other (i18n, perf, patterns, …) | 81 | error-handling, secret-management, distributed-tracing, contract-testing, load-testing, feature-flags, websocket-patterns, mlops, cloud-cost-optimization, i18n-patterns, data-privacy, adr-writing, refactor-patterns, caching-patterns (redis), api-design, backend-patterns, coding-standards, deep-research, documentation-lookup, e2e-testing, security-review, tdd-workflow, verification-loop, agent-introspection-debugging, frontend-patterns, mcp-server-patterns, + 56 more |

---

## Cross-Engine Support

YAMTAM natively targets Claude Code. Adapters make governance available on other engines:

| Engine | File | Enforcement |
|---|---|---|
| Claude Code | `.claude/settings.json` (hooks) | **Runtime blocking** (L0–L5 hooks) |
| Cursor | `.cursorrules` + `.cursor/rules/*.mdc` | **Hard enforcement** (safe-run.sh proxy via yamtam-hard-enforcement.mdc) |
| GitHub Copilot | `.github/copilot-instructions.md` | Advisory (prompt layer) |
| Aider | `adapters/aider.md` + `.aider.conf.yml` | **Hard enforcement** (safe-run.sh shell proxy) |

```bash
# Check adapter status
bash core/scripts/switch-engine.sh status

# Switch active engine
bash core/scripts/switch-engine.sh cursor|copilot|aider|claude
```

> Cursor và Aider có **Hard Enforcement** từ v1.6.1 — mọi bash command tự động route qua `safe-run.sh --engine <cursor|aider>`. Chạy `bash core/scripts/switch-engine.sh cursor` để kích hoạt.

---

## Action Gate coverage (L0–L5)

| Level | Hook | Behavior |
|---|---|---|
| L0 | `audit-log.sh`, `telemetry-sender.sh` | Log every tool call (hash-chain tamper-evident) |
| L1 | `token-scope-guard.sh`, `scope-guard.sh` | Warn on secret/scope access |
| L2 | `commit-gate.sh` | Advisory warn on cross-scope commits |
| L3 | `truth-gate-guard.sh` | Warn on unsupported claims |
| L4 | `deploy-gate.sh` | Block gh/kubectl/docker/gcloud/fly/heroku deploys |
| L5 | `db-protect.sh`, `api-destruct-guard.sh`, `guard-destructive.sh` | Block destructive ops |
| \+ | `token-budget-guard.sh` | Loop detection + fast-tier routing after 5 attempts |

Bypass: `YAMTAM_DEPLOY_APPROVED=1`, `YAMTAM_SCOPE_OK=1`, `YAMTAM_TRUTH_GATE_BYPASS=1`.

---

## How to apply to a project

See `docs/HOOK_WIRING.md` for full wiring guide and `settings.json` presets.

```bash
# Apply latest release pack
unzip releases/yamtam-engine-latest.zip -d /path/to/project/.claude/

# Verify
cd /path/to/project
bash .claude/tests/hooks/run-hook-tests.sh
```

Or install via Claude Code plugin system:
```
/plugin install phamlongh230-lgtm/yamtam-engine
```

---

## How to cut a new release

```bash
# In this repo — after making changes:
bash core/scripts/build-release.sh
# Runs: syntax check → 415 checks → drift check → zip → symlink latest
```

GitHub Actions auto-releases on semver tag push:
```bash
git tag v1.6.1 && git push origin v1.6.1
```

---

## License / credits

## License

YAMTAM ENGINE is proprietary software.

Copyright (c) 2026 Vũ Văn Tâm. All rights reserved.

No one is allowed to copy, modify, redistribute, publish, host, sell, or create
derivative works from this project without prior written permission.

See `LICENSE` for details.
