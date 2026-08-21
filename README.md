<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/yana-banner-dark.svg">
    <img src="docs/yana-banner-light.svg" alt="Yana AI" width="760">
  </picture>
</p>

<p align="center">
  <a href="README.md"><strong>English</strong></a> ·
  <a href="README.vi.md">Tiếng Việt</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.zh.md">中文</a>
</p>

<h1 align="center">Yana AI 🐰</h1>

<p align="center"><strong>One runtime. Any AI. Human-governed.</strong></p>

<p align="center">
  <strong>A local-first, cross-platform system for running, connecting, orchestrating, and governing AI — with deterministic control over what it can access, change, and execute.</strong>
</p>

<p align="center"><em>Your AI can act. But who decides how far it can go?</em></p>

<p align="center">
  <a href="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml"><img src="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://crates.io/crates/yana-rt"><img src="https://img.shields.io/crates/v/yana-rt?logo=rust&color=ce422b" alt="yana-rt on crates.io"></a>
  <a href="https://pypi.org/project/yana-ai/"><img src="https://img.shields.io/pypi/v/yana-ai?logo=pypi&color=3775a9" alt="yana-ai on PyPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-2563eb" alt="Apache 2.0 license"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-2e8b75" alt="Contributions welcome"></a>
</p>

<p align="center"><em>Created by Vũ Văn Tâm · Vietnam</em></p>

---

## AI is gaining agency. Governance has not caught up.

A model can now inspect a repository, edit files, run commands, launch agents, call tools, and prepare a release. The difficult questions are no longer only about intelligence:

- Can one runtime connect local models, cloud models, and coding agents without locking the project to one vendor?
- Can every interface share the same capability boundary instead of inventing its own safety behavior?
- Can the system distinguish routine automation from actions that must remain human-only?
- Can a developer inspect the evidence behind “safe,” “done,” “blocked,” or “approved”?
- Can one independent control plane halt every agent when project integrity is uncertain?

**Yana AI exists to make those questions executable.**

It is not another foundation model and it does not replace Claude, Codex, Cursor, Ollama, or your preferred runtime. It connects them to a native execution layer, deterministic policy gates, project memory, orchestration primitives, and a human-governed operating plane.

## Choose your first win

<table>
<tr>
<td width="33%" valign="top">

### Run local AI

Launch the Rust terminal workspace with a local provider.

```bash
cargo install yana-rt
yana-ai-rt --provider ollama
```

Streaming, cancellation, tabs, sessions, model switching, and guarded tools.

</td>
<td width="33%" valign="top">

### Govern a repository

Apply Yana's supported adapter surfaces to an existing project.

```bash
pip install yana-ai
cd your-project
yana-ai install
yana-ai doctor .
```

Rules, hooks, agents, skills, commands, and integrity checks stay project-local.

</td>
<td width="33%" valign="top">

### Orchestrate work

Route work and create dependency-aware missions through the native runtime.

```bash
yana-rt route classify "fix auth"
yana-rt mission create "add-auth"
```

Use evidence, capability, memory, workspace, and OS controls from the same CLI.

</td>
</tr>
</table>

> New here? Start with [Quick install](#quick-install). Building a platform? Read the [architecture reference](docs/reference/architecture.md). Evaluating the safety boundary? Read [Known limitations](#known-limitations) before the feature list.

## What Yana unifies

| Layer | Developer value | Primary surfaces |
| --- | --- | --- |
| **Runtime** | Native chat, state, routing, health, and project operations | `yana-rt`, `yana-ai-rt` |
| **Models** | Local-first operation without excluding cloud providers | Ollama, LM Studio, llama.cpp, Anthropic, OpenAI, Kimi |
| **Adapters** | One governed project contract across supported harnesses | Claude Code, Codex, Cursor, Antigravity |
| **Orchestration** | Tasks, missions, memory, evidence, workspaces | router, mission dispatcher, event bus |
| **Governance** | Deterministic checks, audit chain, quarantine, HALT, human gates | capabilities, hooks, Yana OS, Giám Thị |

```text
 Local models        Cloud models         Coding agents
 Ollama              Anthropic            Claude Code
 LM Studio           OpenAI / Kimi        Codex / Cursor / Antigravity
 llama.cpp                 │                       │
        └──────────────────┴───────────────────────┘
                               │
                        Provider + adapters
                               │
                         yana-rt runtime
                 chat · capabilities · missions · memory
                               │
                    deterministic policy gates
                               │
                       Yana OS + Giám Thị
               HALT · quarantine · receipts · human unlock
                               │
                 files · Git · processes · network · tools
```

Model intelligence may propose an action. Deterministic code and human authority decide whether it may happen.

## See governance act

Your agent tries something dangerous. Yana intercepts it, explains why, and logs it — hard-blocking on Claude Code and Cursor, advisory guidance on Codex and Antigravity.

```bash
pip install yana-ai && yana-ai install   # wire the hooks (60 seconds)
```

> **Known issue, fixed 2026-07-25:** old PyPI installs of `yana-rt` could self-recurse and spike CPU to 100% — see [CHANGELOG.md](CHANGELOG.md) for the incident writeup. `pip install -U yana-ai` (or `cargo install yana-rt`, never affected) resolves it.

Then ask your agent to misbehave, and watch.

<p align="center">
  <img src="docs/assets/demo.gif" alt="Yana AI blocking a force-push, an rm -rf, and a disguised python3 -c inline-script destructive command in real time, entirely locally with no LLM call" width="700" />
</p>

Every example below is copy-pasted from a real, live-tested run of `core/hooks/guard-destructive.sh` on 2026-07-04, not aspirational copy (see [Known Limitations](docs/reference/known-limitations.md) for what this guard does not yet catch):

```bash
# Agent tries: git push --force origin main
Blocked: 'git push --force' (any flag spelling) is not allowed. The
orchestrator pushes branches; force-pushing risks overwriting shared history.

# Agent tries: rm -rf /some/path
Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible.
Use targeted 'rm' with explicit paths, or ask the human to confirm first.

# Agent tries: git clean -f
Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked
files. Ask the human to confirm before running this.
```

That is the whole pitch: deterministic rules, runs locally, no LLM in the decision path, nothing leaves your machine.

---

## The problem

AI coding agents make mistakes. They `rm -rf` the wrong directory. They push force to main. They hallucinate test results. By the time you notice, the damage is done.

Yana AI sits between the agent and your system: every risky tool call passes through a chain of deterministic checks before execution.

---

## What it catches

Destructive git operations, `rm` outside the workspace, piping the internet into bash, and unvetted package installs, via agent hooks backed by a Rust runtime (`yana-rt`).

---

## How it works

```
Agent wants to run a command
         ↓
Anti-evasion scan      — blocks base64 decode+exec, pipe-to-shell interpreters
Shell sanitization     — quotes all variables, strips shell metacharacters
Egress / SSRF policy   — implementation available; runtime wiring varies
Supply-chain vetting   — implementation available; runtime wiring varies
Blast-radius cap       — caps how many files/what scope a destructive command can touch
Tamper-evident audit log — every allowed AND blocked action logged, hash-chained
Human gate             — irreversible actions (push, publish, delete) require explicit confirmation
         ↓
Execute (or block + log)
```

See [Known Limitations](docs/reference/known-limitations.md) for exactly which of these are live, wired hooks today versus documented policy an agent applies by convention, verified directly against the code rather than the docs describing it.

---

## Quick install

**→ [pip install](https://pypi.org/project/yana-ai/)** — `pip install yana-ai`

> **Note (2026-07-30): not distributed via npm.** Yana AI is not, and is
> no longer planned to be, published to the npm registry — see
> [VERSIONING.md](VERSIONING.md#why-product-has-no-registry) for the
> full history. Use `pip` or `cargo` below.

```bash
# Python CLI — installs the yana-ai command
pip install yana-ai
yana-ai install                # installs Claude + Codex capability surfaces
yana-ai install --engine codex # install only the Codex surfaces

# Rust runtime (up to ~12x faster on bounded commands — see BENCHMARK.md)
cargo install yana-rt
```

```bash
# Verify everything is wired
yana-ai doctor .
```

`yana-ai install` uses the Python package directly; Node/npm is not required.
It preserves an existing `AGENTS.md` and synchronizes all 101 canonical agents,
2,025 skills, 170 commands, and the project hook files from `core/`.

### Requirements

- Python 3.11+ (for the pip package) or Rust/Cargo (for `cargo install yana-rt`)
- Git
- One of the 4 supported harnesses: [Claude Code](https://claude.ai/code), Cursor, Codex, or Antigravity — see [Multi-harness support](#multi-harness-support) below. Other tools aren't wired yet; adding one means writing a real adapter, not just claiming support.

### Clone from source instead

```bash
git clone https://github.com/yanacuti1121/yana-ai.git
cd yana-ai
npm install
bash install.sh                 # copies hooks + config into your project
yana-ai doctor                  # verify
```

---

## Multi-harness support

Yana AI adapts to whichever tool you use:

```bash
bash core/scripts/switch-engine.sh cursor      # .cursorrules + real beforeShellExecution hook
bash core/scripts/switch-engine.sh codex       # AGENTS.md
bash core/scripts/switch-engine.sh antigravity # .agent/rules/yana-ai.md
bash core/scripts/switch-engine.sh status      # check all 4 adapters
```

---

## Rust runtime — `yana-rt`

34 subcommands. Zero Python dependency.

```bash
yana-ai chat                          # interactive chat REPL — cloud (Anthropic/OpenAI) or local (Ollama)
yana-ai audit .                       # security scan — secrets, CVEs, supply chain risks
yana-ai graph .                       # knowledge graph — file deps, import resolution
yana-ai vault search Q                # search 2,025 skills by keyword
yana-ai hunt .                        # hunt for security patterns (OWASP, injection, SSRF)
yana-ai fix .                         # auto-fix rule violations
yana-ai doctor .                      # full system health check
yana-ai map .                         # blast radius map — what can the agent touch?
yana-ai ci                            # run all gate checks (used in CI)
yana-ai route classify "fix auth bug" # classify task → simple/complex/external
yana-ai mission create "add-auth"     # create parallel agent mission
```

**Benchmark** (measured 2026-07-23, full methodology in `BENCHMARK.md`):
bounded commands like `doctor`/`ci` are ~2–12x faster than Python
(startup-dominated); a full-repo `scan` converges to ~1.1x at 19k files
(work-dominated, not startup-dominated at that scale). The `1256x` figure
this line used to claim was already found unverified once
(2026-05-31, commit `fb6a0cd7`) and regressed back in by an unrelated
README restore (2026-07-07) — not reproducible by any measurement in
`BENCHMARK.md`, then or now.

---

## Safety architecture

```
core/
├── hooks/          # 63 PreToolUse / PostToolUse / Stop hooks
├── rules/          # 71 enforced rules (security, correctness, UI, git)
├── scripts/        # safe-run.sh, verify-core-lock.sh, secure-logger.sh
├── gates/          # truth_gate.md, action_gate.md
├── agents/         # 101 specialist agent definitions
├── skills/         # 2,025 SKILL.md files
├── config/
│   ├── core-lock.json    # SHA-256 manifest — 282 core files pinned
│   └── skills-lock.json  # skill content hashes
└── memory/
    ├── L1_atomic/  # permanent facts — persist across sessions
    └── L2_session/ # session state — auto-expires
```

Key properties, verified against the actual code, not just the docs describing it:
- **Tamper-evident hash-chain audit log** — every action logged as a hash-chained JSONL entry (each entry embeds the previous entry's hash, a linear chain — not a Merkle tree, despite what earlier versions of this README called it); tampering with an existing line is detectable by recomputing the chain (`verify-audit-chain.sh`)
- **Core-lock integrity** — a SHA-256 manifest (`core-lock.json`) detects drift, deletion, and unreviewed file injection in `core/rules`, `core/hooks`, `core/gates`, `core/scripts`
- **Reviewed infrastructure writes** — before a change lands in `core/rules/**`, `core/hooks/**`, `core/gates/**`, or `core/agents/**`, two independent reviewer agents (security-auditor plus a paired reviewer) are dispatched; a Safety-severity finding from either blocks the write until a human resolves it
- **Human gate** — irreversible actions (force-push, publish, deploy, delete) require an explicit human confirmation in the current session, not a standing approval
- **Independent halt watcher ("giám thị")** — opt-in, offered as a one-time prompt on install. Runs on a real OS scheduler (macOS LaunchAgent / cron), entirely outside any Claude session, and checks core-lock integrity, audit-chain integrity, and recent changes to security-sensitive paths every few hours. On any finding it writes a lock file that makes every subsequent tool call in every session against that repo deny outright, with no bypass flag and no code path — in this hook or the watcher itself — that clears it. Only a human, after reading the lock's reason, deleting the file by hand, can resume. The asymmetry is deliberate: the thing that can stop a session isn't the thing that can restart it, so an agent (compromised or just wrong) can't grade its own homework and wave itself back in.

---

## What it looks like in practice

Same live-tested output as the demo at the top of this README (`core/hooks/guard-destructive.sh`, 2026-07-04) — not repeated here to avoid saying it twice. See [Known Limitations](#known-limitations) below for what this guard does *not* yet catch, or [docs/reference/known-limitations.md](docs/reference/known-limitations.md) for the full technical breakdown.

---

## Known limitations

Honest, not aspirational: verified directly against the live hooks, not the docs describing them.

- **`guard-destructive.sh` is a command-string guard, not a shell parser.** It tokenizes on whitespace and matches known-dangerous spellings (`rm -rf`, `git push --force`, `git clean -f`, `git reset --hard`, direct push to main/master). As of 2026-07-05 (4 rounds of adversarial review in one day) it normalizes whole-token quoting (`"..."`, `'...'`, `$'...'`), backslash-escaping, `${IFS}`-style variable splicing, and denies outright on brace-expansion shapes adjacent to a git/rm invocation, but it does **not** handle mid-token quote-splice concatenation (quoted and unquoted fragments alternating within one word with no separating whitespace, e.g. `--forc"e"`, a real shell resolves this to `--force`, this guard does not). Closing that needs character-run quote-state parsing, not another token comparison: tracked as a longer-term design question, not silently claimed as closed. A deliberately-crafted command can still slip past this guard; an ordinary agent typing a command normally will be caught.
- **SSRF validation is active across the Claude, Codex, and Claude-plugin manifests; supply-chain protection still varies by runtime surface.** `tool-validator.sh` now protects the supported Bash/write/WebFetch tool surfaces. `dependency-safety-gate.sh` and `supply-chain-guard.sh` remain plugin-only, so typosquat/package-install blocking must not be claimed without checking the active installation surface. Generated execution-path evidence is maintained in `docs/operations/hook-execution-path-audit.md`.
- **`core/` and `.claude/` are two copies of the same source by design**, not an accidental duplicate. `core/` is canonical, `.claude/` is what Claude Code reads at runtime, and `core/config/core-lock.json` pins SHA-256 hashes of both. If you see them as duplicated content, that is intentional, not a bug to "clean up."
- **macOS ships no GNU `timeout`/`gtimeout` by default.** A hook that assumed one was present silently never executed any guarded hook on affected machines until this was found and fixed (2026-07-04). Now degrades gracefully (runs without a timeout cap) instead of silently no-op'ing, but worth knowing this class of "assumed environment" bug is exactly what to watch for if you fork or extend these hooks.

Found a gap not listed here? [Open an issue](https://github.com/yanacuti1121/yana-ai/issues). Real-world reports are how a guard like this actually gets sharper, not by adding more documentation about what it's supposed to do.

---

## Yana task router

Every task is classified before execution: no more guessing whether to handle it inline or dispatch an agent.

```bash
yana-ai route classify "implement JWT refresh token"
# → { "route": "complex", "gate": "harness", "confidence": 0.36,
#     "suggested_agents": ["security-engineer", "backend-developer"] }

yana-ai route classify "xem git log 10 commit"
# → { "route": "simple", "gate": "auto", "confidence": 0.43 }

yana-ai route classify "deploy to production"
# → { "route": "external", "gate": "confirm", "confidence": 0.30 }
```

Six routes:
- **simple** → Yana handles directly (read-only, no agents needed)
- **skill** → matched against a 2,025-entry index, dispatches exact skill agent
- **learn** → routes to `hoc-tap`, a Socratic learning assistant (triggers on "learn", "explain", "why" — English and Vietnamese)
- **daily** → routes to `daily-assistant`, summarize / plan / draft (triggers on "summarize", "write an email", "make a plan" — English and Vietnamese)
- **complex** → dispatch specialist agent(s) with a scoped brief
- **external** → stop, confirm with human before proceeding

Domain-aware agent selection: auth tasks → `security-engineer`, database → `database-expert`, UI → `frontend-developer + ui-ux-designer`.

---

## Mission dispatcher

Wave-based parallel orchestration with dependency resolution, built in Rust, zero Python.

```bash
# 1. Create mission
MID=$(yana-ai mission create "implement-auth" | awk '/id:/{print $2}')

# 2. Declare tasks with dependencies
yana-ai mission task $MID "design-schema"   --agent database-expert --produces schema.sql
yana-ai mission task $MID "implement-auth"  --agent backend-developer \
  --consumes schema.sql --produces src/auth.ts
yana-ai mission task $MID "write-tests"     --agent test-engineer \
  --consumes src/auth.ts --produces tests/auth.test.ts

# 3. Dispatch wave 1 — only tasks whose dependencies are satisfied
yana-ai mission dispatch $MID --max-parallel 3
# → JSON briefs for each ready agent

# 4. Mark complete, dispatch next wave
yana-ai mission done $MID "design-schema" --evidence schema.sql
yana-ai mission dispatch $MID  # → wave 2 unlocked

# Cancel / retry stuck tasks
yana-ai mission cancel $MID "implement-auth"
yana-ai mission retry  $MID "write-tests"
```

Tasks marked **Running** on dispatch: re-running `dispatch` never double-dispatches the same task.

---

## Multi-agent launcher

Launch multiple agents in parallel with hard limits and a kill switch:

```bash
# Launch 3 agents, at most 3 running in parallel
bash core/scripts/multi-agent-launch.sh start \
  --agents "scanner,auditor,qa-team" \
  --concurrency 3

# Real-time status
bash core/scripts/multi-agent-launch.sh status

# Stop one specific agent
bash core/scripts/multi-agent-launch.sh kill scanner

# Kill switch — stop everything immediately
bash core/scripts/multi-agent-launch.sh kill all

# Tail an agent's log
bash core/scripts/multi-agent-launch.sh log auditor
```

Or drive it from a task-list file:
```bash
# tasks.txt — one line per task: agent_name:task description
echo "scanner:scan the whole repo
auditor:check the hooks
qa-team:run the test suite" > tasks.txt

bash core/scripts/multi-agent-launch.sh start --tasks-file tasks.txt --concurrency 4
```

`status` shows 6 states: `working` (alive, log updated recently), `blocked` (alive, but its log hasn't changed in over `YANA_AGENT_STALE_SECONDS` seconds, default 30, so it may be stuck), `done` (exited 0), `failed` (exited non-zero), `unknown` (the process is gone but never wrote its own exit code, e.g. after a SIGKILL), `killed` (stopped via `kill`).

See the [full CLI reference](docs/reference/cli-reference.md) for sample output and more detail, or **[COMMANDS.md](COMMANDS.md)** for every `yana-ai` command in one place.

---

## GitHub Action

Scan any repo's AI agent configuration on every PR: secrets, permissions, hook injection, MCP vulnerabilities.

```yaml
# .github/workflows/yana-ai-scan.yml
- uses: yanacuti1121/yana-ai/.github/actions/scan@main
  with:
    fail-on: 'high'       # fail CI on HIGH or CRITICAL findings
    diff-only: 'true'     # scan only changed files on PRs
    comment-on-pr: 'true' # post findings summary as PR comment
```

Posts a comment on every PR:

```
🟠 Yana AI Security Scan — HIGH

| Metric  | Value  |
|---------|--------|
| Risk    | HIGH   |
| Score   | 58/100 |
| Findings| 3      |
```

→ [Full workflow template](docs/install/github-action.yml) · [full reference](docs/reference/github-action.md)

---

## MCP integration — Buzz

`yana-rt mcp` exposes `check_command` (the same destructive-command
check `core/hooks/guard-destructive.sh` enforces for Claude Code) as an
MCP tool over stdio — opt-in, gated behind the `mcp` Cargo feature, not
part of the default binary.

Its first real consumer is [Buzz](https://github.com/block/buzz), a
self-hostable team workspace where AI agents are first-class members
with their own keys. Buzz's `buzz-acp` spawns any ACP-compliant agent
(goose, codex, claude-code, or `buzz-agent`) and can wire in an extra
MCP server via `BUZZ_ACP_MCP_COMMAND` — pointed at Yana AI, every agent
Buzz orchestrates gets the same command check, not just Claude Code.

```bash
cargo build --release --features mcp
export BUZZ_ACP_MCP_COMMAND=/path/to/Yana-AI/scripts/yana-rt-mcp-wrapper.sh
```

The wrapper exists because `buzz-acp` invokes `BUZZ_ACP_MCP_COMMAND` with
no arguments, but `yana-rt` needs the `mcp` subcommand — see
[docs/programs/buzz-mcp-integration.md](docs/programs/buzz-mcp-integration.md)
for full setup (keypair generation, relay registration) and the verified
stdio JSON-RPC transcript. Note: this makes the check *available* to the
spawned agent — whether that agent actually calls it before running a
command depends on the agent's own tool-use policy, nothing forces it.

---

## Yana AI (the web product)

**[Live →](https://yanai-production.up.railway.app)** · **[Download Desktop →](https://yanacuti1121.github.io/Yana-AI/desktop.html)** · **[Command Reference →](https://yanacuti1121.github.io/Yana-AI/commands.html)** · **[Latest release →](https://github.com/yanacuti1121/Yana-AI/releases/latest)**

Yana is the first interface built on Yana AI core: a web UI that lets anyone chat with AI, switch providers, and use skill routing without knowing anything about the infrastructure underneath.

```
User → Yana AI → Yana AI Core (Router · Safety · Context) → Model
```

- Zero signup: bring your own API key
- 🔐 **Encrypted key vault** — keys stored AES-256-GCM, master key non-extractable (WebCrypto + IndexedDB), never plaintext
- Multi-provider: Anthropic · Groq · Gemini · OpenAI · DeepSeek · OpenRouter · 9Router · Ollama

**Provider setup**, bring your own key, keys encrypted locally (never sent to Yana AI):

| Provider | Type | Setup |
|----------|------|-------|
| **Claude** | Cloud | API key → [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **OpenAI** | Cloud | API key → [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Gemini** | Cloud | API key → [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| **Groq** | Cloud | API key → [console.groq.com/keys](https://console.groq.com/keys) |
| **DeepSeek** | Cloud | API key → [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) |
| **OpenRouter** | Cloud | API key → [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| **9Router** | Local | `npm install -g 9router` → `9router` (runs on `localhost:20128`) |
| **Ollama** | Local | [ollama.com/download](https://ollama.com/download) → `ollama serve` → `ollama pull llama3.2` |

- 📊 **100% real data** — live provider stats, L1 memory garden, audit-log health panel; zero demo numbers
- Skill routing built in, type naturally and Yana AI dispatches the right agent
- **Non-coding use cases:** learning (Socratic learning assistant), daily work (summarize / plan / draft)
- SSE streaming, mobile-friendly · **[Electron desktop app](https://yanacuti1121.github.io/Yana-AI/desktop.html)** — macOS, Windows, Linux

If Yana AI is the power grid, Yana is the first building plugged into it.

---

## Cutting your own token bill

Yana AI enforces safety on what an agent does — it does not reduce how
many tokens an agent burns reading command output. If that's your actual
pain point, pair it with [`rtk`](https://github.com/rtk-ai/rtk), a
separate Apache-2.0 tool built for exactly that (filters/compresses bash
output before your agent reads it, up to 90% smaller on common commands).
Not vendored, not a dependency — see
[docs/reference/token-optimization.md](docs/reference/token-optimization.md)
for install + wiring into Claude Code/Cursor/Codex/Antigravity.

---

## Versioning

Yana AI has three independently versioned release axes — deliberate, not drift (same pattern as Kubernetes or LLVM: independent components, independent release cadence). Only two of the three actually ship to a package registry; the product axis (rules/hooks/skills/agents/CLI) does not, see the table's Registry column.

| Axis | Version | Registry |
|---|---|---|
| Product (rules/hooks/skills/agents/CLI) | **1.4.1** | None — not distributed via npm, see [VERSIONING.md](VERSIONING.md#why-product-has-no-registry) |
| Rust runtime (`yana-rt`) | **1.4.0** | [crates.io/crates/yana-rt](https://crates.io/crates/yana-rt) |
| Python package | **0.42.5** | [pypi.org/project/yana-ai](https://pypi.org/project/yana-ai/) |

If you see three different numbers across this repo (including in `git tag`, `ROADMAP.md`'s older entries written before the 2026-07-05 axis split, or the badges above), that's expected — full rationale in [VERSIONING.md](VERSIONING.md).

### What's new in v1.4.0

Three new local-first providers, a runtime architecture unification, and
a safety-hook wiring gap that had sat unnoticed for months, closed:

- **New providers:** a Discord adapter (read-only chat, its own worker
  thread isolated from turn panics, dispatch queue now bounded against
  a message flood); an AirLLM local-model provider via a thin
  OpenAI-compatible bridge, with bounded admission (a second concurrent
  request gets an explicit `503`, not an unbounded wait), a read
  timeout, and a context-length ceiling checked before the expensive
  generation call; Ollama model management built into the terminal
  chat (pull/delete/status), now correctly distinguishing a genuine
  backend failure from an honestly-empty install list.
- **Runtime architecture:** the chat surface moved onto a canonical
  Capability Runtime (typed errors, `SessionContext`, golden
  end-to-end tests) on top of a newly unified Rust workspace; a
  Host-Native OS Program (platform contract, resource/model planes,
  actor identity, a resident service) and an always-on OS Service
  Supervisor foundation.
- **Safety, the headline fix:** `tool-validator.sh`'s null-byte check
  had silently collapsed to an always-matching empty pattern — a bash
  quoting gotcha (`$'\x00'` cannot represent a real NUL byte) that
  denied essentially every Bash tool call. Also: 16 safety hooks
  (`deploy-gate`, `db-protect`, `api-destruct-guard`,
  `supply-chain-guard`, `prompt-injection-guard`, `token-scope-guard`,
  `code-freeze`, `code-quality-gate`, `coverage-gate`,
  `dependency-safety-gate`, `static-analysis-gate`,
  `test-runner-gate`, `multi-agent-lock`, `confidence-scorer`,
  `risk-scorer`, `canary-token-guard`) existed in `core/hooks/` but
  were never referenced in `.claude/settings.json` — none had ever
  executed — now wired, plus 2 of them fixed for silently disabling
  their own checks when `jq` is missing. A unified Giám Thị control
  plane, this README's Safety Architecture halt watcher, replaces
  the earlier split implementation.
- **Chat UX:** real mouse support, contextual status hints, `/undo`,
  and custom slash commands in `yana chat`.
- **Ops:** the sandbox Docker image now publishes to GHCR on every
  push; CI hardening from a standing start — every GitHub Action
  reference SHA-pinned, `cargo audit`/`pip-audit`/`npm audit` wired
  as a required check, a release-manifest step recording commit
  SHA/toolchain/artifact SHA256 for every published binary, branch
  protection enabled on `main` for the first time; real CVEs closed
  (`quinn-proto` RUSTSEC-2026-0185, an SSRF gap for CGNAT and
  IPv4-mapped-IPv6 ranges).

Full writeup with PR numbers: [CHANGELOG.md](CHANGELOG.md) (see the "v1.4.0" entry).

---

## 📚 Documentation

| Document | Description |
| --- | --- |
| [Journey](JOURNEY.md) | The story behind Yana AI |
| [Philosophy](PHILOSOPHY.md) | Core beliefs and long-term vision |
| [Principles](PRINCIPLES.md) | Engineering principles that guide every design decision |
| [Lineage](docs/history/LINEAGE.md) | Dated, evidence-checked code-origin record — where this codebase actually came from |
| [Acknowledgements](ACKNOWLEDGEMENTS.md) | Credits and appreciation for the open-source community |

---

## Built by one person

One person. No team. No funding.

- Hook architecture, safety gates, Python CLI
- Rust runtime (`yana-rt`), 101 agents, 2,025 skills, multi-harness support
- 4 harness adapters (Claude Code, Cursor, Codex, Antigravity)

The 2,025 skills cover: frontend, backend, AI/LLM, security, Kubernetes, WebAssembly, DevOps, databases, testing, and more. Two agent personas cover non-coding use cases: learning (`hoc-tap`) and daily productivity (`daily-assistant`).

---

## Add Yana AI to your repo

**Static badge**, paste into your README:

```markdown
[![Protected by Yana AI](https://img.shields.io/badge/protected%20by-Yana AI%20ENGINE-ff6b35?style=for-the-badge)](https://github.com/yanacuti1121/yana-ai)
```

**Dynamic audit badge**, shows live security score:

```bash
yana-ai badge .           # prints badge markdown with current score
yana-ai badge . --json    # machine-readable output
```

**GitHub Action**, scan every PR automatically:

```yaml
- uses: yanacuti1121/yana-ai/.github/actions/scan@main
  with:
    fail-on: 'high'
```

→ [Full workflow template](docs/install/github-action.yml)

---

## Project links

| | |
|---|---|
| Full command reference | [COMMANDS.md](COMMANDS.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Code of Conduct | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| Security policy | [SECURITY.md](SECURITY.md) |
| License | [Apache 2.0](LICENSE) |

---

## Contact

**Vũ Văn Tâm** · Vietnam · 17

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana-destop | [yanacuti1121.github.io/Yana-AI/desktop.html](https://yanacuti1121.github.io/Yana-AI/desktop.html) |

---

## 🇻🇳 Tiếng Việt · 🇰🇷 한국어 · 🇨🇳 中文

Full translations of this document: **[README.vi.md](README.vi.md)** (Tiếng Việt) · **[README.ko.md](README.ko.md)** (한국어) · **[README.zh.md](README.zh.md)** (中文)

---

## Lineage

This codebase's roots go back further than this repo's own git history (which starts 2026-05-17): an earlier scaffold built under the name "YAMTAM ENGINE". See [docs/history/LINEAGE.md](docs/history/LINEAGE.md) for the dated origin record — what's independently verified (zip contents, embedded git history, checksums) versus what's reported and still unconfirmed.

---

## Acknowledgements

Yana AI is built on top of ideas, patterns, and tooling from the open-source community, including projects licensed under Apache 2.0, MIT, and other permissive licenses. All third-party sources are used in compliance with their respective licenses. This project has no intent to copy, misrepresent, or infringe upon the intellectual property of any individual or organization. Where specific projects have directly influenced design decisions, they are credited in the relevant source files and rule documentation.
