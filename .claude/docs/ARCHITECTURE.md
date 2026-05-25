# YAMTAM ENGINE — Architecture

**Version:** 1.4.20
**Type:** Hook layer — not a service, not a framework.

---

## What YAMTAM is

YAMTAM is a portable pack of bash hooks, scripts, agents, and commands that
you drop into any Claude Code project to constrain what an AI agent can do.
It enforces safety rules at the tool-call level, not at the application level.

It has no server, no daemon, no network calls, no database.
It runs as Claude Code hooks — shell scripts that fire on tool events.

---

## Core Design Constraints

| Constraint | Reason |
|---|---|
| Bash + Python3 only | Must run on any machine with Claude Code — no pip install, no npm |
| No external deps | Hooks degrade gracefully when jq/python3 absent |
| Non-blocking by default | Advisory hooks warn via stdout; only explicit guards block (exit 2) |
| Gitignored state | Session state (`L2_session/`, circuit state) never enters version control |
| YAMTAM ≠ product | Zero coupling to any target project's code or schema |
| Fail closed | When a critical dep is missing, blocking hooks deny (not allow) |

---

## Security Layer Stack (v1.4.20)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SOVEREIGN IDENTITY GATE                              │
│  core/gates/identity-gate.sh                                            │
│  · Tier 0 (GUEST) / Tier 1 (OPERATOR) / Tier 2 (SOVEREIGN)             │
│  · SHA-256 hash verification, case-insensitive, auto-auth from env var  │
│  · YAMTAM_SOVEREIGN_NAME → immediate Tier 2 grant                       │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  L0.5 — COMMAND FIREWALL      core/scripts/safe-run.sh                  │
│                                                                         │
│  BLOCKED_PATTERNS (always deny, all engines):                           │
│    rm -rf · rm -r · git push --force · drop table · truncate ·          │
│    curl | bash · wget | bash · eval.*curl · | bash · | sh · | python    │
│                                                                         │
│  WARN_PATTERNS (advisory for Claude, HARD BLOCK for Cursor/Aider):      │
│    eval · xargs rm · sudo · npm publish · pip install --user --upgrade  │
│                                                                         │
│  ENGINE MODES:                                                          │
│    --engine claude   → advisory (TTY confirm for warn patterns)         │
│    --engine cursor   → HARD_MODE (no TTY, instant deny)                 │
│    --engine aider    → HARD_MODE (no TTY, instant deny)                 │
│    --engine copilot  → advisory (prompt layer only)                     │
│                                                                         │
│  BYPASS: YAMTAM_SAFE_RUN_BYPASS=1 (sovereign only)                      │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  HOOK GATE STACK  (Claude Code PreToolUse / PostToolUse / Stop)         │
│                                                                         │
│  L0 — AUDIT (non-blocking, PostToolUse)                                 │
│    audit-log.sh       — JSONL hash-chain, SHA-256 tamper-evident log    │
│    telemetry-sender.sh — opt-in session telemetry (disabled by default) │
│    log-agent.sh       — agent decision log                              │
│                                                                         │
│  L1 — SCOPE GUARD (advisory, PreToolUse)                                │
│    token-scope-guard.sh — warn on .env / secret / token file access     │
│    scope-guard.sh       — warn on writes to product dirs                │
│    context-gate.sh      — context window budget advisory                │
│    context-gate-log.sh  — logs context gate decisions                   │
│                                                                         │
│  L2 — COMMIT GATE (advisory, PreToolUse)                                │
│    commit-gate.sh  — warn on cross-scope commits (multiple domains)     │
│                                                                         │
│  L3 — TRUTH GATE (non-blocking Stop hook)                               │
│    truth-gate-guard.sh — scans for claim verbs: "done", "passed",       │
│                          "clean", "fixed" without evidence patterns      │
│    session-trust.sh    — tracks trust score 0–100; < 50 = double evidence│
│                                                                         │
│  L4 — DEPLOY GATE (blocking, PreToolUse, exit 2)                        │
│    deploy-gate.sh  — DENY: kubectl · docker push · gh workflow run ·    │
│                      gcloud · fly · heroku; BYPASS: YAMTAM_DEPLOY_APPROVED=1│
│                                                                         │
│  L5 — DESTRUCTIVE GUARD (blocking, PreToolUse, exit 2)                  │
│    guard-destructive.sh  — rm -rf · force push · git reset --hard       │
│    db-protect.sh         — DROP TABLE · TRUNCATE · prisma migrate prod  │
│    api-destruct-guard.sh — DELETE /prod · irreversible API calls        │
│    rbac-guard.sh         — role-based access check (rbac.json)          │
│    cost-guard.sh         — unscoped grep / runaway scan block           │
│                                                                         │
│  ⚡ CIRCUIT BREAKER (PreToolUse, state: CLOSED/OPEN/HALF-OPEN)          │
│    token-budget-guard.sh                                                │
│    · Tracks per-tool call count in circuit-state.json (gitignored)      │
│    · OPEN after 5 consecutive calls without success → HARD BLOCK        │
│    · Escalating cooldown: open_count 1→60s, 2→300s, 3+→1800s           │
│    · Fast-tier: recommends claude-haiku-4-5-20251001 on loop detect     │
│    · BYPASS: YAMTAM_BUDGET_BYPASS=1                                     │
│                                                                         │
│  AUTO-FLOW HOOKS (utility)                                              │
│    auto-qa-trigger.sh        — trigger QA on file writes                │
│    auto-qa-reset.sh          — reset QA state                           │
│    auto-kill-stuck-tasks.sh  — kill runaway background tasks            │
│    format-on-write.sh        — auto-format after writes                 │
│    validate-completion.sh    — gate on task completion signals          │
│    session-bootstrap.sh      — inject L1 facts into session start       │
│    permission-auto-approve.sh— auto-approve whitelisted permission reqs │
│    code-freeze.sh            — block writes during freeze window        │
│    gitnexus-hook.js          — semantic search hook (MCP)               │
│    context-monitor.js        — context window size monitor              │
│    tool-attention.js         — tool usage attention tracker             │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ ✅ ALLOW
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  SOVEREIGN ANTI-TAMPER LAYER  (v1.4.00+)                                 │
│                                                                          │
│  anti-graffiti-guard.js   — phantom edit detection (file hash monitor)  │
│  sovereign-interceptor.js — sovereign command override detection        │
│  tool-proxy.sh            — OverlayFS sandbox + 429/503 rate-limit      │
│                             backoff+jitter (Phase 3.5)                  │
└──────────────────────────────────────────────────────────────────────────┘

```

---

## Cross-Engine Adapter Architecture

YAMTAM natively targets Claude Code. Adapters extend governance to other engines:

```
Claude Code ──── settings.json hooks ─────────────────► Runtime blocking (L0–L5)
                                                          Native hook API
Cursor ──────── .cursorrules (legacy) ────────────────► Advisory (context)
             └─ .cursor/rules/yamtam-security.mdc ───► Advisory (MDC)
             └─ .cursor/rules/yamtam-hard-enforcement.mdc
                  bash core/scripts/safe-run.sh --engine cursor
                  → HARD BLOCK on blocked/warn patterns, no TTY      ► Hard enforcement

Aider ───────── adapters/aider.md (--system-prompt) ──► Advisory (prompt)
             └─ .aider.conf.yml
                  shell: bash core/scripts/safe-run.sh --engine aider
                  → HARD BLOCK, read-only gates on core/             ► Hard enforcement

Copilot ─────── .github/copilot-instructions.md ──────► Advisory (prompt layer)
```

**Switch engine:**
```bash
bash core/scripts/switch-engine.sh cursor   # generates MDC + hard enforcement
bash core/scripts/switch-engine.sh aider    # generates .aider.conf.yml
bash core/scripts/switch-engine.sh claude   # reset to native hooks
bash core/scripts/switch-engine.sh status   # show current adapter state
```

---

## Memory Architecture

```
L1 Atomic  — git-tracked markdown files in memory/L1_atomic/
             Each fact: id, statement, confidence, scope, tags, expires_at
             Add:    bash core/scripts/add-fact.sh
             Search: bash core/scripts/search-facts.sh [keyword] [--tag TAG]

L2 Session — gitignored markdown in memory/L2_session/
             Each fact: id, statement, source (agent/user), timestamp
             Add:    bash core/scripts/add-session-fact.sh <statement>
             Search: bash core/scripts/search-session-facts.sh [keyword]
             Clear:  bash core/scripts/clear-session.sh --force

             Also holds runtime state (gitignored):
               token-budget.json  — per-tool token counters
               circuit-state.json — circuit breaker OPEN/CLOSED/HALF-OPEN
               session-trust.json — trust score 0–100

L3 Truth Gate — not a memory tier; enforced by truth-gate-guard.sh (Stop hook)
                Scans for unsupported claim verbs at session end

L3/L4 tiers   — deliberately not implemented (see .out-of-scope/)
```

---

## Hook Execution Model

Claude Code calls hooks via stdin/stdout:

```
Claude Code → fork → bash hook.sh
                      ├─ reads JSON from stdin  (tool_name, tool_input, …)
                      ├─ exit 0                → allow (no output)
                      ├─ exit 0 + stdout       → allow + show advisory to Claude
                      └─ JSON to stdout + exit 2 → block tool call
                            {
                              "hookSpecificOutput": {
                                "hookEventName": "PreToolUse",
                                "permissionDecision": "deny",
                                "permissionDecisionReason": "reason string"
                              }
                            }
```

`Stop` hooks receive a transcript path instead of tool JSON.
All hooks use `set -uo pipefail`. Missing deps → graceful degradation (exit 0).

---

## Security Rules (58 rules, v1.4.20)

Rules are markdown files in `core/rules/` that constrain agent behavior.
They are injected into the agent's context, not executed as code.

Key rules by category:

| Category | Rules |
|---|---|
| Meta / enforcement | 00-meta-rule-enforcer, rule-consistency-policy, execution-environment |
| Privilege / isolation | 03-privilege-isolation, 04-sandbox-isolation-law, sovereign-runtime-law |
| Prompt security | prompt-jailbreak-guard, **43-prompt-jailbreak-advanced**, anti-evasion-law |
| Supply chain | **44-supply-chain-vetting**, dependency-vetting-law, slsa-artifact-law |
| Network / egress | network-egress-law, **53-network-egress-whitelist-law** |
| Secrets | secrets-vault-law, env-integrity-policy |
| Token / cost | token-budget-policy, **60-token-budget-velocity-law** |
| Sovereign control | **62-sovereign-overlord-gate-law**, human-gate-policy |
| Agent behavior | agent-excessive-agency-law, agent-hierarchy-law, subagent-policy |
| Infra | container-hardening-law, **49-immutable-infrastructure-law** |
| Reliability | **56-circuit-breaker-law**, **57-canary-deployment-law** |
| Observability | **55-observability-telemetry-law** |
| Security | shell-sanitize-law, api-security-gate, owasp-llm-output-law |

**Bold** = added in v1.4.00–v1.4.20.

---

## Agent Routing

87 agents in `core/agents/` (root + domain subfolders). Routing:

1. `core/agents/tool-router.md` — routes query type → specialist agent
2. `core/config/agent-routing-map.json` — machine-readable routing rules
3. V10 Routing Discipline — never route the same agent for impl + verify

| Query type | Agent | Tools allowed |
|---|---|---|
| code review | qa-engineer | Read, Grep, git log |
| security audit | prompt-firewall | Read, Grep |
| docs / research | documentation-writer | Read, WebFetch |
| DB / schema | database-expert | Read, Glob |
| infra / deploy | cicd-engineer | Read, Glob |
| red-team | quality-assurance/penetration-tester | Read, Grep |

---

## Release Process

```bash
bash core/scripts/build-release.sh
  1. Syntax check all .sh files (bash -n)
  2. Run core/tests/hooks/run-hook-tests.sh       (65 tests, must PASS)
  3. Run core/scripts/drift-check.sh              (must be CLEAN)
  4. Zip: core/ memory/ gates/ prompts/ docs/ → releases/yamtam-engine-vX.Y.Z-fixed.zip
  5. Symlink: releases/yamtam-engine-latest.zip → new zip

# Tag and release
git tag vX.Y.Z && git push origin vX.Y.Z
gh release create vX.Y.Z releases/yamtam-engine-vX.Y.Z-fixed.zip
```

GitHub Actions (`.github/workflows/release.yml`) auto-runs on semver tag push
when Actions budget is available.

---

## What YAMTAM Does NOT Do

- No LLM calls of its own
- No HTTP requests (telemetry-sender.sh is opt-in, disabled by default)
- No database reads or writes
- No modification of target project's application code
- No changes to git history or branch state
- No global npm/pip installs

See `.out-of-scope/` for features explicitly excluded with rationale.
