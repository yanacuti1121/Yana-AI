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

<p align="center"><strong>一个运行时。连接所有 AI。由人类治理。</strong></p>

<p align="center"><strong>一个本地优先、跨平台的 AI 运行、连接、编排与治理系统 — 以确定性方式控制 AI 可以访问、修改和执行的内容。</strong></p>

<p align="center"><em>你的 AI 可以行动。但由谁决定它能走多远？</em></p>

<p align="center">
  <a href="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml"><img src="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://crates.io/crates/yana-rt"><img src="https://img.shields.io/crates/v/yana-rt?logo=rust&color=ce422b" alt="yana-rt on crates.io"></a>
  <a href="https://pypi.org/project/yana-ai/"><img src="https://img.shields.io/pypi/v/yana-ai?logo=pypi&color=3775a9" alt="yana-ai on PyPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-2563eb" alt="Apache 2.0 license"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-2e8b75" alt="Contributions welcome"></a>
</p>

<p align="center"><em>由 Vũ Văn Tâm 创建 · 越南</em></p>

---

## AI 的行动能力正在增长，治理却还没有跟上。

如今，模型可以检查仓库、修改文件、运行命令、启动代理、调用工具并准备发布。真正困难的问题已经不只是模型有多聪明：

- 一个运行时能否同时连接本地模型、云端模型和编程代理，而不把项目锁定在单一供应商上？
- 所有界面能否共享同一条 capability 边界，而不是各自重复实现安全逻辑？
- 系统能否区分日常自动化与必须由人类决定的主权操作？
- 开发者能否检查“安全”“完成”“已拦截”“已批准”背后的证据？
- 当项目完整性存在疑问时，一个独立 control plane 能否停止所有代理？

**Yana AI 把这些问题变成可以执行的规则。**

Yana 不是另一个 foundation model，也不会取代 Claude、Codex、Cursor、Ollama 或你偏好的运行时。它把这些系统连接到原生执行层、确定性策略门、项目记忆、编排原语以及由人类治理的操作层。

## 选择你的第一个目标

<table>
<tr>
<td width="33%" valign="top">

### 运行本地 AI

使用本地 provider 启动 Rust 终端 workspace。

```bash
cargo install yana-rt
yana-ai-rt --provider ollama
```

支持流式输出、取消、标签页、会话、模型切换和受保护工具。

</td>
<td width="33%" valign="top">

### 治理仓库

把受支持的 adapter surface 应用到现有项目。

```bash
pip install yana-ai
cd your-project
yana-ai install
yana-ai doctor .
```

规则、hook、agent、skill、command 与完整性检查都留在项目中。

</td>
<td width="33%" valign="top">

### 编排工作

通过原生运行时路由任务并创建具备依赖关系的 mission。

```bash
yana-rt route classify "fix auth"
yana-rt mission create "add-auth"
```

从同一个 CLI 使用 evidence、capability、memory、workspace 与 OS control。

</td>
</tr>
</table>

> 第一次使用？从[快速安装](#快速安装)开始。正在构建平台？阅读[架构参考](docs/reference/architecture.md)。正在评估安全边界？请先阅读[已知局限](#已知局限)，再看功能列表。好奇这个项目是怎么走到今天的？阅读[项目历史](docs/reference/history.zh.md)。

## Yana 统一了什么

| 层级 | 为开发者提供的价值 | 主要 surface |
| --- | --- | --- |
| **运行时** | 原生 chat、state、routing、health 与项目操作 | `yana-rt`, `yana-ai-rt` |
| **模型** | 本地优先，同时保留云端 provider | Rust catalog 共 19 个 provider：5 个本地 runtime + 14 个云端/API adapter |
| **适配器** | 在受支持 harness 之间共享一个受治理的项目 contract | Claude Code, Codex, Cursor, Antigravity |
| **编排** | Task、mission、memory、evidence 与 workspace | router, mission dispatcher, event bus |
| **治理** | 确定性检查、audit chain、quarantine、HALT 与 human gate | capability, hook, Yana OS, Giám Thị |

```text
 Terminal · Discord · Electron Desktop       Claude Code · Codex · Cursor · Antigravity
                    │                                           │
                    └──────────── 受治理的入口路径 ──────────────┘
                                         │
                              Giám Thị 根权限
                         HALT · quarantine · human unlock
                                         │
                               Yana control plane
                    policy · identity · evidence · capability
                              ┌──────────┴──────────┐
                              │                     │
                    Rust TurnEngine          项目 adapter
              stream · cancel · tool loop    hook · rule · gate
                     ┌────────┴────────┐
                provider plane    capability plane
                local + cloud      file · Git · process
```

系统只有一套权限层级，但不会假装所有集成都使用同一种机制。终端聊天、Discord 与 Electron Desktop 把类型明确的 turn 提交给 Rust `TurnEngine`。Claude Code、Codex、Cursor 与 Antigravity 仍是原生 harness，通过项目本地的 adapter、hook、rule 与 gate 接受治理。未配置 Rust runtime 的纯浏览器 Yana 部署仍使用旧 JavaScript gateway；README 将它明确记录为兼容性 boundary，而不是夸大为完整受治理路径。

### 一个运行时，多种接口

| 接口 | 连接对象 | 治理边界 |
| --- | --- | --- |
| **终端 + Desktop + 打包 Web** | 标准 Rust catalog 中全部本地与云端 provider | 一个 `TurnEngine`、一条 capability 权限路径、一个 Giám Thị HALT 边界 |
| **Discord** | 经过认证并按频道/用户 allowlist 限制的远程聊天 | 使用同一 provider catalog 与 `TurnEngine`；有意不开放 host 或 tool capability |
| **MCP（opt-in）** | 用于命令检查及受治理 repo、Git、host、process、workspace 操作的 stdio 工具 | 通过 Cargo feature `mcp` 构建；需要人工批准的 workspace 操作仍会被 MCP 拒绝 |
| **Claude Code、Codex、Cursor、Antigravity** | 原生 coding-agent harness | 通过生成的 adapter、hook、rule 与 gate 治理，不假装它们运行在 Yana 进程内部 |

因此，本地 AI 与云端 AI 共用同一运行时契约，但不会被混成同一个信任域。Provider 选择只改变 inference 发生的位置，不会绕过 Yana 的 typed turn、capability、evidence 或人工审批边界。

模型智能可以提出行动。确定性代码与人类权限决定行动是否被允许发生。

## 查看治理如何实际工作

当你的代理尝试做危险操作时，Yana 会拦截它、解释原因并记录下来 —— 在 Claude Code 和 Cursor 上是强制拦截，在 Codex 和 Antigravity 上仅为建议（advisory）。

```bash
pip install yana-ai && yana-ai install   # 接入 hooks（60 秒）
```

> **已知问题，已于 2026-07-25 修复：** 旧版 PyPI 安装的 `yana-rt` 曾可能自我递归并占满 100% CPU — 事件详情见 [CHANGELOG.md](CHANGELOG.md)。`pip install -U yana-ai`（或从未受影响的 `cargo install yana-rt`）即可解决。

然后试着让你的代理做点坏事，看看会发生什么。

<p align="center">
  <img src="docs/assets/demo.gif" alt="Yana AI blocking a force-push, an rm -rf, and a disguised python3 -c inline-script destructive command in real time, entirely locally with no LLM call" width="700" />
</p>

下面每个示例都是 2026-07-04 对 `core/hooks/guard-destructive.sh` 真实运行的实录复制，而非营销文案（这个防护尚未能拦截的内容见[已知局限](docs/reference/known-limitations.md)）：

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

这就是全部的核心理念：确定性（deterministic）规则，本地运行，决策路径中没有 LLM，任何数据都不会离开你的机器。

---

## 问题所在

AI 编程代理会犯错：`rm -rf` 错误目录、强推到 main、编造测试结果。等你发现时，损失已经造成。

Yana AI 位于代理与你的系统之间：每一个有风险的工具调用在执行前都要经过一连串确定性检查。

---

## 它能拦截什么

破坏性的 git 操作、工作区之外的 `rm`、把互联网内容传给 bash、未经审查的包安装，通过由 Rust 运行时（`yana-rt`）支撑的代理 hooks 拦截。

---

## 工作原理

```
代理想要执行一个命令
         ↓
Anti-evasion scan      — 拦截 base64 解码执行、管道到 shell 解释器
Shell sanitization     — 对所有变量加引号，剥离 shell 特殊字符
Egress / SSRF policy   — 已有实现；运行时接线状态因入口而异
Supply-chain vetting   — 已有实现；运行时接线状态因入口而异
Blast-radius cap       — 限制破坏性命令能触及的文件/范围
防篡改审计日志         — 记录每一次被允许和被拦截的操作，哈希链式连接
Human gate             — 不可逆操作（push、publish、delete）需要明确确认
         ↓
执行（或拦截 + 记录）
```

关于哪些是真正接入的 hook、哪些只是代理按惯例遵循的文档化策略，请查看[已知局限](docs/reference/known-limitations.md)，其中直接对照代码本身验证，而非依据描述它的文档。

---

## 快速安装

**→ [pip install](https://pypi.org/project/yana-ai/)** — `pip install yana-ai`

> **说明（2026-07-30）：不再通过 npm 分发。** Yana AI 已不再、也不再计划发布到 npm registry —— 完整经过见 [VERSIONING.md](VERSIONING.md#why-product-has-no-registry)。请使用下面的 `pip` 或 `cargo`。

```bash
# Python CLI — 安装 yana-ai 命令
pip install yana-ai
yana-ai install                # 将 hooks 接入当前项目

# Rust 运行时（对有限范围命令快约 2–12 倍 — 见 BENCHMARK.md）
cargo install yana-rt
```

```bash
# 确认一切都已正确接入
yana-ai doctor .
```

### 环境要求

- Python 3.11+（用于 pip 包）或 Rust/Cargo（用于 `cargo install yana-rt`）
- Git
- 任意 AI 编程工具：[Claude Code](https://claude.ai/code)、Cursor、Windsurf、Aider 等

### 从源码克隆

```bash
git clone https://github.com/yanacuti1121/yana-ai.git
cd yana-ai
npm install
bash install.sh                 # 将 hooks + 配置复制到你的项目
yana-ai doctor                  # 确认
```

---

## 多引擎支持

Yana AI 会适配你正在使用的工具：

```bash
bash core/scripts/switch-engine.sh cursor      # .cursorrules + 真实的 beforeShellExecution 钩子
bash core/scripts/switch-engine.sh codex       # AGENTS.md
bash core/scripts/switch-engine.sh antigravity # .agent/rules/yana-ai.md
bash core/scripts/switch-engine.sh status      # 检查全部 4 个适配器
```

---

## 仓库结构

上面的表格描述了运行时架构。这里是它实际所在的目录树，按每个路径
的作用分组，而不是按字母顺序。有两对名称相似的目录其实完全不同，
在需要区分的地方已在下面注明：

| 路径 | 内容 |
| --- | --- |
| `src/` | `yana-rt` Rust 二进制文件。见下方[`src/` 内部](#src-内部yana-os-和其他平面)。 |
| `core/` | rule/hook/skill/agent 内容、执行它们的 JS/shell 代码，以及 audit + trust 状态（`core/memory/`）。见[安全架构](#安全架构)。 |
| `gates/` | Markdown 格式的 gate **策略规范**（`action_gate.md`、`truth_gate.md` 等）——不同于实现它们的 JS/shell 代码 `core/gates/`。 |
| `scripts/` | 专门用于构建/包装 `yana-rt` 二进制文件的少量脚本——不同于 `core/scripts/` 中 130 多个通用 hook 与安全脚本。 |
| `memory/` | 顶层 L1 atomic fact 与 L2 session 状态——不同于 `core/memory/` 中的 audit 日志与 trust ledger。 |
| `scanner/` | `src/scanner/` 编译并运行的 YAML 风险检查规则定义（`shell-risk-checks.yml`、`auth-credential-checks.yml` 等）。 |
| `policy/`、`guards/`、`router/`、`prompts/` | 其他声明式配置：策略模板、guard 索引、`route.rs` 背后的模型路由策略，以及 system prompt。 |
| `tools/yana-web/` | 浏览器仪表盘（Node 服务端 + 客户端）。 |
| `tools/yana-desktop/` | Electron 桌面壳。 |
| `tools/`（其他） | 独立工具：`airllm-bridge`、`codexmate`、`moss-tts-nano`、`yana-pixel-bridge`，以及少量一次性脚本。 |
| `bin/yana` | 已安装的 CLI 入口。 |
| `adapters/` | 各 harness 的适配器文档（Claude Code、Codex、Cursor、Antigravity）。 |
| `docs/` | 架构说明、ADR、事故记录、docs 站点内容。 |
| `site/` | 用 Astro 构建的营销/文档网站。 |
| `examples/` | spec 示例、context-pack，以及 scanner 自身测试用来扫描的一个故意存在漏洞的测试仓库。 |
| `demo/` | 录制本 README 顶部终端演示的脚本。 |
| `tests/` | Python 测试套件。 |
| `ops/` | 发布签名与 release-gate 服务脚本。 |
| `releases/`、`artifacts/` | 发布日志与构建产物。 |
| `reports/`、`ledger/` | 扫描报告的 schema/模板，以及 token 用量追踪 schema。 |
| `github-app/` | GitHub App 集成。 |
| `vendor/` | Yana AI 借鉴/集成的外部项目的 vendored 参考副本，包括 `hermes-agent`、`openclaw` 和 `penpot`。 |

第五条独立版本化的轴线，即 PyPI 分发的 Python 包，位于 `src/yana_ai/`，
而不是一个独立的顶层目录。

### `src/` 内部：Yana OS 和其他平面

`yana-rt` 是一个二进制文件，但不是一个模块。除了上面描述的 turn
runtime（`runtime/`、`model/`、`capability/`、`chat/`、`remote/`、
`mcp.rs`）之外，`src/` 下还有四个平面：

**Yana OS**（`src/os/`，内部代号 "Program K"）是与 turn 循环分离的
本地管理平面：

- `identity/` — guest / operator / sovereign 认证等级
- `autonomy.rs` — 自主性阶梯（agent 在无人监督下可以做多少）
- `governor.rs` — 在该阶梯之上的行为限制
- `credential.rs` — 凭证处理
- `resource/` — CPU/RAM/PID 配额
- `supervisor.rs` — 读写 HALT 锁文件；这是运行时的 authority chain
  每个 turn 都会调用的函数，也是下文所述独立 watcher 写入的同一个文件
- `service/`（`manager.rs`、`runtime.rs`、`attribution.rs`） — 守护
  进程生命周期管理
- `agent.rs`、`health.rs`、`monitor.rs`、`monitor_service.rs`、
  `state.rs`、`status.rs`、`roadmap.rs`、`platform/`

**安全与 audit**（`guard/`、`scanner/`、`score/`、`evidence/`、
`provenance/`、`filescan/`）是 `yana-rt audit`、`yana-rt hunt` 以及
提交前 rule 扫描背后的工具：高频 PreToolUse hook 的原生 Rust 移植版、
rule 匹配引擎、CRITICAL/HIGH/MEDIUM/LOW 严重程度评分器、Truth Gate
的 provenance，以及一项检查——确认移植到 `core/lib/*_adapted/` 中的
代码仍与其 vendor 来源一致。

**Workspace 与 memory**（`workspace/`、`memory.rs`、`vault/`、
`session_context.rs`）是统一的本地事件存储、L1/L2 fact 系统、带有自身
搜索索引的密钥 vault，以及每个客户端（chat、MCP、Desktop）用来构造
turn 的单一 `SessionContext` 类型。

**运维工具**是 CLI 界面的其余部分：`init`、`doctor`、`fix`、`watch`、
`monitor`、`observability`、`config`、`cost`、`route`、`plugin`、
`task`、`skill_quality`、`spec`、`graph`、`hunt`、`ci`、`design`、
`mission`、`bus`，以及 `flock_v1`（该列表中其余部分都依赖它，以防止
并发写入者破坏状态的跨进程文件锁）。

第五条独立轴线 `src/yana_ai/`（`rt.py`、`cli.py`）是 PyPI 分发的
Python CLI。它与 Rust 二进制文件分开打包和版本化；见 `VERSIONING.md`。

---

## Rust 运行时 — `yana-rt`

所有 feature build 的 source 共定义 34 个子命令，零 Python 依赖。默认 build 暴露 32 个 runtime 命令，Clap 另加可见的 `help` 项；`mcp` 与 `remote` 受 feature gate 控制。

```bash
yana-ai chat                          # 在标准 provider catalog 上运行的受治理流式聊天
yana-ai presentation                  # 提问 → 预览 → 确认 → 下载可编辑 PPTX
yana-ai audit .                       # 安全扫描 — 密钥、CVE、供应链风险
yana-ai graph .                       # 知识图谱 — 文件依赖、导入解析
yana-ai vault search Q                # 按关键词搜索 2,025 个技能
yana-ai hunt .                        # 搜寻安全模式（OWASP、注入、SSRF）
yana-ai fix .                         # 自动修复规则违规
yana-ai doctor .                      # 全面系统健康检查
yana-ai map .                         # blast radius 地图 — 代理能触及什么
yana-ai ci                            # 运行全部 gate 检查（CI 中使用）
yana-ai route classify "fix auth bug" # 任务分类 → simple/complex/external
yana-ai mission create "add-auth"     # 创建并行代理任务
```

### Presentation Studio — 从源材料到可编辑幻灯片

`yana-ai presentation` 并不是一次性的“帮我写几页幻灯片”提示词。它是一个由
人类把关的演示文稿工作流，适合学生、教师、技术汇报，以及所有希望在 AI 创建
文件前先审阅完整计划的用户。

```text
提出明确问题
        ↓
读取 TXT / Markdown / HTML / DOCX / PPTX / PDF 来源
        ↓
生成并显示完整幻灯片大纲
        ↓
确认 · 编辑 · 取消
        ↓
将可编辑 PPTX bundle 写入 Downloads
```

生成之前，Yana 会询问主题、受众、语言、页数、视觉风格、学习目标、源文档、
引用偏好和演讲者备注。在用户确认屏幕上的大纲之前，Yana 不会写入任何演示文件。

```bash
pip install 'yana-ai[presentation]'
yana-ai presentation --provider ollama --model qwen3:14b  # 完全本地运行
yana-ai presentation --no-ai --dry-run                    # 仅预览大纲
yana-ai presentation --pdf                                # 通过 LibreOffice 添加 PDF
```

Presentation Studio 与 chat 使用同一套标准 provider catalog 和 `yana-rt` turn
runtime。Ollama 是默认本地 provider；只有用户明确选择时才使用云端 provider。
API key 通过 stdin 而不是 argv 传给 runtime；源文档被标记为不受信任的参考数据，
而不是可执行指令。

每次确认都会在 `~/Downloads/Yana-Presentations/` 下创建一个不覆盖已有内容的
新目录，其中包括可编辑 `.pptx`、保存 brief/slide/note/provider/model/生成模式
的 `presentation.json`，以及可选 `.pdf`。模型失败默认 fail-closed；只有选择
`--no-ai` 或明确允许 `--fallback` 时才使用 deterministic 输出。

格式要求、自动化、隐私边界与 PDF 支持请参阅
[完整 Presentation Studio 指南](docs/operations/presentation-studio.md)。

**性能基准**（2026-07-23 测得，完整方法见 `BENCHMARK.md`）：
`doctor`/`ci` 这类范围有限的命令比 Python 快约 ~2–12 倍
（主要受启动时间影响）；对整个仓库的 `scan` 在 1.9 万文件规模下收敛到约 1.1 倍
（在这个规模下主要受工作量影响，而非启动时间）。这一行曾经宣称的 `1256 倍`
这个数字此前已被发现一次未经验证
（2026-05-31，提交 `fb6a0cd7`），又被一次无关的 README 恢复
（2026-07-07）带回来——在 `BENCHMARK.md` 中的任何测量里，无论当时还是现在都无法复现。

---

## 安全架构

```
core/
├── hooks/          # 63 个 PreToolUse / PostToolUse / Stop 钩子
├── rules/          # 71 条强制规则（安全、正确性、UI、git）
├── scripts/        # safe-run.sh、verify-core-lock.sh、secure-logger.sh
├── gates/          # truth_gate.md、action_gate.md
├── agents/         # 101 个专业代理定义
├── skills/         # 2,025 个 SKILL.md 文件
├── config/
│   ├── core-lock.json    # SHA-256 清单 — 固定 280 个核心文件
│   └── skills-lock.json  # 技能内容哈希
└── memory/
    ├── L1_atomic/  # 永久事实 — 跨会话保留
    └── L2_session/ # 会话状态 — 自动过期
```

关键特性，均对照实际代码验证，而非仅依据描述它的文档：
- **防篡改哈希链审计日志** — 每个操作都作为哈希链式的 JSONL 条目记录（每条记录包含上一条记录的哈希——是线性链，不是早期 README 误称的 Merkle 树）；篡改已有的一行会在重新计算哈希链时被检测出来（`verify-audit-chain.sh`）
- **Core-lock 完整性** — SHA-256 清单（`core-lock.json`）检测 `core/rules`、`core/hooks`、`core/gates`、`core/scripts` 中的漂移、删除,以及未经审查插入的文件
- **基础设施变更前的审查** — 在变更进入 `core/rules/**`、`core/hooks/**`、`core/gates/**` 或 `core/agents/**` 之前，会派发两个独立的审查代理（security-auditor 加一个配对审查者）；任何一方发现 Safety 级别的问题都会阻止写入，直到人工解决
- **人工确认闸门** — 不可逆操作（force-push、发布、部署、删除）需要在当前会话中获得明确的人工确认，而不是依赖此前的一次性授权
- **独立熔断监视器（"giám thị"）** — opt-in，安装时提示一次是否开启。在真实的操作系统调度器上运行（macOS LaunchAgent / cron），完全在任何 Claude 会话之外，每隔几小时检查一次 core-lock 完整性、audit-chain 完整性，以及安全敏感路径的近期变更。一旦发现异常，就会写入一个锁文件，使该仓库此后每个会话的每一次工具调用都被直接拒绝——没有绕过开关，也没有任何代码路径（包括这个 hook 自身或监视器自身）能够解除它。只有人工在读过锁文件里的原因后手动删除该文件，才能恢复。这种不对称是刻意设计的：能让会话停下来的东西，不应该是能让它重新启动的东西，这样即便代理被攻陷或只是判断错误，也无法给自己判卷后自行解锁。

---

## 实际效果

以下每个示例都是 2026-07-04 对 `core/hooks/guard-destructive.sh` 真实运行的实录复制，而非营销文案。这个防护*尚未*能拦截的内容见下方"已知局限"。

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

---

## 已知局限

诚实，不夸大：直接对照真实运行的 hooks 验证，而非依据描述它们的文档。

- **`guard-destructive.sh` 是命令字符串防护，不是真正的 shell 解析器。** 它按空白分割 token，匹配已知的危险写法（`rm -rf`、`git push --force`、`git clean -f`、`git reset --hard`、直接 push 到 main/master）。截至 2026-07-05（一天内经过 4 轮对抗性审查），它已能规范化整 token 级别的引号（`"..."`、`'...'`、`$'...'`）、反斜杠转义、`${IFS}` 风格的变量拼接，并对 git/rm 调用旁的花括号展开形式直接拒绝——但它**尚未**处理 token 内部的引号拼接（同一个词内交替出现带引号和不带引号的片段、中间没有空白分隔，例如 `--forc"e"`——真实 shell 会将其解析为 `--force`，这个防护则不会）。要解决这个问题需要逐字符的引号状态解析器，而不是再加一个 token 比较：这被记录为一个长期的设计问题，而不是被悄悄宣称已经解决。精心构造的命令仍可能绕过这个防护；正常输入命令的代理会被拦下。
- **SSRF 校验已在 Claude、Codex 与 Claude 插件清单中启用，但供应链保护仍取决于运行时入口。** `tool-validator.sh` 现已保护受支持的 Bash、写入与 WebFetch 入口。`dependency-safety-gate.sh` 和 `supply-chain-guard.sh` 仍仅由插件注册，因此在确认当前安装入口前，不应宣称一定会拦截仿冒包名或危险的软件包安装。自动生成的执行路径证据见 `docs/operations/hook-execution-path-audit.md`。
- **`core/` 和 `.claude/` 是同一份源码按设计保留的两个副本**，不是意外的重复。`core/` 是权威版本，`.claude/` 是 Claude Code 在运行时读取的版本，`core/config/core-lock.json` 固定了两者的 SHA-256 哈希。如果你看到它们内容重复，那是有意为之，不是需要"清理"的 bug。
- **macOS 默认不自带 GNU `timeout`/`gtimeout`。** 有个 hook 曾假定它一定存在，在受影响的机器上曾悄无声息地从未真正执行过任何受保护的 hook，直到这个问题被发现并修复（2026-07-04）。现在它会优雅降级（不设超时上限运行）而不是悄悄什么都不做，但这类"假定环境存在"的 bug 正是你 fork 或扩展这些 hooks 时需要特别留意的。

发现了这里没列出的问题？[提交 issue](https://github.com/yanacuti1121/yana-ai/issues)。真实世界的反馈才是让这样的防护真正变得更锋利的方式，而不是给它应该做什么再加一份文档。

---

## Yana 任务路由器

每个任务在执行前都会被分类：不再需要猜测应该内联处理还是派发给代理。

```bash
yana-ai route classify "implement JWT refresh token"
# → { "route": "complex", "gate": "harness", "confidence": 0.36,
#     "suggested_agents": ["security-engineer", "backend-developer"] }

yana-ai route classify "xem git log 10 commit"
# → { "route": "simple", "gate": "auto", "confidence": 0.43 }

yana-ai route classify "deploy to production"
# → { "route": "external", "gate": "confirm", "confidence": 0.30 }
```

六种路由：
- **simple** → Yana 直接处理（只读，不需要代理）
- **skill** → 与 2,025 条技能索引匹配，派发到确切的技能代理
- **learn** → 路由到 `hoc-tap`（苏格拉底式学习助手，遇到"learn"、"explain"、"why" 等词触发——支持英语和越南语）
- **daily** → 路由到 `daily-assistant`，总结 / 计划 / 起草（遇到"summarize"、"write an email"、"make a plan" 等词触发——支持英语和越南语）
- **complex** → 携带明确范围的简报派发给专业代理
- **external** → 停止，在继续前请求人工确认

按领域选择代理：认证任务 → `security-engineer`，数据库 → `database-expert`，UI → `frontend-developer + ui-ux-designer`。

---

## Mission 调度器

带依赖解析的分波次并行编排，用 Rust 编写，零 Python。

```bash
# 1. 创建 mission
MID=$(yana-ai mission create "implement-auth" | awk '/id:/{print $2}')

# 2. 声明带依赖关系的任务
yana-ai mission task $MID "design-schema"   --agent database-expert --produces schema.sql
yana-ai mission task $MID "implement-auth"  --agent backend-developer \
  --consumes schema.sql --produces src/auth.ts
yana-ai mission task $MID "write-tests"     --agent test-engineer \
  --consumes src/auth.ts --produces tests/auth.test.ts

# 3. 派发第 1 波 — 只派发依赖已满足的任务
yana-ai mission dispatch $MID --max-parallel 3
# → 为每个就绪代理生成 JSON 简报

# 4. 标记完成，派发下一波
yana-ai mission done $MID "design-schema" --evidence schema.sql
yana-ai mission dispatch $MID  # → 解锁第 2 波

# 取消 / 重试卡住的任务
yana-ai mission cancel $MID "implement-auth"
yana-ai mission retry  $MID "write-tests"
```

派发时任务会被标记为 **Running**：重复运行 `dispatch` 永远不会重复派发同一个任务。

---

## 多代理启动器

以硬性限制和终止开关并行启动多个代理：

```bash
# 启动 3 个代理，最多同时运行 3 个
bash core/scripts/multi-agent-launch.sh start \
  --agents "scanner,auditor,qa-team" \
  --concurrency 3

# 实时状态
bash core/scripts/multi-agent-launch.sh status

# 停止某个特定代理
bash core/scripts/multi-agent-launch.sh kill scanner

# 终止开关 — 立即停止全部
bash core/scripts/multi-agent-launch.sh kill all

# 查看某个代理的日志
bash core/scripts/multi-agent-launch.sh log auditor
```

或用任务列表文件驱动：
```bash
# tasks.txt — 每行一个任务：agent_name:任务描述
echo "scanner:scan the whole repo
auditor:check the hooks
qa-team:run the test suite" > tasks.txt

bash core/scripts/multi-agent-launch.sh start --tasks-file tasks.txt --concurrency 4
```

`status` 显示 6 种状态：`working`（存活，日志最近有更新）、`blocked`（存活，但日志已超过 `YANA_AGENT_STALE_SECONDS` 秒（默认 30）未更新，可能卡住了）、`done`（以 0 退出）、`failed`（以非 0 退出）、`unknown`（进程已消失但从未写入自己的退出码，例如被 SIGKILL 之后）、`killed`（通过 `kill` 停止）。

更多示例输出和细节见[完整 CLI 参考文档](docs/reference/cli-reference.md)，或查看 **[COMMANDS.md](COMMANDS.md)** 了解所有 `yana-ai` 命令。

---

## GitHub Action

在每个 PR 上扫描仓库的 AI 代理配置：密钥、权限、hook 注入、MCP 漏洞。

```yaml
# .github/workflows/yana-ai-scan.yml
- uses: yanacuti1121/yana-ai/.github/actions/scan@main
  with:
    fail-on: 'high'       # 发现 HIGH 或 CRITICAL 时使 CI 失败
    diff-only: 'true'     # 仅扫描 PR 中变更的文件
    comment-on-pr: 'true' # 将结果摘要发布为 PR 评论
```

在每个 PR 上发布评论：

```
🟠 Yana AI Security Scan — HIGH

| Metric  | Value  |
|---------|--------|
| Risk    | HIGH   |
| Score   | 58/100 |
| Findings| 3      |
```

→ [完整工作流模板](docs/install/github-action.yml) · [完整参考文档](docs/reference/github-action.md)

---

## MCP 集成 — Buzz

`yana-rt mcp` 通过 stdio MCP 工具暴露标准破坏性命令检查，以及受治理的
repo、Git、host、process 与 workspace 操作。它是可选功能，位于 `mcp`
Cargo feature 之后，不包含在默认二进制文件中。该 transport 无法凭空
产生人工批准；仅允许在人工批准后执行的 workspace 操作仍会被 MCP
server 拒绝。

它的第一个真实使用方是 [Buzz](https://github.com/block/buzz)——一个
自托管的团队工作区，AI 代理在其中是拥有自己密钥的正式成员。Buzz 的
`buzz-acp` 可以启动任何支持 ACP 的代理（goose、codex、claude-code，或
`buzz-agent`），并可以通过 `BUZZ_ACP_MCP_COMMAND` 接入额外的 MCP
服务器——指向 Yana AI 后，Buzz 编排的每个代理都会获得同样的命令检查，
不只是 Claude Code。

```bash
cargo build --release --features mcp
export BUZZ_ACP_MCP_COMMAND=/path/to/Yana-AI/scripts/yana-rt-mcp-wrapper.sh
```

需要这个 wrapper 的原因是 `buzz-acp` 调用 `BUZZ_ACP_MCP_COMMAND` 时不带
任何参数，而 `yana-rt` 需要 `mcp` 子命令——完整设置方法（生成密钥对、
向 relay 注册）以及已验证的 stdio JSON-RPC 记录，见
[docs/programs/buzz-mcp-integration.md](docs/programs/buzz-mcp-integration.md)。
注意：这只是让被启动的代理*可以使用*该检查——它是否会在运行命令前真正
调用，取决于该代理自身的工具使用策略，没有任何机制强制它这么做。

---

## Yana AI（网页产品）

**[在线体验 →](https://yanai-production.up.railway.app)** · **[下载桌面版 →](https://yanacuti1121.github.io/Yana-AI/desktop.html)** · **[命令参考 →](https://yanacuti1121.github.io/Yana-AI/commands.html)** · **[最新版本 →](https://github.com/yanacuti1121/Yana-AI/releases/latest)**

Yana 是构建在 Yana AI core 之上的第一个终端用户界面。Electron Desktop 应用使用本地 Rust runtime 处理受治理的 turn；纯浏览器部署在连接可信本地 runtime 之前仍是兼容性 surface。

```text
Electron Desktop → local NDJSON adapter → yana-rt headless
                                      → Giám Thị + Yana 权限检查
                                      → TurnEngine
                                      → provider 或获批 capability

纯浏览器 web → 旧 JavaScript gateway → provider
               （明确的兼容性 boundary，不是标准受治理路径）
```

- 无需注册：使用你自己的 API key
- 🔐 **加密密钥库** — 密钥以 AES-256-GCM 存储，主密钥不可导出（WebCrypto + IndexedDB），从不以明文存在
- **标准 Rust catalog：**19 个 provider — Anthropic、OpenAI、Gemini、Groq、DeepSeek、OpenRouter、xAI、Novita、NVIDIA、MiniMax、GLM、Hugging Face、9Router、Kimi、Ollama、LM Studio、llama.cpp、TurboFieldfare、AirLLM
- **Electron Desktop：**17 个已配置 provider 使用 Rust headless 路径；llama.cpp 与 AirLLM 当前属于 runtime/terminal 集成，并非 Desktop Settings 项

**常用 provider 设置示例**，使用你自己的密钥，密钥在本地加密（从不发送给 Yana AI）：

| 提供商 | 类型 | 设置方式 |
|----------|------|-------|
| **Claude** | 云端 | API key → [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **OpenAI** | 云端 | API key → [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Gemini** | 云端 | API key → [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| **Groq** | 云端 | API key → [console.groq.com/keys](https://console.groq.com/keys) |
| **DeepSeek** | 云端 | API key → [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) |
| **OpenRouter** | 云端 | API key → [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| **9Router** | 本地 | `npm install -g 9router` → `9router`（运行于 `localhost:20128`） |
| **Ollama** | 本地 | [ollama.com/download](https://ollama.com/download) → `ollama serve` → `ollama pull llama3.2` |

- 📊 **100% 真实数据** — 实时提供商统计、L1 记忆花园、审计日志健康面板；零演示数字
- 内置技能路由，自然输入即可由 Yana AI 分派到正确的代理
- **非编程用例：** 学习（苏格拉底式学习助手）、日常事务（总结 / 计划 / 起草）
- SSE 流式传输，移动端友好 · **[Electron 桌面应用](https://yanacuti1121.github.io/Yana-AI/desktop.html)** — macOS、Windows、Linux

如果说 Yana AI 是电网，那么 Yana 就是第一座接入这张电网的建筑。

---

## 降低你自己的 token 账单

Yana AI 对代理的行为执行安全防护——它本身并不减少代理读取命令输出时消耗
的 token。如果这才是你真正的痛点，可以搭配使用
[`rtk`](https://github.com/rtk-ai/rtk)，一个专为此设计的独立 Apache-2.0
工具（在代理读取之前过滤/压缩 bash 输出，常见命令下可减少最多 90%）。
不内嵌代码，也不作为依赖——安装方法以及如何接入 Claude Code/Cursor/
Codex/Antigravity，见
[docs/reference/token-optimization.md](docs/reference/token-optimization.md)。

---

## 版本管理

Yana AI 发布到 3 个独立的注册表，各自拥有独立的版本号 — 这是刻意设计，不是混乱（与 Kubernetes、LLVM 类似：组件独立、发布节奏独立）。

| 轴 | 版本 | 注册表 |
|---|---|---|
| 产品（rules/hooks/skills/agents/CLI） | **1.4.2** | 无 —— 不通过 npm 分发，见 [VERSIONING.md](VERSIONING.md#why-product-has-no-registry) |
| Rust 运行时（`yana-rt`） | **1.4.2** | [crates.io/crates/yana-rt](https://crates.io/crates/yana-rt) |
| Python 包 | **1.4.2** | [pypi.org/project/yana-ai](https://pypi.org/project/yana-ai/) |

如果你在本仓库中看到 3 个不同的版本号（包括 `git tag`、2026-07-05 拆分版本轴之前写下的 `ROADMAP.md` 旧条目，或上方徽章），这是正常现象——完整原因见 [VERSIONING.md](VERSIONING.md)。

### v1.4.0 的新内容

三个新的本地优先 provider、一次运行时架构统一，以及一个被忽视了数月之久的安全钩子接线缺口——这次全部补上：

- **新 provider：** Discord 适配器（只读聊天，独立 worker 线程与单轮 panic 隔离，dispatch 队列现已加上上限以应对消息洪泛）；通过轻量 OpenAI 兼容桥接实现的本地 AirLLM provider，带有限流准入（第二个并发请求会收到明确的 `503`，而不是无限排队）、读超时，以及在昂贵的 generate 调用前检查的上下文长度上限；内置在终端聊天里的 Ollama 模型管理（pull/delete/status），现在能正确区分真实的后端失败与确实为空的安装列表。
- **运行时架构：** 聊天层迁移到统一 Rust workspace 之上的标准 Capability Runtime（类型化错误、`SessionContext`、golden 端到端测试）；新增 Host-Native OS Program（平台契约、资源/模型 plane、actor identity、常驻服务）与常驻运行的 OS Service Supervisor 基础设施。
- **最值得关注的安全修复：** `tool-validator.sh` 的 null-byte 检查已悄悄坍缩成一个永远匹配的空 pattern —— 一个 bash 引号陷阱（`$'\x00'` 无法表示真正的 NUL 字节），导致几乎所有 Bash 工具调用都被拒绝。另外：16 个安全钩子（`deploy-gate`、`db-protect`、`api-destruct-guard`、`supply-chain-guard`、`prompt-injection-guard`、`token-scope-guard`、`code-freeze`、`code-quality-gate`、`coverage-gate`、`dependency-safety-gate`、`static-analysis-gate`、`test-runner-gate`、`multi-agent-lock`、`confidence-scorer`、`risk-scorer`、`canary-token-guard`）此前存在于 `core/hooks/` 中，却从未在 `.claude/settings.json` 中被引用过——从未真正执行过——现已接好线，其中 2 个还修复了在缺少 `jq` 时悄悄关闭自身全部检查的问题。本 README「安全架构」一节所述的 halt watcher——统一后的 Giám Thị 控制平面，取代了此前分离的实现。
- **聊天体验：** `yana chat` 新增真实鼠标支持、情境状态提示、`/undo`，以及自定义斜杠命令。
- **运维：** 沙箱 Docker 镜像现在每次 push 都会发布到 GHCR；从零开始加固的 CI —— 所有 GitHub Action 引用均已固定到 commit SHA，`cargo audit`/`pip-audit`/`npm audit` 已接入为必需检查，新增 release-manifest 步骤为每个发布的二进制记录 commit SHA/工具链/artifact SHA256，`main` 分支首次启用 branch protection；修复真实 CVE（`quinn-proto` RUSTSEC-2026-0185、CGNAT 与 IPv4-mapped-IPv6 网段的 SSRF 缺口）。

包含 PR 编号的完整记录：[CHANGELOG.md](CHANGELOG.md)（见 "v1.4.0" 条目）。

---

## 📚 文档

| 文档 | 说明 |
| --- | --- |
| [Journey](JOURNEY.md) | Yana AI 背后的故事 |
| [Philosophy](PHILOSOPHY.md) | 核心信念与长期愿景 |
| [Principles](PRINCIPLES.md) | 指导每个设计决策的工程原则 |
| [Lineage](docs/history/LINEAGE.md) | 带日期、经过证据核实的代码起源记录——这个代码库究竟从何而来 |
| [Acknowledgements](ACKNOWLEDGEMENTS.md) | 对开源社区的致谢与感激 |

---

## 由一个人打造

一个人。没有团队。没有资金。

- Hook 架构、安全网关、Python CLI
- Rust 运行时（`yana-rt`）、101 个代理、2,025 个技能、多引擎支持
- 4 个适配器（Claude Code、Cursor、Codex、Antigravity）

这 2,025 个技能覆盖：前端、后端、AI/LLM、安全、Kubernetes、WebAssembly、DevOps、数据库、测试等。两个针对非编程场景的代理角色：学习（`hoc-tap`）与日常生产力（`daily-assistant`）。

---

## 将 Yana AI 添加到你的仓库

**静态徽章**，粘贴到你的 README：

```markdown
[![Protected by Yana AI](https://img.shields.io/badge/protected%20by-Yana AI%20ENGINE-ff6b35?style=for-the-badge)](https://github.com/yanacuti1121/yana-ai)
```

**动态审计徽章**，显示实时安全评分：

```bash
yana-ai badge .           # 打印带当前评分的徽章 markdown
yana-ai badge . --json    # 机器可读的输出
```

**GitHub Action**，自动扫描每个 PR：

```yaml
- uses: yanacuti1121/yana-ai/.github/actions/scan@main
  with:
    fail-on: 'high'
```

→ [完整工作流模板](docs/install/github-action.yml)

---

## 项目链接

| | |
|---|---|
| 完整命令参考 | [COMMANDS.md](COMMANDS.md) |
| 完整命令参考（CLI + 斜杠命令，网页版） | [yanacuti1121.github.io/Yana-AI/commands.html](https://yanacuti1121.github.io/Yana-AI/commands.html) |
| 贡献指南 | [CONTRIBUTING.md](CONTRIBUTING.md) |
| 行为准则 | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| 安全政策 | [SECURITY.md](SECURITY.md) |
| 许可证 | [Apache 2.0](LICENSE) |

---

## 联系方式

**Vũ Văn Tâm** · 越南 · 17 岁

| | |
|---|---|
| 邮箱 | phamlongh230@gmail.com |
| 网站 | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana Desktop | [yanacuti1121.github.io/Yana-AI/desktop.html](https://yanacuti1121.github.io/Yana-AI/desktop.html) |

---

## English · 🇻🇳 Tiếng Việt · 🇰🇷 한국어

本文档的完整翻译：**[README.md](README.md)**（English）· **[README.vi.md](README.vi.md)**（Tiếng Việt）· **[README.ko.md](README.ko.md)**（한국어）

---

## 起源

这个代码库的根源比本仓库自身的 git 历史（始于 2026-05-17）更早——此前是一个名为 "YAMTAM ENGINE" 的脚手架项目。带日期的起源记录见 [docs/history/LINEAGE.md](docs/history/LINEAGE.md)——区分了哪些是亲自核实过的（zip 内容、内嵌的 git 历史、校验和），哪些只是转述、尚未确认。

---

## 设计影响与来源

Yana AI 采用独立实现。项目研究公开的架构 pattern，并依据官方互操作 contract 实现功能；不会给其他项目换牌，也不会把他人的工作描述成 Yana 自己的成果。

| 来源 | Yana 学习或依据实现的内容 | 来源边界 |
|---|---|---|
| [AAIF Goose](https://github.com/aaif-goose/goose) | provider 无关的 agent runtime，以及 Rust、CLI、Desktop、API surface 的协同 | 在架构 pattern 层面研究的 Apache-2.0 项目；本次 runtime 统一没有复制或 vendor Goose source |
| [Model Context Protocol 规范](https://modelcontextprotocol.io/specification/latest) | 标准 tool/resource 互操作与 protocol boundary | 官方公开规范；Yana 的权限层级、capability policy 与 runtime 为独立设计 |
| [Anthropic streaming 文档](https://platform.claude.com/docs/en/build-with-claude/streaming) | Messages streaming 与 event semantics | 仅作为 provider wire contract；未复用 UI 或 product code |
| [Google Gemini generate-content API](https://ai.google.dev/api/generate-content) | Gemini streaming、content part 与 inline image request semantics | 仅作为 provider wire contract；实现在 Yana provider abstraction 内独立编写 |
| [OpenAI Chat API reference](https://platform.openai.com/docs/api-reference/chat) | OpenAI 兼容 chat、SSE、usage 与 tool-call 字段 | 用于兼容 endpoint 的互操作 contract，并非 UI/branding 来源 |

本次 runtime 统一没有复制 Goose 或表中项目的 source。未来如直接复用代码，必须保留原始 URL、许可证、版权声明与文件级 attribution。

---

## 致谢

Yana AI 建立在开源社区的想法、模式和工具之上，包括采用 Apache 2.0、MIT 及其他宽松许可证的项目。所有第三方来源均按照各自许可证的要求合规使用。本项目无意复制、歪曲或侵犯任何个人或组织的知识产权。当某个具体项目直接影响了设计决策时，会在相关源文件和规则文档中注明出处。
