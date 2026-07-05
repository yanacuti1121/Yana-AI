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
  <img src="https://img.shields.io/badge/version-v0.43.1-orange?style=for-the-badge" />
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

## What it catches

Destructive git operations, `rm` outside the workspace, piping the internet into bash, and unvetted package installs, via 55 agent hooks backed by a Rust runtime (`yana-rt`). Under the hood: 101 specialist agents, 1,989 skills, and 70 enforced rules, checked 826 ways in CI. See the [architecture reference](docs/reference/architecture.md) for the full gate-by-gate breakdown.

## Verify it's working

```bash
yana-ai doctor .      # checks hook wiring, config integrity, gate health
yana-ai audit .       # scans your repo's agent config for risky setup
```

## Beyond the firewall

The engine also ships a [CLI with a task router, mission dispatcher, and multi-agent launcher](docs/reference/cli-reference.md), a [GitHub Action](docs/reference/github-action.md) for scanning every PR, and [Yana](docs/reference/yana-web.md), a chat UI built on the same core.

**→ [Full documentation & demo](https://yanacuti1121.github.io/Yana-AI/)** · [Architecture](ARCHITECTURE.md) · [Vision](VISION.md) · [Roadmap](ROADMAP.md) · [Versioning](VERSIONING.md)

## Honest limits

Rules are deterministic patterns: they catch known-dangerous shapes, not novel attacks. Full details, including what is documented policy versus what is actually wired today, live in [Known Limitations](docs/reference/known-limitations.md). If a gate blocks too much or too little, [open an issue](https://github.com/yanacuti1121/yana-ai/issues); real-world reports are how the gates get sharper.

---

**Vũ Văn Tâm** · Vietnam · 17

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana | [yanai-production.up.railway.app](https://yanai-production.up.railway.app) |

Apache-2.0. Built on ideas, patterns, and tooling from the open-source community, including projects licensed under Apache 2.0, MIT, and other permissive licenses, all used in compliance with their respective licenses. Where specific projects directly influenced design decisions, they are credited in the relevant source files and rule documentation.
