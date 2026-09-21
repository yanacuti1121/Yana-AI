<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/yana-banner-dark.svg">
    <img src="docs/yana-banner-light.svg" alt="Yana AI" width="760">
  </picture>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.vi.md">Tiếng Việt</a> · <a href="README.ko.md">한국어</a> · <a href="README.zh.md"><strong>中文</strong></a>
</p>

<h1 align="center">Yana AI 🐰</h1>

<p align="center">
  <a href="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml"><img src="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://crates.io/crates/yana-rt"><img src="https://img.shields.io/crates/v/yana-rt?logo=rust&color=ce422b" alt="yana-rt on crates.io"></a>
  <a href="https://pypi.org/project/yana-ai/"><img src="https://img.shields.io/pypi/v/yana-ai?logo=pypi&color=3775a9" alt="yana-ai on PyPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-2563eb" alt="Apache 2.0 license"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-2e8b75" alt="Contributions welcome"></a>
</p>

<p align="center"><em>由 Vũ Văn Tâm 创建 · 越南</em></p>

---

## 模型提出建议，Yana 做决定，人类掌握最终权力。

Yana 是位于 AI 与真实权力之间的控制平面。模型可以说出它想做什么，
这件事是否被允许由 Yana 决定，而人类随时可以叫停。

```text
Model        提出一个动作
   |
Authority    这个 agent 有资格提出请求吗？
   |
Capability   这具体是哪一种权力？（一个小而固定的集合）
   |
Policy       现在可以执行吗？先看规则，再看人
   |
Executor     只执行被允许的操作
```

所有模型都走同一条路径：Claude、GPT、Gemini、DeepSeek，或者运行在你自己机器上的模型。
Skill 教 agent 如何工作；只有 capability 才能授予行动的权限。

## 系统结构

| 组件 | 作用 | 位置 | 状态 |
| --- | --- | --- | --- |
| **Yana Studio** | 在真实项目中与 AI 协作的桌面工作区。 | [`tools/yana-studio`](tools/yana-studio) | 已上线 |
| **Runtime (`yana-rt`)** | Rust 引擎：为本地与云端模型提供同一个 turn 循环和同一份 authority 契约，共 19 个 provider。 | [`src/`](src) | 已上线 |
| **Governance** | Capability 清单、人工审批、哈希链审计日志、core-lock 完整性检查，以及可以叫停所有会话的独立监督者 Giám Thị。 | [`core/`](core) | 已上线 |
| **Harness 适配器** | 通过自动生成的 hook、rule 和 gate 管控 Claude Code、Codex、Cursor 与 Antigravity。执行强度因宿主而异。 | [`adapters/`](adapters) | 已上线，因宿主而异 |
| **知识层** | 100 个 agent 和 2,026 个 skill，教 agent 如何工作。它们不授予任何权限。 | [`core/agents`](core/agents), [`core/skills`](core/skills) | 已上线 |
| **Yana OS** | 本地管理平面：agent 身份、自主等级、配额、健康状态、隔离。 | [`src/os`](src/os) | 开发中 |
| **Yana Wheelbot** | 基于 ESP32-S3 的机器人平台，位于独立仓库。 | [`yana-wheelbot`](https://github.com/yanacuti1121/yana-wheelbot) | 实验性 |

`已上线` 表示已发布并在使用。`开发中` 表示已有真实代码但功能尚不完整。
`实验性` 表示需要主动开启，且尚未经过独立验证。

`yana-rt` 有 39 个子命令，不依赖 Python。这是按源码统计、涵盖所有构建配置（包括由 feature 开关控制的命令）的数量。

```text
core/
├── hooks/    # 66 个 PreToolUse / PostToolUse / Stop hook
├── rules/    # 71 条强制规则
├── agents/   # 100 个专项 agent
├── skills/   # 2,026 个 skill
└── config/
    └── core-lock.json    # SHA-256 清单 — 已锁定 287 个核心文件
```

## Yana Studio

把你在项目中使用 AI 时需要来回切换的东西放进一个窗口：

- **文件与编辑器：** 打开真实的文件夹，跨整个项目搜索，用 CodeMirror 编辑。保存时会先检测外部改动，避免覆盖。
- **终端：** 真实的 PTY 会话，按标签页排列，或最多 12 个的网格。
- **Git：** 只读的状态、worktree 和 diff。
- **聊天：** 通过 `yana-rt` 流式输出，本地或云端模型与其他一切走同一条 authority 路径。
- **治理遥测：** 什么被允许、什么被拦截，以及原因。

从[最新发布](https://github.com/yanacuti1121/Yana-AI/releases/latest)
或 [yana.vutam.link](https://yana.vutam.link) 下载。

| 平台 | 安装包 |
| --- | --- |
| macOS，Apple Silicon | `.dmg` 或 `.zip` |
| Windows | `.exe`，x64 或 ARM64 |
| Linux | `.deb` 或 `.AppImage` |

每个发布版本都列出自己的文件，请确认其中包含你的平台，并在提供 `SHA256SUMS`
时进行核对。macOS 版本为 ad-hoc 签名，**尚未经过 Apple 公证**（项目暂无
Apple Developer 会员资格），因此首次启动时 Gatekeeper 会给出警告；
[docs/MACOS_INSTALL.md](docs/MACOS_INSTALL.md) 介绍了两种官方的打开方式。

## 命令行

```bash
pip install yana-ai    # Python CLI
yana-ai install        # 把 Yana 的 hook 和规则加入你的仓库
yana-ai doctor .       # 检查一切是否连接正确
cargo install yana-rt  # 原生运行时，无需 Python
```

需要 Python 3.11+（或 Rust）、Git，以及一个受支持的 harness。全部命令见
[COMMANDS.md](COMMANDS.md)。Yana 不发布到 npm，参见 [VERSIONING.md](VERSIONING.md)。

## 什么在保护你，边界在哪里

- **审计日志：** 以哈希链相连，因此修改或删除任何一行都能被发现。它做到的是可检测篡改，而不是杜绝篡改。
- **Core-lock：** SHA-256 清单可发现 `core/` 中文件被改动、删除或被植入。
- **人工关卡：** force-push、发布、部署和删除需要在当前会话中确认，之前的批准不会延续。
- **Giám Thị：** 需主动开启，运行在任何 AI 会话之外；一旦发现问题，会锁定此后所有工具调用，直到有人手动解除。
- **局限：** `guard-destructive.sh` 匹配的是命令字符串，而不是完整解析 shell，所以刻意构造的命令可能绕过它。没有 Rust 运行时、仅在浏览器中部署的 Web 版本没有得到完整治理。详情见[已知局限](docs/reference/known-limitations.md)。

## 更多

[ARCHITECTURE.md](ARCHITECTURE.md) · [PHILOSOPHY.md](PHILOSOPHY.md) · [ROADMAP.md](ROADMAP.md) · [CHANGELOG.md](CHANGELOG.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [致谢](ACKNOWLEDGEMENTS.md) · [渊源](docs/history/LINEAGE.md)

由一个人构建，没有团队，没有资金：**Vũ Văn Tâm**，越南 ·
[yana.vutam.link](https://yana.vutam.link/) · phamlongh230@gmail.com · [Apache 2.0](LICENSE)
