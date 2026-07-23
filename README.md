```
$ yana-ai
╭────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│                                                                                                                                            │
│   ██╗   ██╗ █████╗ ███╗   ██╗ █████╗     █████╗ ██╗                                                                                       │
│   ╚██╗ ██╔╝██╔══██╗████╗  ██║██╔══██╗   ██╔══██╗██║                                                                                       │
│    ╚████╔╝ ███████║██╔██╗ ██║███████║   ███████║██║                                                                                       │
│     ╚██╔╝  ██╔══██║██║╚██╗██║██╔══██║   ██╔══██║██║                                                                                       │
│      ██║   ██║  ██║██║ ╚████║██║  ██║   ██║  ██║██║                                                                                       │
│      ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝  ╚═╝╚═╝                                                                                       │
│                                                                                                                                            │
│ v0.43.2 · Safety firewall for AI coding agents │ Tips for getting started                                                                   │
│ 101 agents · 2,025 skills                      │ yana-ai doctor                                                                             │
│ 71 rules · 61 hooks · 108 scripts              │ yana-ai init                                                                               │
│ 170 commands                                   │                                                                                           │
│                                                 │ What's new                                                                                │
│                                                 │ v0.43.2 — Ollama model-id fix, entry-point verify law                                     │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

<h1 align="center">Yana AI</h1>

<p align="center">
  <strong>A safety firewall between your AI coding agent and your shell.</strong>
</p>

<p align="center">
  <em>Built by Vũ Văn Tâm · 17 · Vietnam</em>
</p>

<p align="center">
  <strong>English</strong> · <a href="README.vi.md">🇻🇳 Tiếng Việt</a> · <a href="README.ko.md">🇰🇷 한국어</a> · <a href="README.zh.md">🇨🇳 中文</a>
</p>

<p align="center">
  <a href="https://github.com/yanacuti1121/yana-ai/actions/workflows/ci.yml">
    <img src="https://github.com/yanacuti1121/yana-ai/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <img src="https://img.shields.io/badge/version-v0.43.2-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-Apache_2.0-blue?style=for-the-badge" />
  <a href="https://www.npmjs.com/package/yana-ai">
    <img src="https://img.shields.io/npm/v/yana-ai?style=for-the-badge&logo=npm&color=cb3837" />
  </a>
  <a href="https://crates.io/crates/yana-rt">
    <img src="https://img.shields.io/crates/v/yana-rt?style=for-the-badge&logo=rust&color=ce422b" />
  </a>
  <a href="https://pypi.org/project/yana-ai/">
    <img src="https://img.shields.io/pypi/v/yana-ai?style=for-the-badge&logo=pypi&color=3775a9" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/🇻🇳_made_in-Vietnam-da251d?style=flat-square" />
</p>

---

Your agent tries something dangerous. Yana intercepts it, explains why, and logs it. Works with Claude Code, Cursor, Windsurf, Antigravity, Kiro, OpenCode, Zed, Gemini, GitHub Copilot, Aider, and more.

```bash
npm install -g yana-ai && npx yana-ai-install   # wire the hooks (60 seconds)
```

Then ask your agent to misbehave, and watch. Every example below is copy-pasted from a real, live-tested run of `core/hooks/guard-destructive.sh` on 2026-07-04, not aspirational copy (see [Known Limitations](docs/reference/known-limitations.md) for what this guard does not yet catch):

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

## How it works

```
Agent wants to run a command
         ↓
Anti-evasion scan      — blocks base64 decode+exec, pipe-to-shell interpreters
Shell sanitization     — quotes all variables, strips shell metacharacters
Egress / SSRF policy   — blocks known metadata endpoints, private IP ranges
Supply-chain vetting   — typosquat/CVE checklist before package installs
Blast-radius cap       — caps how many files/what scope a destructive command can touch
Merkle audit log       — every allowed AND blocked action logged, tamper-detected
Human gate             — irreversible actions (push, publish, delete) require explicit confirmation
         ↓
Execute (or block + log)
```

See [Known Limitations](docs/reference/known-limitations.md) for exactly which of these are live, wired hooks today versus documented policy an agent applies by convention, verified directly against the code rather than the docs describing it.

---

## Quick install

**→ [npm install](https://www.npmjs.com/package/yana-ai)** — `npm install -g yana-ai`

```bash
# Claude Code plugin — npx yana-ai-install wires the hooks
# (required: npm v12+ no longer runs postinstall scripts by default)
npm install yana-ai && npx yana-ai-install

# Python CLI
pip install yana-ai

# Rust runtime (up to ~12x faster on bounded commands — see BENCHMARK.md)
cargo install yana-rt
```

```bash
# Verify everything is wired
yana-ai doctor .
```

### Requirements

- Node.js 18+ (for the npm package)
- Git
- Any AI coding tool: [Claude Code](https://claude.ai/code), Cursor, Windsurf, Aider, etc.

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
bash core/scripts/switch-engine.sh cursor    # .cursorrules + 7 .cursor/rules/*.mdc
bash core/scripts/switch-engine.sh opencode  # OPENCODE.md
bash core/scripts/switch-engine.sh zed       # .zed/settings.json
bash core/scripts/switch-engine.sh gemini    # GEMINI.md
bash core/scripts/switch-engine.sh copilot   # .github/copilot-instructions.md
bash core/scripts/switch-engine.sh status    # check all 12 adapters
```

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

## Rust runtime — `yana-rt`

27 subcommands. Zero Python dependency.

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

## Versioning

Yana AI ships to three registries, each with its own version number — deliberate, not drift (same pattern as Kubernetes or LLVM: independent components, independent release cadence).

| Axis | Version | Registry |
|---|---|---|
| Product (rules/hooks/skills/agents/CLI) | **0.43.2** | [npmjs.com/package/yana-ai](https://www.npmjs.com/package/yana-ai) |
| Rust runtime (`yana-rt`) | **1.3.3** | [crates.io/crates/yana-rt](https://crates.io/crates/yana-rt) |
| Python package | **0.42.3** | [pypi.org/project/yana-ai](https://pypi.org/project/yana-ai/) |

If you see three different numbers across this repo (including in `git tag`, `ROADMAP.md`'s older entries written before the 2026-07-05 axis split, or the badges above), that's expected — full rationale in [VERSIONING.md](VERSIONING.md).

---

## Safety architecture

```
core/
├── hooks/          # 57 PreToolUse / PostToolUse / Stop hooks
├── rules/          # 71 enforced rules (security, correctness, UI, git)
├── scripts/        # safe-run.sh, verify-core-lock.sh, secure-logger.sh
├── gates/          # truth_gate.md, action_gate.md
├── agents/         # 101 specialist agent definitions
├── skills/         # 2,016 SKILL.md files
├── config/
│   ├── core-lock.json    # SHA-256 manifest — 240 core files pinned
│   └── skills-lock.json  # skill content hashes
└── memory/
    ├── L1_atomic/  # permanent facts — persist across sessions
    └── L2_session/ # session state — auto-expires
```

Key properties, verified against the actual code, not just the docs describing it:
- **Merkle audit chain** — every action logged as a hash-chained JSONL entry; tampering with an existing line is detectable by recomputing the chain (`verify-audit-chain.sh`)
- **Core-lock integrity** — a SHA-256 manifest (`core-lock.json`) detects drift, deletion, and unreviewed file injection in `core/rules`, `core/hooks`, `core/gates`, `core/scripts`
- **Reviewed infrastructure writes** — before a change lands in `core/rules/**`, `core/hooks/**`, `core/gates/**`, or `core/agents/**`, two independent reviewer agents (security-auditor plus a paired reviewer) are dispatched; a Safety-severity finding from either blocks the write until a human resolves it
- **Human gate** — irreversible actions (force-push, publish, deploy, delete) require an explicit human confirmation in the current session, not a standing approval

---

## What it looks like in practice

Every example below is copy-pasted from a real, live-tested run of `core/hooks/guard-destructive.sh` on 2026-07-04, not aspirational copy. See "Known Limitations" below for what this guard does *not* yet catch.

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

## Known limitations

Honest, not aspirational: verified directly against the live hooks, not the docs describing them.

- **`guard-destructive.sh` is a command-string guard, not a shell parser.** It tokenizes on whitespace and matches known-dangerous spellings (`rm -rf`, `git push --force`, `git clean -f`, `git reset --hard`, direct push to main/master). As of 2026-07-05 (4 rounds of adversarial review in one day) it normalizes whole-token quoting (`"..."`, `'...'`, `$'...'`), backslash-escaping, `${IFS}`-style variable splicing, and denies outright on brace-expansion shapes adjacent to a git/rm invocation, but it does **not** handle mid-token quote-splice concatenation (quoted and unquoted fragments alternating within one word with no separating whitespace, e.g. `--forc"e"`, a real shell resolves this to `--force`, this guard does not). Closing that needs character-run quote-state parsing, not another token comparison: tracked as a longer-term design question, not silently claimed as closed. A deliberately-crafted command can still slip past this guard; an ordinary agent typing a command normally will be caught.
- **SSRF/metadata-endpoint blocking and typosquatting/unvetted-package-install blocking are documented policy, not yet wired as live hooks.** Earlier versions of this README showed them as working examples, verified directly (2026-07-04, re-confirmed 2026-07-05) that no currently-wired hook actually intercepts `curl` to a metadata endpoint, a `Read` of a `.env` file, or an `npm install` of a typosquatted package. This is now stated plainly instead of shown as a working demo.
- **`core/` and `.claude/` are two copies of the same source by design**, not an accidental duplicate. `core/` is canonical, `.claude/` is what Claude Code reads at runtime, and `core/config/core-lock.json` pins SHA-256 hashes of both. If you see them as duplicated content, that is intentional, not a bug to "clean up."
- **macOS ships no GNU `timeout`/`gtimeout` by default.** A hook that assumed one was present silently never executed any guarded hook on affected machines until this was found and fixed (2026-07-04). Now degrades gracefully (runs without a timeout cap) instead of silently no-op'ing, but worth knowing this class of "assumed environment" bug is exactly what to watch for if you fork or extend these hooks.

Found a gap not listed here? [Open an issue](https://github.com/yanacuti1121/yana-ai/issues). Real-world reports are how a guard like this actually gets sharper, not by adding more documentation about what it's supposed to do.

---

## Yana AI (the web product)

**[Live →](https://yanai-production.up.railway.app)** · **[Download Desktop →](https://yanacuti1121.github.io/Yana-AI/desktop.html)**

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

## Built by one person

One person. No team. No funding.

- Hook architecture, safety gates, Python CLI
- Rust runtime (`yana-rt`), 101 agents, 2,025 skills, multi-harness support
- 12 harness adapters (Claude Code, Cursor, Windsurf, Antigravity, Kiro, Zed, Gemini, Copilot, Aider…)

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

Five routes:
- **simple** → Yana handles directly (read-only, no agents needed)
- **skill** → matched against a 2,016-entry index, dispatches exact skill agent
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

See the [full CLI reference](docs/reference/cli-reference.md) for sample output and more detail.

---

## Contact

**Vũ Văn Tâm** · Vietnam · 17

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana | [yanai-production.up.railway.app](https://yanai-production.up.railway.app) |

---

## 🇻🇳 Tiếng Việt · 🇰🇷 한국어 · 🇨🇳 中文

Full translations of this document: **[README.vi.md](README.vi.md)** (Tiếng Việt) · **[README.ko.md](README.ko.md)** (한국어) · **[README.zh.md](README.zh.md)** (中文)

---

## Acknowledgements

Yana AI is built on top of ideas, patterns, and tooling from the open-source community, including projects licensed under Apache 2.0, MIT, and other permissive licenses. All third-party sources are used in compliance with their respective licenses. This project has no intent to copy, misrepresent, or infringe upon the intellectual property of any individual or organization. Where specific projects have directly influenced design decisions, they are credited in the relevant source files and rule documentation.
---end----
