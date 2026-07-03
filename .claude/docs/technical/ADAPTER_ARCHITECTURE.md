# Yana AI — Multi-Engine Adapter Architecture

**Version:** v1.8.0  
**Status:** Design document — architecture only, no implementation yet  
**Maintainer:** Vũ Văn Tâm  
**Created:** 2026-05-25  
**Companion doc:** [`docs/technical/ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Problem Statement

Yana AI's safety and governance layer is implemented natively for Claude Code via runtime hooks (`PreToolUse`, `PostToolUse`, `Stop`). These hooks enforce the 6-layer gate stack (L0–L5) at the shell level — blocking destructive commands, detecting prompt injection, enforcing token budgets, and writing append-only audit logs.

The problem is fragmentation. Development teams use multiple AI coding engines depending on the task, cost, or model capability:

- **Claude Code** — full-featured agent sessions
- **Cursor** — IDE-embedded inline completions and edits
- **Aider** — terminal-first, supports any model via OpenRouter
- **Gemini Code CLI** — Google's agent with its own execution model
- **Qwen3 via OpenRouter** — high-context code models at lower cost

Each engine has a different hook/plugin model. Without a common adapter layer, each switch means:

1. Safety rules become inconsistent — some engines run without governance
2. Audit trail breaks — engine-specific sessions are invisible to the Merkle log
3. Team members get different enforcement depending on which tool they pick up
4. Secret hygiene and blast-radius controls are only as strong as the weakest engine

The v1.8.0 adapter architecture solves this by establishing a **single safety kernel** that all engines surface through, regardless of their native plugin model.

---

## 2. Adapter Goals

| # | Goal | Metric |
|---|------|--------|
| G1 | One safety layer, all engines | Same L0–L5 gate stack regardless of engine |
| G2 | Consistent audit trail | Every tool call logged to the same Merkle chain |
| G3 | Engine switch in < 30 seconds | `switch-engine.sh <engine>` generates all config |
| G4 | No secrets in generated configs | Adapter files contain zero credentials |
| G5 | Blackbox OS records every switch | Engine changes are auditable events |
| G6 | Enforcement parity declaration | Honest enforcement tier per engine (not false equivalence) |
| G7 | Single point of truth | Core rules in `core/rules/` are the source; adapters consume them |

**What "enforcement parity" means:** Claude Code achieves runtime blocking (shells commands are intercepted). Other engines achieve behavioral enforcement (model receives rules in prompt/config). The adapter layer must clearly declare which tier applies. No adapter should claim stronger enforcement than it actually provides.

---

## 3. Architecture Overview

```
                    ┌─────────────────────────────────┐
                    │      core/rules/ (61 rules)     │
                    │      core/hooks/ (45 hooks)      │
                    │      core/scripts/safe-run.sh   │
                    └──────────────┬──────────────────┘
                                   │  single source of truth
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
    ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
    │  Native Engine   │  │  Prompt-Layer    │  │  Shell-Proxy     │
    │  (Claude Code)   │  │  Engines         │  │  Engines         │
    │                  │  │                  │  │                  │
    │  .claude/hooks/  │  │  Cursor          │  │  Aider           │
    │  Runtime block   │  │  Gemini Code     │  │  Qwen3           │
    │  Merkle audit    │  │  Claude Code     │  │  OpenRouter      │
    │  Full L0–L5      │  │  (advisory)      │  │  safe-run proxy  │
    └──────────────────┘  └──────────────────┘  └──────────────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Blackbox OS: Flight        │
                    │   Recorder layer             │
                    │   engine-switch events       │
                    │   session continuity log     │
                    └─────────────────────────────┘
```

---

## 4. Supported Engines

| Engine | Adapter file | Hook model | Enforcement tier | `switch-engine.sh` arg |
|--------|-------------|------------|-----------------|------------------------|
| **Claude Code** | Native (no adapter file) | Runtime hooks (`PreToolUse`, `PostToolUse`, `Stop`) | **Full — L0–L5 runtime blocking** | `claude` |
| **Cursor** | `.cursorrules` + `.cursor/rules/yana-ai-hard-enforcement.mdc` | Cursor rules file (prompt-injected per edit) | **Advisory + safe-run proxy for bash commands** | `cursor` |
| **Aider (Claude backend)** | `adapters/aider.md` | `--system-prompt` flag | **Advisory via system prompt** | `aider` |
| **Aider + OpenRouter (Qwen3)** | `adapters/qwen.md` | `--system-prompt` flag + OpenRouter routing | **Advisory via system prompt** | `qwen` |
| **Aider + OpenRouter (DeepSeek)** | `adapters/deepseek.md` | `--system-prompt` flag + OpenRouter routing | **Advisory via system prompt** | `deepseek` |
| **Gemini Code CLI** | `adapters/gemini-code.md` → `GEMINI.md` | Gemini project instructions file | **Advisory via GEMINI.md** | `gemini` |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Copilot custom instructions | **Advisory via instructions file** | `copilot` |

### Enforcement Tier Definitions

```
FULL      — Yana AI hooks intercept every tool call at the OS level.
            Dangerous commands are BLOCKED before execution.
            Bypass requires explicit env var (YANA_SCOPE_OK=1, etc.)

ADVISORY  — Yana AI rules are delivered to the model in its system prompt
            or config file. The model is asked to follow them.
            No shell-level interception. Enforcement depends on model compliance.

PROXY     — Shell commands are wrapped with safe-run.sh.
            Yana AI gates run as a pre-execution wrapper around the model's
            bash calls. Stronger than advisory; weaker than native hooks
            because only bash tool calls are wrapped.
```

---

## 5. Config Generation Flow: `switch-engine.sh`

`switch-engine.sh` is the single entry point for activating any engine adapter. It reads from `core/` (the source of truth) and writes only to the target engine's config surface.

### Flow Diagram

```
bash core/scripts/switch-engine.sh <engine>
            │
            ▼
  ┌─────────────────────┐
  │  1. Validate engine │  Unknown engine → print usage, exit 1
  │     argument        │
  └────────┬────────────┘
           │
           ▼
  ┌─────────────────────┐
  │  2. Read source     │  core/rules/*.md, core/scripts/safe-run.sh,
  │     of truth        │  adapters/<engine>.md (template)
  └────────┬────────────┘
           │
           ▼
  ┌─────────────────────┐
  │  3. Generate        │  Write engine-specific config:
  │     target config   │  Cursor   → .cursor/rules/yana-ai-hard-enforcement.mdc
  │                     │  Gemini   → GEMINI.md
  │                     │  Aider    → print CLI command
  │                     │  Qwen3    → print CLI command (OpenRouter URL)
  │                     │  Claude   → confirm hooks active
  └────────┬────────────┘
           │
           ▼
  ┌─────────────────────┐
  │  4. Emit Blackbox   │  Write engine-switch event to audit log:
  │     OS event        │  secure-logger.sh engine_switch "from=X to=<engine>"
  └────────┬────────────┘
           │
           ▼
  ┌─────────────────────┐
  │  5. Print           │  Enforcement tier declaration:
  │     enforcement     │  "Engine: cursor | Enforcement: ADVISORY + PROXY"
  │     summary         │  "Active rules: core/rules/*.md (61 rules)"
  └─────────────────────┘
```

### Rule Mapping: What Each Adapter Carries

Every adapter must carry these minimum rule categories, regardless of enforcement tier:

| Rule category | Source file | Carried by |
|---|---|---|
| Destructive command prohibition | `02-terminal-validator.md` | All adapters |
| Secret hygiene | `03-privilege-isolation.md`, `security.md` | All adapters |
| Git push gate | `git-push-enforcement.md` | All adapters |
| Evidence-first policy | `verification.md`, `golden-principles.md` | All adapters |
| Code constraints (50-line / 5-param) | `agent-code-constraints.md` | All adapters |
| Prompt injection defense | `prompt-jailbreak-guard.md` | All adapters |
| Scope drift prevention | `64-scope-drift-law.md` | All adapters |

Rules that are **only enforced on Claude Code** (not feasible in prompt-layer adapters):

| Rule | Why Claude-only |
|---|---|
| Merkle audit log | Requires `secure-logger.sh` PostToolUse hook |
| Circuit breaker | Requires `token-budget-guard.sh` state file |
| Infra-write review (54-bft-consensus-law) | Requires Task-tool synchronous subagent dispatch |
| Honeypot trap (59-honeypot-trap-law) | Requires inotify + PreToolUse interception |
| Sandbox isolation (04-sandbox-isolation-law) | Requires Docker / nsjail wrapper |

---

## 6. Risk Controls

### 6.1 Enforcement Tier Transparency

**Risk:** A team switches to Aider + Qwen3 believing they have the same protection as Claude Code native hooks.

**Control:** `switch-engine.sh` prints an explicit enforcement summary on every invocation:

```
Engine    : qwen (Aider + OpenRouter)
Tier      : ADVISORY
Blocking  : None — model compliance only
Audit     : Not connected to Merkle chain
Safe-run  : Manual — wrap bash calls with: bash core/scripts/safe-run.sh <cmd>
Warning   : Advisory adapters enforce governance via prompt, not OS hooks.
            For production work, use Claude Code (native hooks) or wrap
            all bash calls through safe-run.sh.
```

### 6.2 No Secrets in Adapter Files

Adapter files (`adapters/*.md`, `.cursorrules`, `GEMINI.md`, `.github/copilot-instructions.md`) are committed to the repository. They must never contain:

- API keys or tokens
- OpenRouter API credentials
- Database connection strings
- Any value matching secret patterns from `52-secrets-vault-law.md`

`switch-engine.sh` generates config that references environment variables by name only:

```bash
# ✅ Generated config — references env var, not value
OPENROUTER_API_KEY is read from environment: $OPENROUTER_API_KEY

# ❌ Forbidden in any adapter file
OPENROUTER_API_KEY=sk-or-v1-abc123...
```

`verify-rules.sh` includes a scan of `adapters/` for secret patterns before every commit.

### 6.3 Adapter File Immutability

Adapter files generated by `switch-engine.sh` must not be hand-edited. They are build artifacts. If a rule changes in `core/rules/`, the adapter is regenerated via `switch-engine.sh --regen`.

The `49-immutable-infrastructure-law.md` treats `adapters/` as protected: direct edits without regeneration are flagged by `verify-rules.sh`.

### 6.4 OpenRouter Routing Security

When routing through OpenRouter (Qwen3, DeepSeek), the adapter carries:

- `--no-auto-commits` flag to prevent Aider from committing without Yana AI gates
- Instruction to use `bash core/scripts/safe-run.sh` for all shell commands
- Explicit prohibition on `--yes` auto-approve mode

OpenRouter API key is never stored in the adapter file; it is read from `$OPENROUTER_API_KEY` at runtime.

### 6.5 Cursor `.mdc` Rule Injection

Cursor rules in `.cursor/rules/yana-ai-hard-enforcement.mdc` use `alwaysApply: true`. This means the rule is injected into every Cursor context, not just on explicit invocation. The rule instructs Cursor to wrap bash commands through `safe-run.sh`.

This is the strongest non-native enforcement available for Cursor. It does not intercept at the OS level, but it puts the proxy instruction directly in the model's context on every prompt.

---

## 7. How Blackbox OS Records Engine Switches

The Blackbox OS flight recorder (roadmap target v1.8.x) treats engine switches as first-class auditable events.

### 7.1 Engine Switch Event Schema

Every `switch-engine.sh` invocation writes to the Merkle audit chain via `secure-logger.sh`:

```
EVENT: engine_switch
PAYLOAD:
  from_engine: <previous engine or "unknown">
  to_engine:   <new engine>
  enforcement: <FULL | ADVISORY | PROXY>
  timestamp:   <ISO-8601 UTC>
  git_commit:  <current HEAD SHA>
  operator:    <git user.name from config>
```

This event is chained into the same hash-linked log as tool calls, gate blocks, and checkpoint snapshots. It is **not a separate log** — it lives in `core/memory/audit/agent-actions.log` alongside all other events.

### 7.2 Session Continuity Across Engine Switches

When a developer switches engines mid-task (e.g., from Claude Code to Aider for a long refactor), the Blackbox OS maintains session continuity:

1. `session-checkpoint.sh` is called automatically by `switch-engine.sh` before the switch
2. The checkpoint writes current task state to L2 session memory
3. The new engine's adapter config includes a reference to the L2 session state file
4. When the developer returns to Claude Code, `session-bootstrap.sh` restores L2 context

```
Task in progress (Claude Code native)
        │
        ▼
switch-engine.sh qwen
        │
        ├─ session-checkpoint.sh → writes L2 snapshot
        ├─ secure-logger.sh engine_switch "from=claude to=qwen"
        └─ generates adapters/qwen.md + prints CLI command
        │
        ▼
Work continues in Aider + Qwen3 (ADVISORY tier)
        │
        ▼
switch-engine.sh claude
        │
        ├─ secure-logger.sh engine_switch "from=qwen to=claude"
        └─ session-bootstrap.sh restores L2 context on next prompt
```

### 7.3 Audit Trail Integrity for Non-Native Engines

For ADVISORY-tier engines (Aider, Gemini, Qwen3), the model's actions are not directly observable by Yana AI hooks. The audit trail records the engine switch event but cannot record individual tool calls made by the external engine.

This gap is declared explicitly in the audit log:

```
ENGINE_SWITCH | to=qwen | ADVISORY_GAP_START
  Note: tool calls made in this engine are not in Yana AI audit trail.
  Session ends when switch-engine.sh returns to a native engine.
ENGINE_SWITCH | to=claude | ADVISORY_GAP_END | gap_duration=<seconds>
```

The `ADVISORY_GAP` entries are included in the hash chain so the gap itself is auditable (it cannot be silently erased).

---

## 8. v1.8.0 Roadmap Checklist

### Phase 1: Switch-engine.sh Enhancement

- [ ] Add `gemini` case to `switch-engine.sh` (currently documented but not wired)
- [ ] Add `qwen` case to `switch-engine.sh`
- [ ] Add `deepseek` case to `switch-engine.sh`
- [ ] Add `openrouter` case (universal gateway) to `switch-engine.sh`
- [ ] Add `--regen` flag to regenerate adapter without switching
- [ ] Add `--dry-run` flag to preview config changes before writing
- [ ] Emit `engine_switch` event via `secure-logger.sh` on every invocation
- [ ] Print enforcement tier summary on every `switch-engine.sh` call
- [ ] Call `session-checkpoint.sh` before switching away from native engine

### Phase 2: Adapter File Completeness

- [ ] `adapters/gemini-code.md` — verify rule coverage against v1.7.3 rule set
- [ ] `adapters/qwen.md` — verify rule coverage, add OpenRouter routing instructions
- [ ] `adapters/aider.md` — add `--no-auto-commits` requirement
- [ ] `adapters/deepseek.md` — add safe-run proxy instruction
- [ ] `adapters/openrouter.md` — create universal OpenRouter gateway adapter
- [ ] `adapters/continue.md` — create Continue.dev (VS Code/JetBrains) adapter
- [ ] All adapter files: verify zero secrets via `verify-rules.sh` scan

### Phase 3: Blackbox OS Engine Switch Events

- [ ] Add `ENGINE_SWITCH` event type to `secure-logger.sh`
- [ ] Add `ADVISORY_GAP_START` / `ADVISORY_GAP_END` event types
- [ ] Update `verify-audit-chain.sh` to handle new event types
- [ ] Wire `session-checkpoint.sh` call into `switch-engine.sh` pre-switch
- [ ] Document session continuity in `docs/RUNBOOK.md`

### Phase 4: Verification and Tests

- [ ] Add `switch-engine-tests.sh` to `core/tests/` (min 6 test cases)
- [ ] Test: each engine case generates correct config file
- [ ] Test: no secrets in generated configs (scan for key patterns)
- [ ] Test: `engine_switch` event written to audit log
- [ ] Test: `--dry-run` produces output without writing files
- [ ] Test: `verify-rules.sh` blocks direct edits to adapter files
- [ ] Update `MANIFEST.json` asset counts after new tests are added

### Phase 5: Documentation

- [ ] Update `adapters/README.md` with new engines and enforcement tier table
- [ ] Update `docs/technical/ARCHITECTURE.md` — v1.8.0 adapter section
- [ ] Add `switch-engine.sh` usage examples to `docs/RUNBOOK.md`
- [ ] Add enforcement tier warning to `docs/LIMITATIONS.md`

---

## 9. What Does Not Change in v1.8.0

The following are **out of scope** for the adapter layer and will not be changed:

- Core rule files (`core/rules/*.md`) — adapters consume rules, never modify them
- Gate specifications (`gates/truth_gate.md`, `gates/action_gate.md`)
- Hook implementations (`core/hooks/*.sh`) — native Claude Code enforcement
- L1 memory schema — adapters do not write to L1
- `MANIFEST.json` version bump process — follows existing release process
- Blackbox OS modules (Constitution Runtime, Agent Autopsy, Evidence Graph) — roadmap v1.9.x+

---

## 10. Open Questions for v1.8.0 Design Review

| Question | Decision needed |
|---|---|
| Should Cursor get a shell-level proxy (not just `.mdc` advisory)? | Requires Cursor extension API review |
| Can Gemini Code CLI be wrapped with `safe-run.sh` at the process level? | Depends on Gemini CLI's subprocess model |
| Should `switch-engine.sh` require `YANA_SCOPE_OK=1` before writing adapter files? | Balances usability vs. protection of adapter files |
| Is Continue.dev in scope for v1.8.0 or pushed to v1.9.0? | Scope decision needed |
| Should ADVISORY-tier adapters include a timestamp/session ID in the system prompt to correlate with audit log? | Privacy and token cost tradeoff |

---

*Yana AI v1.8.0 Design · Apache 2.0 License · Vũ Văn Tâm*
