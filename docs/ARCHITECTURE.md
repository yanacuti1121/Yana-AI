# YAMTAM ENGINE — Architecture

**Version:** 1.3.25-clean
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
| Bash + jq only | Must run on any machine with Claude Code — no pip install, no npm |
| No external deps | Hooks must not fail if Python/Node/Ruby are absent |
| Non-blocking by default | Hooks warn via stdout; only explicit guards block (exit 2) |
| Gitignored state | Session state (`.claude/state/`) never enters version control |
| YAMTAM ≠ product | Zero coupling to any target project's code or schema |

---

## Layer Model

```
L0  audit-log.sh          — hash-chain JSONL of every tool call
L1  token-scope-guard.sh  — warn on secret/token access
    scope-guard.sh         — warn on cross-scope writes
L2  commit-gate.sh        — warn on cross-scope commits
L3  truth-gate-guard.sh   — warn on unsupported claim verbs
    session-trust.sh       — decrement trust score on L3 warn
L4  deploy-gate.sh        — block gh/kubectl/docker/gcloud/fly
L5  db-protect.sh         — block prod DB ops
    api-destruct-guard.sh  — block destructive API calls
    guard-destructive.sh   — block rm -rf, force push, etc.
```

Lower layers (L0–L2) are advisory. Upper layers (L4–L5) are blocking.
L3 is non-blocking but leaves a trust trail via session-trust.sh.

---

## Directory Layout

```
yamtam-engine/
│
├── core/
│   ├── hooks/      ← Claude Code hook scripts (.sh + .js)
│   │                 Fired on: PreToolUse, PostToolUse, Stop
│   ├── scripts/    ← Utility scripts called by hooks or humans
│   ├── agents/     ← Agent definition files (markdown)
│   ├── commands/   ← Slash command definitions (markdown)
│   ├── skills/     ← Reusable skill packs (SKILL.md)
│   ├── rules/      ← Coding rules injected into agent context
│   ├── templates/  ← Starter files for new target projects
│   ├── config/     ← JSON config (RBAC, budgets, routing map)
│   ├── state/      ← Runtime state (gitignored)
│   └── tests/hooks/← Test suites for hooks and scripts
│
├── memory/
│   ├── L1_atomic/  ← Persistent facts (git-tracked, confidence-gated)
│   └── L2_session/ ← Session facts (gitignored, cleared each session)
│
├── gates/
│   ├── truth_gate.md   ← L3 spec + claim verb rules
│   └── action_gate.md  ← L4 spec + coverage table
│
├── docs/           ← Human-readable design docs
├── prompts/        ← System prompt block for AI operators
├── releases/       ← Versioned zip packs
└── .claude-plugin/ ← Plugin manifest for /plugin install
```

---

## Hook Execution Model

Claude Code calls hooks via stdin/stdout:

```
Claude Code → fork → bash hook.sh
                      ├─ reads JSON from stdin
                      ├─ exit 0           → allow (no output)
                      ├─ exit 0 + stdout  → allow + show message to Claude
                      └─ JSON + exit 2    → block tool call
```

Hooks receive the tool name and tool input as JSON on stdin.
`Stop` hooks receive a transcript path instead.

All hooks use `set -uo pipefail` and exit 0 on missing deps (graceful degradation).

---

## Memory Architecture

```
L1 Atomic  — git-tracked markdown files in memory/L1_atomic/
             Each fact: id, statement, confidence, scope, tags
             Promoted manually via: bash core/scripts/add-fact.sh

L2 Session — gitignored markdown in memory/L2_session/
             Each fact: id, statement, source (agent/user)
             Expires with session: bash core/scripts/clear-session.sh

L3 Truth Gate — not a memory tier; enforced by truth-gate-guard.sh
                Tracks whether claims are backed by evidence

Session Trust — .claude/state/session-trust.json (gitignored)
                Score 0–100, decremented by L3 warnings
                < 50 → double evidence required
```

---

## Agent Routing

83 agents defined in `core/agents/` (root + domain subfolders). Routing is governed by:

1. `core/agents/tool-router.md` — routes query type → specialist agent
2. `core/config/agent-routing-map.json` — machine-readable routing rules
3. V10 Routing Discipline (in tool-router.md) — always read routing map
   before recommending; never route to same agent for impl + verify

Specialist routing table (subset):

| Query type     | Agent                | Tools allowed          |
|----------------|----------------------|------------------------|
| code review    | qa-engineer          | Read, Grep, git log    |
| security audit | prompt-firewall      | Read, Grep             |
| docs/research  | documentation-writer | Read, WebFetch (MCP)   |
| DB / schema    | database-expert      | Read, Glob             |
| infra / deploy | cicd-engineer        | Read, Glob             |

---

## Release Process

```
bash core/scripts/build-release.sh
  → syntax check all .sh files
  → run core/tests/hooks/run-hook-tests.sh  (must pass)
  → run core/tests/hooks/test-audit-chain.sh (must pass)
  → run core/scripts/drift-check.sh         (must be CLEAN)
  → zip core/ memory/ gates/ prompts/ docs/ into releases/
  → symlink releases/yamtam-engine-latest.zip
```

GitHub Actions auto-releases on semver tag push (`git tag vX.Y.Z`).

---

## What YAMTAM Does NOT Do

- No LLM calls of its own
- No HTTP requests (telemetry-sender.sh is opt-in and disabled by default)
- No database reads or writes
- No modification of the target project's application code
- No changes to git history or branch state
- No global npm/pip installs

See `.out-of-scope/` for features explicitly excluded with rationale.
