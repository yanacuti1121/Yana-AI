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

<p align="center">
  <a href="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml"><img src="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://crates.io/crates/yana-rt"><img src="https://img.shields.io/crates/v/yana-rt?logo=rust&color=ce422b" alt="yana-rt on crates.io"></a>
  <a href="https://pypi.org/project/yana-ai/"><img src="https://img.shields.io/pypi/v/yana-ai?logo=pypi&color=3775a9" alt="yana-ai on PyPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-2563eb" alt="Apache 2.0 license"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-2e8b75" alt="Contributions welcome"></a>
</p>

<p align="center"><em>Created by Vũ Văn Tâm · Vietnam</em></p>

---

## Models propose. Yana decides. Humans stay in charge.

Yana is the control plane between an AI and real power. A model can say what it
wants to do. Yana decides whether that is allowed, and a person can always stop it.

```text
Model        proposes an action
   |
Authority    is this agent allowed to ask?
   |
Capability   what exact power is this?  (a small, fixed set)
   |
Policy       may it happen now?  rules first, then a human
   |
Executor     performs only the permitted operation
```

Any model goes through the same path: Claude, GPT, Gemini, DeepSeek, or one
running on your own machine. Skills teach an agent how to work; only a
capability can grant permission to act.

## System structure

| Component | What it does | Where | Status |
| --- | --- | --- | --- |
| **Yana Studio** | Desktop workspace for working with AI on a real project. | [`tools/yana-studio`](tools/yana-studio) | Live |
| **Runtime (`yana-rt`)** | Rust engine: one turn loop and one authority contract for local and cloud models, 19 providers. | [`src/`](src) | Live |
| **Governance** | Capability manifests, human approval, hash-chained audit log, core-lock integrity, and Giám Thị, an independent watcher that can halt every session. | [`core/`](core) | Live |
| **Harness adapters** | Claude Code, Codex, Cursor and Antigravity, governed through generated hooks, rules and gates. Enforcement strength differs per host. | [`adapters/`](adapters) | Live, varies by host |
| **Knowledge layer** | 100 agents and 2,026 skills that teach agents how to work. They grant no permissions. | [`core/agents`](core/agents), [`core/skills`](core/skills) | Live |
| **Yana OS** | Local management plane: agent identity, autonomy levels, quotas, health, quarantine. | [`src/os`](src/os) | In development |
| **Yana Wheelbot** | Robotics platform on ESP32-S3, in its own repository. | [`yana-wheelbot`](https://github.com/yanacuti1121/yana-wheelbot) | Experimental |

`Live` means shipped and in use. `In development` means real code exists but is
not feature-complete. `Experimental` means opt-in and not independently verified.

`yana-rt` has 39 subcommands. Zero Python dependency. This is the source-defined count across feature builds, including feature-gated ones.

```text
core/
├── hooks/    # 66 PreToolUse / PostToolUse / Stop hooks
├── rules/    # 71 enforced rules
├── agents/   # 100 specialist agents
├── skills/   # 2,026 skills
└── config/
    └── core-lock.json    # SHA-256 manifest — 287 core files pinned
```

## Yana Studio

One window for the things you switch between when working with AI on a project:

- **Files and editor:** open a real folder, search across it, edit with CodeMirror. Saves detect outside changes before overwriting.
- **Terminals:** real PTY sessions in tabs, or a grid of up to 12.
- **Git:** read-only status, worktrees and diffs.
- **Chat:** streamed through `yana-rt`, with local or cloud models under the same authority path as everything else.
- **Governance telemetry:** what was allowed, what was blocked, and why.

Download from the [latest release](https://github.com/yanacuti1121/Yana-AI/releases/latest)
or [yana.vutam.link](https://yana.vutam.link).

| Platform | Installer |
| --- | --- |
| macOS, Apple Silicon | `.dmg` or `.zip` |
| Windows | `.exe`, x64 or ARM64 |
| Linux | `.deb` or `.AppImage` |

Each release lists its own assets, so check that your platform is there, and verify
against `SHA256SUMS` when provided. The macOS build is ad-hoc signed and **not
notarized** (no Apple Developer membership yet), so Gatekeeper warns on first
launch; [docs/MACOS_INSTALL.md](docs/MACOS_INSTALL.md) shows the two official ways to open it.

## Command line

```bash
pip install yana-ai    # Python CLI
yana-ai install        # add Yana's hooks and rules to your repo
yana-ai doctor .       # check that everything is wired
cargo install yana-rt  # native runtime, no Python needed
```

Needs Python 3.11+ (or Rust), Git, and one supported harness. All commands are in
[COMMANDS.md](COMMANDS.md). Yana is not published to npm, see [VERSIONING.md](VERSIONING.md).

## What protects you, and where it stops

- **Audit log:** hash-chained, so editing or deleting a line is detectable. It is tamper-detectable, not tamper-proof.
- **Core-lock:** a SHA-256 manifest detects changed, deleted or injected files in `core/`.
- **Human gate:** force-push, publish, deploy and delete need confirmation in the current session; earlier approval does not carry over.
- **Giám Thị:** opt-in, runs outside any AI session, and on a finding locks every later tool call until a person removes the lock.
- **Limits:** `guard-destructive.sh` matches command strings, not a full shell parse, so a deliberately crafted command can slip past it. Browser-only web deployments without the Rust runtime are not fully governed. Details: [known limitations](docs/reference/known-limitations.md).

## More

[ARCHITECTURE.md](ARCHITECTURE.md) · [PHILOSOPHY.md](PHILOSOPHY.md) · [ROADMAP.md](ROADMAP.md) · [CHANGELOG.md](CHANGELOG.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [Acknowledgements](ACKNOWLEDGEMENTS.md) · [Lineage](docs/history/LINEAGE.md)

Built by one person, no team, no funding: **Vũ Văn Tâm**, Vietnam ·
[yana.vutam.link](https://yana.vutam.link/) · phamlongh230@gmail.com · [Apache 2.0](LICENSE)
