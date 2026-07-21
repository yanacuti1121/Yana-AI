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
│ v0.43.2 · AI 编程代理的安全防火墙                  │ 上手小贴士                                                                            │
│ 101 agents · 2,016 skills                        │ yana-ai doctor                                                                         │
│ 71 rules · 58 hooks · 108 scripts                │ yana-ai init                                                                           │
│ 170 commands                                     │                                                                                       │
│                                                   │ 最新动态                                                                              │
│                                                   │ v0.43.2 — 修复 Ollama model-id，新增 entry-point verify law                          │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

<h1 align="center">Yana AI</h1>

<p align="center">
  <strong>介于你的 AI 编程代理与 shell 之间的安全防火墙。</strong>
</p>

<p align="center">
  <em>由 Vũ Văn Tâm 打造 · 17 岁 · 越南</em>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.vi.md">🇻🇳 Tiếng Việt</a> · <a href="README.ko.md">🇰🇷 한국어</a> · <strong>🇨🇳 中文</strong>
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

当你的代理尝试做危险操作时，Yana 会拦截它、解释原因并记录下来。支持 Claude Code、Cursor、Windsurf、Antigravity、Kiro、OpenCode、Zed、Gemini、GitHub Copilot、Aider 等更多工具。

```bash
npm install -g yana-ai && npx yana-ai-install   # 接入 hooks（60 秒）
```

然后试着让你的代理做点坏事，看看会发生什么。下面每个示例都是 2026-07-04 对 `core/hooks/guard-destructive.sh` 真实运行的实录复制，而非营销文案（这个防护尚未能拦截的内容见[已知局限](docs/reference/known-limitations.md)）：

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

## 工作原理

```
代理想要执行一个命令
         ↓
Anti-evasion scan      — 拦截 base64 解码执行、管道到 shell 解释器
Shell sanitization     — 对所有变量加引号，剥离 shell 特殊字符
Egress / SSRF policy   — 拦截已知的元数据端点、私有 IP 段
Supply-chain vetting   — 安装包前的仿冒名/CVE 检查清单
Blast-radius cap       — 限制破坏性命令能触及的文件/范围
Merkle audit log       — 记录每一次被允许和被拦截的操作，可检测篡改
Human gate             — 不可逆操作（push、publish、delete）需要明确确认
         ↓
执行（或拦截 + 记录）
```

关于哪些是真正接入的 hook、哪些只是代理按惯例遵循的文档化策略，请查看[已知局限](docs/reference/known-limitations.md)，其中直接对照代码本身验证，而非依据描述它的文档。

---

## 快速安装

**→ [npm install](https://www.npmjs.com/package/yana-ai)** — `npm install -g yana-ai`

```bash
# Claude Code 插件 — npx yana-ai-install 会接入 hooks
# （必需：npm v12+ 默认不再运行 postinstall 脚本）
npm install yana-ai && npx yana-ai-install

# Python CLI
pip install yana-ai

# Rust 运行时（快 1256 倍的扫描器）
cargo install yana-rt
```

```bash
# 确认一切都已正确接入
yana-ai doctor .
```

### 环境要求

- Node.js 18+（用于 npm 包）
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
bash core/scripts/switch-engine.sh cursor    # .cursorrules + 7 个 .cursor/rules/*.mdc
bash core/scripts/switch-engine.sh opencode  # OPENCODE.md
bash core/scripts/switch-engine.sh zed       # .zed/settings.json
bash core/scripts/switch-engine.sh gemini    # GEMINI.md
bash core/scripts/switch-engine.sh copilot   # .github/copilot-instructions.md
bash core/scripts/switch-engine.sh status    # 检查全部 12 个适配器
```

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

## Rust 运行时 — `yana-rt`

26 个子命令，零 Python 依赖。

```bash
yana-ai audit .                       # 安全扫描 — 密钥、CVE、供应链风险
yana-ai graph .                       # 知识图谱 — 文件依赖、导入解析
yana-ai vault search Q                # 按关键词搜索 2,016 个技能
yana-ai hunt .                        # 搜寻安全模式（OWASP、注入、SSRF）
yana-ai fix .                         # 自动修复规则违规
yana-ai doctor .                      # 全面系统健康检查
yana-ai map .                         # blast radius 地图 — 代理能触及什么
yana-ai ci                            # 运行全部 gate 检查（CI 中使用）
yana-ai route classify "fix auth bug" # 任务分类 → simple/complex/external
yana-ai mission create "add-auth"     # 创建并行代理任务
```

**性能基准：** 在一万文件规模的仓库上，`yana-ai audit` 比对应的 Python 实现**快 1256 倍**。

---

## 版本管理

Yana AI 发布到 3 个独立的注册表，各自拥有独立的版本号 — 这是刻意设计，不是混乱（与 Kubernetes、LLVM 类似：组件独立、发布节奏独立）。

| 轴 | 版本 | 注册表 |
|---|---|---|
| 产品（rules/hooks/skills/agents/CLI） | **0.43.2** | [npmjs.com/package/yana-ai](https://www.npmjs.com/package/yana-ai) |
| Rust 运行时（`yana-rt`） | **1.3.3** | [crates.io/crates/yana-rt](https://crates.io/crates/yana-rt) |
| Python 包 | **0.42.3** | [pypi.org/project/yana-ai](https://pypi.org/project/yana-ai/) |

如果你在本仓库中看到 3 个不同的版本号（包括 `git tag`、2026-07-05 拆分版本轴之前写下的 `ROADMAP.md` 旧条目，或上方徽章），这是正常现象——完整原因见 [VERSIONING.md](VERSIONING.md)。

---

## 安全架构

```
core/
├── hooks/          # 58 个 PreToolUse / PostToolUse / Stop 钩子
├── rules/          # 71 条强制规则（安全、正确性、UI、git）
├── scripts/        # safe-run.sh、verify-core-lock.sh、secure-logger.sh
├── gates/          # truth_gate.md、action_gate.md
├── agents/         # 101 个专业代理定义
├── skills/         # 2,016 个 SKILL.md 文件
├── config/
│   ├── core-lock.json    # SHA-256 清单 — 固定 240 个核心文件
│   └── skills-lock.json  # 技能内容哈希
└── memory/
    ├── L1_atomic/  # 永久事实 — 跨会话保留
    └── L2_session/ # 会话状态 — 自动过期
```

关键特性，均对照实际代码验证，而非仅依据描述它的文档：
- **Merkle 审计链** — 每个操作都作为哈希链式的 JSONL 条目记录；篡改已有的一行会在重新计算哈希链时被检测出来（`verify-audit-chain.sh`）
- **Core-lock 完整性** — SHA-256 清单（`core-lock.json`）检测 `core/rules`、`core/hooks`、`core/gates`、`core/scripts` 中的漂移、删除,以及未经审查插入的文件
- **基础设施变更前的审查** — 在变更进入 `core/rules/**`、`core/hooks/**`、`core/gates/**` 或 `core/agents/**` 之前，会派发两个独立的审查代理（security-auditor 加一个配对审查者）；任何一方发现 Safety 级别的问题都会阻止写入，直到人工解决
- **人工确认闸门** — 不可逆操作（force-push、发布、部署、删除）需要在当前会话中获得明确的人工确认，而不是依赖此前的一次性授权

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

## 已知局限

诚实，不夸大：直接对照真实运行的 hooks 验证，而非依据描述它们的文档。

- **`guard-destructive.sh` 是命令字符串防护，不是真正的 shell 解析器。** 它按空白分割 token，匹配已知的危险写法（`rm -rf`、`git push --force`、`git clean -f`、`git reset --hard`、直接 push 到 main/master）。截至 2026-07-05（一天内经过 4 轮对抗性审查），它已能规范化整 token 级别的引号（`"..."`、`'...'`、`$'...'`）、反斜杠转义、`${IFS}` 风格的变量拼接，并对 git/rm 调用旁的花括号展开形式直接拒绝——但它**尚未**处理 token 内部的引号拼接（同一个词内交替出现带引号和不带引号的片段、中间没有空白分隔，例如 `--forc"e"`——真实 shell 会将其解析为 `--force`，这个防护则不会）。要解决这个问题需要逐字符的引号状态解析器，而不是再加一个 token 比较：这被记录为一个长期的设计问题，而不是被悄悄宣称已经解决。精心构造的命令仍可能绕过这个防护；正常输入命令的代理会被拦下。
- **SSRF/元数据端点拦截以及仿冒包名/未审查包安装拦截目前只是文档化的策略，尚未接入为实际运行的 hook。** 早期版本的 README 曾把这些展示为可运行的示例——直接验证后（2026-07-04，2026-07-05 再次确认）发现，目前接入的任何 `PreToolUse` hook 都不会真正拦截对元数据端点的 `curl`、对 `.env` 文件的 `Read`，或对仿冒名包的 `npm install`。现在如实说明，而不是当作可运行的演示展示。
- **`core/` 和 `.claude/` 是同一份源码按设计保留的两个副本**，不是意外的重复。`core/` 是权威版本，`.claude/` 是 Claude Code 在运行时读取的版本，`core/config/core-lock.json` 固定了两者的 SHA-256 哈希。如果你看到它们内容重复，那是有意为之，不是需要"清理"的 bug。
- **macOS 默认不自带 GNU `timeout`/`gtimeout`。** 有个 hook 曾假定它一定存在，在受影响的机器上曾悄无声息地从未真正执行过任何受保护的 hook，直到这个问题被发现并修复（2026-07-04）。现在它会优雅降级（不设超时上限运行）而不是悄悄什么都不做，但这类"假定环境存在"的 bug 正是你 fork 或扩展这些 hooks 时需要特别留意的。

发现了这里没列出的问题？[提交 issue](https://github.com/yanacuti1121/yana-ai/issues)。真实世界的反馈才是让这样的防护真正变得更锋利的方式，而不是给它应该做什么再加一份文档。

---

## Yana AI（网页产品）

**[在线体验 →](https://yanai-production.up.railway.app)** · **[下载桌面版 →](https://yanacuti1121.github.io/Yana-AI/desktop.html)**

Yana 是构建在 Yana AI 核心之上的第一个界面：一个让任何人无需了解底层基础设施、就能与 AI 聊天、切换提供商并使用技能路由的网页 UI。

```
用户 → Yana AI → Yana AI Core（路由 · 安全 · 上下文）→ 模型
```

- 无需注册：使用你自己的 API key
- 🔐 **加密密钥库** — 密钥以 AES-256-GCM 存储，主密钥不可导出（WebCrypto + IndexedDB），从不以明文存在
- 多提供商：Anthropic · Groq · Gemini · OpenAI · DeepSeek · OpenRouter · 9Router · Ollama

**提供商设置**，使用你自己的密钥，密钥在本地加密（从不发送给 Yana AI）：

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

## 由一个人打造

一个人。没有团队。没有资金。

- Hook 架构、安全网关、Python CLI
- Rust 运行时（`yana-rt`）、101 个代理、2,016 个技能、多引擎支持
- 12 个适配器（Claude Code、Cursor、Windsurf、Antigravity、Kiro、Zed、Gemini、Copilot、Aider…）

这 2,016 个技能覆盖：前端、后端、AI/LLM、安全、Kubernetes、WebAssembly、DevOps、数据库、测试等。两个针对非编程场景的代理角色：学习（`hoc-tap`）与日常生产力（`daily-assistant`）。

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

五种路由：
- **simple** → Yana 直接处理（只读，不需要代理）
- **skill** → 与 2,016 条技能索引匹配，派发到确切的技能代理
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

更多示例输出和细节见[完整 CLI 参考文档](docs/reference/cli-reference.md)。

---

## 联系方式

**Vũ Văn Tâm** · 越南 · 17 岁

| | |
|---|---|
| 邮箱 | phamlongh230@gmail.com |
| 网站 | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana | [yanai-production.up.railway.app](https://yanai-production.up.railway.app) |

---

## English · 🇻🇳 Tiếng Việt · 🇰🇷 한국어

本文档的完整翻译：**[README.md](README.md)**（English）· **[README.vi.md](README.vi.md)**（Tiếng Việt）· **[README.ko.md](README.ko.md)**（한국어）

---

## 致谢

Yana AI 建立在开源社区的想法、模式和工具之上，包括采用 Apache 2.0、MIT 及其他宽松许可证的项目。所有第三方来源均按照各自许可证的要求合规使用。本项目无意复制、歪曲或侵犯任何个人或组织的知识产权。当某个具体项目直接影响了设计决策时，会在相关源文件和规则文档中注明出处。
