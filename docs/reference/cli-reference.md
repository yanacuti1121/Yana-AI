# CLI reference

Moved from the main README (2026-07-05) so the top-level pitch stays short.
Content unchanged from the version that lived in `README.md`.

## Rust runtime — `yana-rt`

23 subcommands. Zero Python dependency.

```bash
yana-ai audit .                       # security scan — secrets, CVEs, supply chain risks
yana-ai graph .                       # knowledge graph — file deps, import resolution
yana-ai vault search Q                # search 1,989 skills by keyword
yana-ai hunt .                        # hunt for security patterns (OWASP, injection, SSRF)
yana-ai fix .                         # auto-fix rule violations
yana-ai doctor .                      # full system health check
yana-ai map .                         # blast radius map — what can the agent touch?
yana-ai ci                            # run all gate checks (used in CI)
yana-ai route classify "fix auth bug" # classify task → simple/complex/external
yana-ai mission create "add-auth"     # create parallel agent mission
```

**Benchmark:** bounded commands ~2-12x faster than Python; full-repo scan converges to ~1.1x at 19k files — see `BENCHMARK.md` for full methodology.

## Local AI terminal chat — `yana-ai-rt`

`yana-ai-rt` opens the local-first terminal workspace directly. The existing
`yana-rt chat` form remains supported for scripts and backward compatibility.

```bash
yana-ai-rt                              # auto-select configured provider, else Ollama
yana-ai-rt --provider ollama            # Ollama on localhost:11434
yana-ai-rt --provider lmstudio          # LM Studio on localhost:1234
yana-ai-rt --provider llamacpp           # llama.cpp server on localhost:8080
yana-ai-rt --provider ollama --model qwen3:14b
```

Inside the workspace, use `Ctrl+K` for the command palette, `Ctrl+T` for a
new conversation tab, `/models` for runtime model discovery, and `/help` for
the complete keyboard map. Conversation data stays under `.yana-ai/` in the
current workspace; telemetry is disabled by default.

## Yana OS management plane — `yana-rt os`

Phase 1 provides local metadata and policy management inside `yana-rt`; it is
not a daemon or process supervisor. Mutations require an active ADR-008
`flock-v1` protocol marker and fail closed when safe locking is unavailable.

```bash
yana-rt os init
yana-rt os status --json
yana-rt os doctor
yana-rt os doctor --dir /path/to/project --json

yana-rt os agent register reviewer --provider ollama --model qwen3:14b
yana-rt os agent transition <agent-id> running
yana-rt os agent heartbeat <agent-id>
yana-rt os agent list --include-chat-sessions

yana-rt os credential status

yana-rt os resource set \
  --max-active-agents 4 \
  --max-tokens-per-request 32000 \
  --max-daily-cost-usd 5
yana-rt os resource check \
  --requested-agents 1 \
  --estimated-tokens 8000 \
  --estimated-cost-usd 0.25
```

State is stored in `.yana-ai/os/state.json` with private permissions, atomic
replacement and the shared kernel-flock protocol. Credential output contains
only provider name, runtime type, environment-variable name and presence; it
never contains credential values. Resource preflight covers declared agent
concurrency, token estimates and daily ledger cost only — it does not claim
CPU or RAM enforcement.

`os doctor` is a read-only aggregate over the locking marker, OS state,
resource policy, strict daily-cost ledger, token-budget/circuit JSON, audit
evidence and provider credential presence. `PASS` means the named local
evidence was readable, `WARN` means optional evidence or policy is absent, and
`FAIL` means a required or present surface is unsafe/corrupt. Any `FAIL` exits
2; pass/warning exits 0. Doctor does not initialize or repair state, verify the
audit hash chain, contact provider endpoints, or print secret values. Provider
availability is therefore reported as `not-probed`.

## Multi-harness support

Yana AI adapts to whichever tool you use:

```bash
bash core/scripts/switch-engine.sh cursor      # .cursorrules + real beforeShellExecution hook
bash core/scripts/switch-engine.sh codex       # AGENTS.md
bash core/scripts/switch-engine.sh antigravity # .agent/rules/yana-ai.md
bash core/scripts/switch-engine.sh status      # check all 4 adapters
```

## Yana task router

Every task is classified before execution, so there is no more guessing whether to handle it inline or dispatch an agent.

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
- **skill** → matched against 1,989-entry index, dispatches exact skill agent
- **learn** → routes to `hoc-tap` — Socratic learning assistant (triggers on "learn", "explain", "why" — English and Vietnamese)
- **daily** → routes to `daily-assistant` — summarize / plan / draft (triggers on "summarize", "write an email", "make a plan" — English and Vietnamese)
- **complex** → dispatch specialist agent(s) with scoped brief
- **external** → stop, confirm with human before proceeding

Domain-aware agent selection: auth tasks → `security-engineer`, database → `database-expert`, UI → `frontend-developer + ui-ux-designer`.

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

Sample output:
```
═══ Yana AI Multi-Agent Launcher ═══
  Agents     : 3
  Concurrency: 3 (max running in parallel)
  Kill switch: bash multi-agent-launch.sh kill all

[LAUNCH] scanner → scan the whole repo    PID 12341
[LAUNCH] auditor → check the hooks        PID 12342
[LAUNCH] qa-team → run the test suite     PID 12343

[OK] Launched 3/3 agents
```

`status` shows 6 states, added 2026-07-06: `working` (alive, log updated
recently), `blocked` (alive, but its log has not changed in over
`YANA_AGENT_STALE_SECONDS` seconds, default 30, so it may be stuck or
waiting on something), `done` (exited 0), `failed` (exited non-zero),
`unknown` (the process is gone but never wrote its own exit code, for
example after a SIGKILL, so success can't be assumed), `killed` (stopped
via `kill`).

Agent names passed to `--agents`/`--tasks-file` are restricted to
`[A-Za-z0-9_-]` (rejected otherwise) since they flow directly into file
paths and a shell command string; task descriptions are shell-escaped
before use for the same reason.
