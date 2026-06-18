# Yana AI — Architecture

**Version:** v1.7.3  
**Release date:** 2026-05-25  
**Status:** Current architecture — documents what exists, not what is planned  
**Maintained by:** Vũ Văn Tâm

---

## System Overview

Yana AI is a standalone agent operating system that wraps Claude Code (and other AI coding tools) with runtime safety enforcement, memory, agents, and verification. It lives **outside** product repositories and intercepts AI actions before they cause harm.

```
User
  └─► Claude Code (or Cursor / Aider / Copilot / Gemini / DeepSeek / Qwen)
            └─► [Yana AI HOOKS] ── PreToolUse / PostToolUse / Stop
                      ├── PASS  → tool executes
                      └── BLOCK → action denied, reason logged
```

The engine is **deployed by installing its runtime pack** (`yana-ai-vX.Y.Z.zip`) into the `.claude/` directory of any target project, or via the Claude Code plugin system. The source of truth for all components lives in this repository's `core/` tree.

---

## Repository Layout

```
yana-ai/                 ← source of truth
├── core/                      ← all runtime components (canonical)
│   ├── agents/                90 agent definitions
│   ├── commands/              164 slash commands
│   ├── hooks/                 45 runtime hooks
│   ├── skills/                387 workflow skills
│   ├── scripts/               47 utility scripts
│   ├── rules/                 61 operating rules
│   ├── tests/                 826 verification checks (5 test suites)
│   ├── config/                6 runtime config files
│   └── templates/             12 project templates
├── gates/                     Gate specifications (truth_gate.md, action_gate.md)
├── memory/
│   ├── L1_atomic/             Persistent facts (git-tracked, confidence-scored)
│   └── L2_session/            Session facts (gitignored, cleared each session)
├── adapters/                  Cross-engine adapter configs
├── releases/                  Release zip packs
├── prompts/                   system_prompt.md
└── docs/                      Documentation
```

---

## Component Layers

### 1. Source of Truth: `core/`

All runtime assets originate from `core/`. Nothing in `.claude/` is edited directly — it is a build artifact of the source tree.

#### `core/agents/` — 90 specialized agents

Agents are organized by domain:

| Domain | Agents |
|--------|--------|
| Core Development | fullstack-engineer, api-designer, microservices-architect, graphql-architect, websocket-engineer, event-driven-architect, monorepo-architect, api-gateway-engineer |
| Quality Assurance | qa-automation, test-architect, accessibility-specialist, chaos-engineer, compliance-auditor, penetration-tester, code-auditor, qa-expert, debugger, code-reviewer |
| Infrastructure | cloud-architect, devops-engineer, sre-engineer, deployment-engineer, kubernetes-specialist, terraform-engineer, platform-engineer, network-engineer, incident-responder, database-admin, security-engineer, performance-engineer |
| Security | security-auditor, prompt-firewall |
| Data / AI | ai-engineer, ml-engineer, data-engineer, data-scientist, llm-architect, nlp-engineer |
| Business | business-analyst, technical-writer, ux-researcher, scrum-master |
| Orchestration | multi-agent-coordinator, workflow-director, knowledge-synthesizer, task-orchestrator, task-decomposer, planner, spec-planner, spec-executor, spec-verifier |
| Dev Experience | build-engineer, refactoring-specialist, git-workflow-manager, mcp-developer |
| Meta | agent-gardener, agent-organizer, context-synthesizer, verify-agent, build-error-resolver, project-architect, project-manager, release-manager, strategic-analyst, systems-architect |

Agents declared in `core/agents/*.md` follow the Claude Code agent format. They are exported to `.claude/agents/` at runtime.

#### `core/commands/` — 164 slash commands

Slash commands cover the full development lifecycle. Key commands:

| Command | Purpose |
|---------|---------|
| `/verify` | Full health check (git + hooks + tests + drift) |
| `/memory [keyword]` | Search L1 + L2 memory |
| `/risk-scan` | Pre-execution risk analysis |
| `/scope-declare` | Declare file scope before edits |
| `/security-audit` | Security review |
| `/rollback` | List checkpoints and rollback |
| `/handoff` | Generate session handoff |
| `/status` | Project status card |
| `/checkpoint` | Save session snapshot to L1 |
| `/session-trace` | Real-time ASCII session timeline |
| `/cost-report` | Per-tool call counts + circuit breaker state + est. USD |

Commands are Markdown files in `core/commands/`. Each file defines the command behavior, trigger phrases, and output format.

#### `core/hooks/` — 45 runtime hooks

Hooks are shell scripts wired to Claude Code hook events (`PreToolUse`, `PostToolUse`, `Stop`, `UserPromptSubmit`, `PermissionRequest`). They implement the 6-layer gate system.

Full hook list from MANIFEST.json includes:

| Hook | Event | Purpose |
|------|-------|---------|
| `audit-log.sh` | PostToolUse | Log every tool call to hash-chained audit trail |
| `telemetry-sender.sh` | PostToolUse | OpenTelemetry span emission |
| `token-scope-guard.sh` | PreToolUse | Warn on secret/env access |
| `scope-guard.sh` | PreToolUse | Warn on cross-scope writes |
| `tool-validator.sh` | PreToolUse | Block SSRF, path traversal, sensitive file reads |
| `commit-gate.sh` | PreToolUse | Advisory: cross-scope commits |
| `truth-gate-guard.sh` | Stop | Block unsupported success claims |
| `prompt-injection-guard.sh` | PreToolUse | Block identity override, jailbreaks |
| `deploy-gate.sh` | PreToolUse | Block gh/kubectl/docker/gcloud/fly/heroku |
| `supply-chain-guard.sh` | PreToolUse | Block pipe-to-shell, typosquatting |
| `guard-destructive.sh` | PreToolUse | Block `rm -rf`, `DROP TABLE`, `DELETE` without WHERE |
| `db-protect.sh` | PreToolUse | Database destruction guard |
| `api-destruct-guard.sh` | PreToolUse | API key destruction guard |
| `risk-scorer.sh` | PreToolUse | Score action risk 0–100, CRITICAL → exit 2 |
| `token-budget-guard.sh` | PreToolUse | Circuit Breaker (CLOSED→OPEN→HALF-OPEN) |
| `session-checkpoint-hook.sh` | PostToolUse | Auto-checkpoint every N tool calls |
| `confidence-scorer.sh` | PostToolUse | Per-action 0–100 confidence score |
| `intent-inference.sh` | PreToolUse | Scope creep + exfiltration pattern detection |
| `self-healing-hooks.sh` | PostToolUse | Bypass audit + executable integrity check |
| `hook-timeout-guard.sh` | PreToolUse | 30s hard kill + deny on slow hooks |
| `rbac-guard.sh` | PreToolUse | Role-based access control |
| `canary-token-guard.sh` | PreToolUse | Honeypot env var detection |
| `agent-arbitration.sh` | PreToolUse | Scope conflict detection between agents |
| `session-bootstrap.sh` | UserPromptSubmit | Inject L1 facts into every prompt |
| `permission-auto-approve.sh` | PermissionRequest | Auto-approve safe read-only operations |
| `sbom-generator.sh` | PostToolUse | Software Bill of Materials tracking |
| `per-tool-circuit-breaker.sh` | PreToolUse | Per-tool call circuit breaker |

#### `core/scripts/` — 47 utility scripts

Key scripts called by hooks or slash commands:

| Script | Purpose |
|--------|---------|
| `safe-run.sh` | Command blacklist wrapper — L1 pre-execution validator |
| `tool-proxy.sh` | 9-middleware pipeline (inject scan → blast radius → permission → egress → sanitize → PII scrub → size cap → audit) |
| `sandbox-exec.sh` | Runtime isolation (Docker / nsjail / ulimit fallback) |
| `secure-logger.sh` | Append-only Merkle hash-chain audit log |
| `verify-audit-chain.sh` | Chain integrity verification (exit 1 = tamper detected) |
| `model-router.sh` | Prompt → tier routing (fast/power/emergency) |
| `swarm-orchestrator.sh` | Multi-agent orchestration + BFT quorum |
| `session-checkpoint.sh` | Manifest + index + L2 snapshot writer |
| `session-rollback.sh` | Sovereign check + dry-run + L2 restore |
| `add-fact.sh` | Interactive L1 atomic fact writer |
| `add-session-fact.sh` | Non-interactive L2 session fact writer |
| `search-facts.sh` | Keyword + tag L1 search |
| `search-facts-semantic.sh` | TF-IDF cosine semantic search over L1 |
| `sweep-expired-facts.sh` | Archive L1 facts past `expires_at` |
| `drift-check.sh` | Detect task drift, README overclaims, stale L1 facts |
| `switch-engine.sh` | Generate per-engine config (cursor / aider / gemini) |
| `build-release.sh` | Automated release pack builder with pre-flight checks |
| `verify-rules.sh` | Pre-commit gate: rule consistency + path traversal scan |
| `verify-skills-lock.sh` | Skills lock drift detection |

#### `core/rules/` — 61 operating rules

Rules are Markdown files loaded as project instructions into every Claude Code session. They form the behavioral constitution of every agent.

Rules are organized by priority tier (defined in `00-meta-rule-enforcer.md`):

| Tier | Category | Example rules |
|------|----------|---------------|
| 0 | Absolute (human safety) | — (inherited from Anthropic model spec) |
| 1 | Security | `03-privilege-isolation`, `shell-sanitize-law`, `anti-evasion-law`, `49-immutable-infrastructure-law`, `52-secrets-vault-law`, `53-network-egress-whitelist-law` |
| 2 | Correctness | `verification`, `agent-code-constraints`, `fuzz-testing-constraints` |
| 3 | Consistency | `rule-consistency-policy`, `git-workflow-v2`, `memory-persistence-law` |
| 4 | Token optimization | `token-budget-policy`, `60-token-budget-velocity-law` |
| 5 | UI / Design quality | `color-rules`, `typography-rules` |

Notable security rules: `43-prompt-jailbreak-advanced`, `44-supply-chain-vetting`, `54-bft-consensus-law`, `59-honeypot-trap-law`, `61-code-signing-law`, `62-sovereign-overlord-gate-law`, `64-scope-drift-law`.

#### `core/skills/` — 387 workflow skills

Skills are invocable SKILL.md files grouped by domain. They are triggered by `/skill-name` in the Claude Code session. Selected domains:

| Domain | Count | Examples |
|--------|-------|---------|
| Security & Guardrails | 11 | `red-team-check`, `blue-team-fix`, `purple-team-report`, `owasp-llm-top10` |
| AI / Agent Orchestration | 19 | `react-agent-loop`, `multi-agent-debate`, `agenthub`, `rewoo-plan-execute`, `memgpt-virtual-context` |
| Frontend / UI | 21 | `shadcn-patterns`, `nextjs-patterns`, `design-system-gen`, `aesthetic-anchor` |
| ML / LLM Infrastructure | 15 | `vllm-paged-attention`, `llama-cpp-quantization`, `kv-cache-optimization`, `flash-attention-patterns` |
| Distributed Systems | 15 | `raft-consensus-patterns`, `yjs-crdt-sync`, `automerge-crdt`, `etcd-distributed-config` |
| Kubernetes / Cloud-Native | 15 | `k8s-crd-controller`, `argocd-gitops`, `istio-traffic-management`, `helm-chart-packaging` |
| Cryptography / DID | 15 | `ecc-key-management`, `jwt-jws-jwe-patterns`, `merkle-tree-audit`, `zk-proof-patterns` |
| Compiler / Static Analysis | 15 | `babel-ast-transform`, `eslint-rule-engine`, `swc-compiler-transform`, `ts-morph-refactor` |
| Sandbox / Kernel | ~10 | `runtime-sandbox-runc`, `syscall-filtering-seccomp`, `ebpf-syscall-monitoring`, `overlayfs-runtime-isolation` |
| Observability | 4 | `distributed-tracing`, `loki-log-aggregation`, `jaeger-tracing-visualization`, `prometheus-scraping-rules` |

Skills are registered in `core/config/skills-lock.json`. New skills require `verify-skills-lock.sh` to pass before commit.

#### `core/tests/` — 826 verification checks

| Suite | Location | Count |
|-------|----------|-------|
| Hook tests | `core/tests/hooks/run-hook-tests.sh` | 65 |
| Skill trigger tests | `core/tests/skills/test-skill-triggering.sh` | 678 |
| Audit log tests | `core/tests/` | 12 |
| Red-team scenarios | `core/tests/red-team/` | 65 |
| Smoke tests | `core/tests/` | 6 |

---

### 2. Gate System: `gates/`

Two gate specification files define the behavioral contract:

| File | Defines |
|------|---------|
| `gates/truth_gate.md` | L3 Truth Gate: claim verbs requiring proof, evidence patterns, fallback qualifiers |
| `gates/action_gate.md` | L0–L5 Action Gate: risk tier table, bypass vars, enforcement per level |

#### The 6-Layer Gate Stack (L0–L5)

```
L0 — Audit        audit-log.sh, telemetry-sender.sh
                  Every tool call logged with Merkle hash-chain

L1 — Scope        token-scope-guard.sh, scope-guard.sh
                  Warn on secret/env access, cross-scope writes

L1.5 — Validate   tool-validator.sh
                  Block SSRF, path traversal, sensitive file reads

L2 — Commit       commit-gate.sh
                  Advisory: warn on cross-scope commits

L3 — Truth        truth-gate-guard.sh
                  Block unsupported success claims

L3.5 — Inject     prompt-injection-guard.sh
                  Block identity override, jailbreaks, system prompt extraction

L4 — Deploy       deploy-gate.sh
                  Block gh/kubectl/docker/gcloud/fly/heroku

L4.5 — Supply     supply-chain-guard.sh
                  Block pipe-to-shell, typosquatting, URL package installs

L5 — Destructive  guard-destructive.sh, db-protect.sh, api-destruct-guard.sh
                  Block rm -rf, DROP TABLE, DELETE without WHERE
```

Emergency bypass variables: `YANA_DEPLOY_APPROVED=1`, `YANA_SCOPE_OK=1`, `YANA_TRUTH_GATE_BYPASS=1`.

---

### 3. Memory System: `memory/`

Two-tier file-based memory. No network, no server.

```
memory/
├── L1_atomic/     ← Persistent facts
│   ├── SCHEMA.md  ← Field definitions (tag, confidence, expires_at, scope)
│   └── INDEX.md   ← Human-readable index of all L1 facts
└── L2_session/    ← Session facts
    └── SCHEMA.md  ← Field definitions
```

| Property | L1 Atomic | L2 Session |
|----------|-----------|------------|
| Persistence | Permanent, git-tracked | Ephemeral, gitignored |
| Cleared | Never (until `deprecate-fact.sh`) | Each session (`clear-session.sh`) |
| Confidence scoring | Yes (unverified/low/medium/high) | No |
| Expiry | Yes (`expires_at` field, swept by `sweep-expired-facts.sh`) | Auto-cleared |
| Search | `search-facts.sh` (keyword/tag), `search-facts-semantic.sh` (TF-IDF) | `search-session-facts.sh` |
| Write | `add-fact.sh` (interactive), `l1-promote` skill | `add-session-fact.sh` |
| Injected into prompt | Yes, via `session-bootstrap.sh` | No |

---

### 4. Runtime Export: `.claude/`

When the release pack (`yana-ai-vX.Y.Z.zip`) is installed into a target project's `.claude/` directory, it exposes:

```
.claude/
├── agents/        ← from core/agents/
├── commands/      ← from core/commands/
├── hooks/         ← from core/hooks/  (wired via settings.json)
├── skills/        ← from core/skills/
├── scripts/       ← from core/scripts/
├── rules/         ← from core/rules/  (loaded as project instructions)
├── tests/         ← from core/tests/
└── state/         ← runtime state (audit-chain.log, circuit-state.json, risk-scores.jsonl)
```

Hook wiring is configured in `settings.json` inside `.claude/`. Full wiring guide: `docs/HOOK_WIRING.md`.

---

### 5. Plugin Metadata: `.claude-plugin/`

Enables installation via the Claude Code plugin system:

| File | Purpose |
|------|---------|
| `plugin.json` | Schema version, install method (zip), asset counts, entry point |
| `marketplace.json` | Tagline, highlights, stats for plugin marketplace display |

Installation via: `/plugin install yanacuti1121/yana-ai`

---

### 6. Cross-Engine Adapters: `adapters/`

Yana AI gate enforcement is delivered to non-Claude engines via adapter configs generated by `switch-engine.sh`:

| Engine | Adapter | Enforcement tier |
|--------|---------|-----------------|
| Claude Code | Native hooks (L0–L5) | Full runtime blocking |
| Cursor | `.cursor/rules/yana-ai-hard-enforcement.mdc` | Hard enforcement via safe-run.sh proxy |
| Aider | `.aider.conf.yml` + shell proxy | Hard enforcement via shell proxy |
| GitHub Copilot | `.github/copilot-instructions.md` | Advisory via prompt layer |
| Gemini Code | `adapters/gemini-code.md` | Hard enforcement (shipped v1.7.0) |
| Qwen3 | `adapters/qwen.md` | Hard enforcement via Aider/OpenRouter (shipped v1.7.0) |
| DeepSeek V3/R1 | `adapters/deepseek.md` | Hard enforcement via Aider/OpenRouter (shipped v1.7.0) |

`switch-engine.sh <engine>` auto-generates the target engine config from the adapter template.

---

### 7. Public Documentation: `docs/`

| File | Purpose |
|------|---------|
| `docs/SEPARATION.md` | Boundary: Yana AI vs product repos |
| `docs/AGENT_BEHAVIOR.md` | Good vs bad agent behavior examples |
| `docs/HOOK_WIRING.md` | Complete settings.json for all hooks |
| `docs/RUNBOOK.md` | Operational runbook |
| `docs/AUDIT_HARDENING.md` | Merkle hash-chain log integrity guide |
| `docs/MAINTENANCE_POLICY.md` | Release and maintenance policies |
| `docs/CLAUDE_MD_GUIDE.md` | CLAUDE.md architecture for target projects |
| `docs/yana-ai-blackbox-os.md` | Blackbox OS direction document |
| `docs/yana-ai-system-map.html` | Interactive system map |

---

## Tool Proxy Pipeline

Every shell command routed through `tool-proxy.sh` passes a 9-step middleware pipeline:

```
1. injection-scan      Block poisoned tool params (regex + AST)
2. blast-radius        Cap destructive scope (score 0–5; ≥4 blocks without YANA_IRREVERSIBLE_OK)
3. permission-check    Verify agent tier for this tool
4. egress-check        SSRF guard for HTTP tools (BLOCKED_NETWORKS list)
5. schema-validate     Tool schema injection detection
    ── tool executes ──
6. output-sanitize     Wrap result before returning to agent
7. pii-scrub           Remove secrets from result
8. size-cap            Truncate at 16KB to prevent context flooding
9. audit-log           Every tool call logged (L0)
```

---

## Audit Trail Architecture

`secure-logger.sh` writes a Merkle hash-chain log where each entry includes:

```
TIMESTAMP | session=SESSION | commit=GIT_COMMIT | EVENT | MESSAGE | prev=PREV_HASH | hash=THIS_HASH
```

- `hash = SHA-256(TIMESTAMP|SESSION|COMMIT|EVENT|MESSAGE|PREV_HASH)`
- `verify-audit-chain.sh` recomputes the chain; any gap = `CHAIN_BROKEN` → all writes frozen
- Log is append-only; agents cannot delete or truncate entries

---

## Agent Hierarchy

```
Tier 1 — security-team          [VETO POWER — 2× voting weight]
Tier 2 — core-development       [1× voting weight, write access with Tier 1 approval for core/]
Tier 3 — qa-team                [1× voting weight, test runs only]
Tier 4 — docs-team, design-team [advisory, 0.5× voting weight]
```

BFT consensus (54-bft-consensus-law): critical infrastructure writes require ≥3 affirmative votes from agents with trust score ≥60.

---

## Token Budget and Circuit Breaker

`token-budget-guard.sh` implements a three-state circuit breaker:

```
CLOSED (normal)
  → 5 consecutive calls in HARD BLOCK window
OPEN (isolated — no traffic routed)
  → cooldown: 60s (1st), 300s (2nd), 1800s (3rd+)
HALF-OPEN (probe: 1 request allowed)
  → probe success → CLOSED
  → probe fail    → OPEN (reset timer)
```

State persisted in `.claude/state/circuit-state.json`.

`model-router.sh` routes requests by complexity tier:
- **fast** (claude-haiku): <200 input tokens, formatting/list/sort tasks
- **power** (claude-sonnet): ≥800 tokens, implement/refactor/analyze tasks
- **emergency**: explicit human authorization required

---

## Blackbox OS Direction

`docs/yana-ai-blackbox-os.md` defines the long-term architectural direction. **Status: concept-draft, not yet implemented. Roadmap target: v1.9.0+.**

The Blackbox OS adds five modules on top of the current gate layer:

| Module | Purpose | Roadmap |
|--------|---------|---------|
| **Agent Flight Recorder** | Capture replayable session timeline (intent → plan → action → evidence → claim) in `.yana-ai/blackbox/session-*.jsonl` | v1.8.x |
| **Evidence Graph** | Link claims to supporting artifacts; verdict levels: SUPPORTED / PARTIAL / STALE / MISSING / FABRICATED | v1.8.x |
| **Constitution Runtime** | Pre-tool check scripts that BLOCK actions violating behavioral rules at runtime | v1.9.x |
| **Agent Autopsy** | Structured post-mortem for failed sessions; auto-generates new rules and regression tests | v1.9.x |
| **Project Immune System** | Each autopsy generates a rule → rule enters Constitution → same failure is blocked in future sessions | v2.0.x |

The core feedback loop:
```
failure → autopsy → new rule → Constitution Runtime → new gate → new test
                                        ↓
                                next agent blocked
                                before same failure
```

This does not replace the current gate system. It adds a session-recording and learning layer on top of it.

---

## v1.8.0 Adapter Direction

The v1.8.0 milestone extends hard enforcement to all major AI coding engines:

| Engine | Status |
|--------|--------|
| Gemini Code CLI | Adapter shipped v1.7.0; `switch-engine.sh gemini` pending |
| Qwen3 (Aider/OpenRouter) | Adapter + safe-run proxy shipped v1.7.0 |
| DeepSeek V3/R1 (Aider/OpenRouter) | Adapter + safe-run proxy shipped v1.7.0 |
| OpenRouter (universal gateway) | `adapters/openrouter.md` pending |
| Continue.dev (VS Code/JetBrains) | `adapters/continue.md` pending |

Goal: same L0–L5 gate stack, same bypass variables, regardless of which model is running beneath.

---

## What Yana AI Does Not Contain

Per `MANIFEST.json` boundary declaration:

- No product application code
- No product database schema or migrations
- No product UI components
- No environment files or secrets

The engine is model-agnostic, product-agnostic, and installs alongside any codebase without modifying it.

---

## Asset Counts (v1.7.3)

| Asset | Count |
|-------|-------|
| Agents | 90 |
| Slash commands | 164 |
| Runtime hooks | 45 |
| Workflow skills | 387 |
| Operating rules | 61 |
| Utility scripts | 47 |
| Verification checks | 826 |
| Config files | 6 |
| Templates | 12 |

---

*Yana AI v1.7.3 · Apache 2.0 License · Maintained by Vũ Văn Tâm*
