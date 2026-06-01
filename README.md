<p align="center">
  <img src="./docs/yamtam-engine-hero.png" alt="YAMTAM ENGINE" width="100%" />
</p>

<h1 align="center">YAMTAM ENGINE</h1>

<p align="center">
  <strong>The safety layer that stops AI coding agents before they break your repo.</strong>
</p>

<p align="center">
  <em>Built by Vũ Văn Tâm · 17 · Vietnam · 1 month · 1,026,000 lines</em>
</p>

<p align="center">
  <a href="https://github.com/phamlongh230-lgtm/yamtam-engine/actions/workflows/ci.yml">
    <img src="https://github.com/phamlongh230-lgtm/yamtam-engine/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <img src="https://img.shields.io/badge/version-v0.17.0-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-Apache_2.0-blue?style=for-the-badge" />
  <a href="https://www.npmjs.com/package/yamtam-engine">
    <img src="https://img.shields.io/npm/v/yamtam-engine?style=for-the-badge&logo=npm&color=cb3837" />
  </a>
  <a href="https://crates.io/crates/yamtam-rt">
    <img src="https://img.shields.io/crates/v/yamtam-rt?style=for-the-badge&logo=rust&color=ce422b" />
  </a>
  <a href="https://pypi.org/project/yamtam-engine/">
    <img src="https://img.shields.io/pypi/v/yamtam-engine?style=for-the-badge&logo=pypi&color=3775a9" />
  </a>
  <a href="https://github.com/phamlongh230-lgtm/yamtam-engine">
    <img src="https://img.shields.io/badge/protected%20by-YAMTAM%20ENGINE-ff6b35?style=for-the-badge" />
  </a>
</p>

---

**YAMTAM ENGINE** is a personal agent operating system for AI coding tools — runtime safety hooks, memory tiers, 93 specialist agents, 8,550 skills, and a Rust runtime that intercepts dangerous AI actions before they execute.

Works with **Claude Code**, **Cursor**, **OpenCode**, **Zed**, **Gemini**, **GitHub Copilot**, **Aider**, and more.

**→ [Full documentation & demo](https://phamlongh230-lgtm.github.io/yamtam-engine/)**

---

## The problem

AI coding agents make mistakes. They `rm -rf` the wrong directory. They push force to main. They hallucinate test results. They commit secrets. By the time you notice, the damage is done.

YAMTAM sits between the agent and your system — every tool call passes through a 9-layer safety gate before execution.

---

## How it works

```
Agent wants to run a command
         ↓
[L1] Anti-evasion scan       — blocks base64 decode+exec, pipe-to-shell
[L2] Shell sanitization      — quotes all variables, strips metacharacters
[L3] Egress check            — blocks SSRF, private IP ranges, metadata endpoints
[L4] Supply chain gate       — vets every package install (typosquatting, CVEs)
[L5] Blast radius check      — caps destructive scope
[L6] Permission tier check   — verifies agent authority level
[L7] Signature verification  — ECDSA-P256 on generated code
[L8] Merkle audit log        — append-only, tamper-detected hash chain
[L9] Sovereign overlord gate — human veto, freeze swarm, full rollback
         ↓
Execute (or block + log)
```

---

## Numbers

| | |
|---|---|
| Skills | **8,550** workflow skill definitions |
| Agents | **93** specialist agents |
| Safety rules | **61** enforced rules |
| Hooks | **46** pre/post-execution hooks |
| Slash commands | **164** |
| Harness adapters | **12** (Claude Code, Cursor, OpenCode, Zed, Gemini, Copilot, Aider...) |
| Rust subcommands | **17** (`scan`, `graph`, `vault`, `hunt`, `fix`, `doctor`...) |
| Rule checks in CI | **826** |
| Total codebase | **1,026,000 lines · 15,502 files** |

---

## Quick Install

```bash
# Claude Code plugin (hooks wire automatically)
npm install yamtam-engine && npx yamtam-install

# Python CLI
pip install yamtam-engine

# Rust runtime (1256x faster scanner)
cargo install yamtam-rt
```

```bash
# Verify everything is wired
yamtam doctor .
```

---

## Multi-harness support

YAMTAM adapts to whichever tool you use:

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

Scan any repo's AI agent configuration on every PR — secrets, permissions, hook injection, MCP vulnerabilities.

```yaml
# .github/workflows/yamtam-scan.yml
- uses: phamlongh230-lgtm/yamtam-engine/.github/actions/scan@main
  with:
    fail-on: 'high'       # fail CI on HIGH or CRITICAL findings
    diff-only: 'true'     # scan only changed files on PRs
    comment-on-pr: 'true' # post findings summary as PR comment
```

Posts a comment on every PR:

```
🟠 YAMTAM Security Scan — HIGH

| Metric  | Value  |
|---------|--------|
| Risk    | HIGH   |
| Score   | 58/100 |
| Findings| 3      |
```

→ [Full workflow template](docs/install/github-action.yml)

---

## Rust runtime — `yamtam-rt`

17 subcommands. Zero Python dependency.

```bash
yamtam scan .          # security scan — secrets, CVEs, supply chain risks
yamtam graph .         # knowledge graph — file deps, import resolution
yamtam vault search Q  # search 8,550 skills by keyword
yamtam hunt .          # hunt for security patterns (OWASP, injection, SSRF)
yamtam fix .           # auto-fix rule violations
yamtam doctor .        # full system health check
yamtam map .           # blast radius map — what can the agent touch?
yamtam ci              # run all gate checks (used in CI)
```

**Benchmark:** `yamtam scan` on a 10k-file repo: **1256x faster** than the Python equivalent.

---

## Safety architecture

```
core/
├── hooks/          # 46 PreToolUse / PostToolUse / Stop hooks
├── rules/          # 61 enforced rules (security, correctness, UI, git)
├── scripts/        # safe-run.sh, drift-check.sh, secure-logger.sh
├── gates/          # truth_gate.md, action_gate.md
├── agents/         # 93 specialist agent definitions
├── skills/         # 8,550 SKILL.md files
└── memory/
    ├── L1_atomic/  # permanent facts — persist across sessions
    └── L2_session/ # session state — auto-expires
```

Key properties:
- **Merkle audit chain** — every action logged, tamper-detected
- **BFT consensus** — 3-of-N vote required for core infrastructure writes
- **Sovereign overlord** — human can freeze all 93 agents instantly
- **Honeypot layer** — decoy files/env vars catch compromised agents

---

## What it looks like in practice

```bash
# Agent tries: git push --force origin main
[yamtam/02-terminal-validator] BLOCKED — force push prohibited
  Command : git push --force origin main
  Gate    : L1
  Fix     : Run gate checks first, then push without --force

# Agent tries: curl http://169.254.169.254/latest/meta-data/
[yamtam/network-egress] BLOCKED — SSRF target detected
  Host    : 169.254.169.254
  Gate    : L3
  Exit    : 3

# Agent tries to install unvetted package
[yamtam/dependency-vetting] BLOCKED — unvetted package install
  Package : req-uests@2.28.0
  Reason  : typosquatting (similar to 'requests')
  Gate    : L4
```

---

## Built in 1 month

One person. No team. No funding. Starting from zero in February 2026.

- **Month 1:** Hook architecture, safety gates, Python CLI
- **Month 2:** Rust runtime (`yamtam-rt`), 93 agents, 8,550 skills, multi-harness support

The 8,550 skills cover: frontend, backend, AI/LLM, security, Kubernetes, WebAssembly, DevOps, databases, testing, and more.

---

## Add YAMTAM to your repo

**Static badge** — paste into your README:

```markdown
[![Protected by YAMTAM](https://img.shields.io/badge/protected%20by-YAMTAM%20ENGINE-ff6b35?style=for-the-badge)](https://github.com/phamlongh230-lgtm/yamtam-engine)
```

**Dynamic audit badge** — shows live security score:

```bash
yamtam badge .           # prints badge markdown with current score
yamtam badge . --json    # machine-readable output
```

**GitHub Action** — scan every PR automatically:

```yaml
- uses: phamlongh230-lgtm/yamtam-engine/.github/actions/scan@main
  with:
    fail-on: 'high'
```

→ [Full workflow template](docs/install/github-action.yml)

---

## License

Apache 2.0 — free forever.

---

## Contact

**Vũ Văn Tâm** · Vietnam · 17

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [phamlongh230-lgtm.github.io/yamtam-engine](https://phamlongh230-lgtm.github.io/yamtam-engine/) |
| GitHub | [phamlongh230-lgtm](https://github.com/phamlongh230-lgtm) |
