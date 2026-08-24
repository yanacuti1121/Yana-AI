# 项目历史 — 从 Claude 模板到 Yana 生态系统

这份文档记录了本项目经历过的每一个命名版本/状态：最初的 Claude Code 谱系、"YAMTAM Engine" 时代、重置为产品式 `v0.x` 编号、更名为 Yana AI，以及由此衍生出的分支（`yana-rt`、`yana-web`、Desktop、`yana-robot`）。

## 核实状态 — 请先阅读这部分

本文档是根据已归档的版本名称和发布说明整理而成，并非逐行重新核对 `git log` 得出。在加入本仓库之前，核心论点已经与本仓库真实的 commit 和 tag 历史做过抽样核对：

- **确认属实。** "YAMTAM" 确实是本项目的旧名称 —— 在真实的 commit message 中原文可查（`docs: clarify YAMTAM scaffold roadmap status`、`feat: import YAMTAM runtime assets`）。整体脉络 —— YAMTAM Engine `v1.x` → 重置为产品式 `v0.x` 编号 → 更名为 Yana AI —— 与本仓库真实的 tag 顺序相符。
- **已更正：实际节奏比叙述暗示的快得多。** 下面的第 I–VI 节读起来像是持续数周或数月的历程。但真实的 tag 时间戳显示,从第一个 commit 到 `v0.x` 产品重置,整个跨度只有大约 **13 天**(2026-05-17 至 2026-05-30)。应把每个"时代"理解为一次很可能有 AI 辅助的极快迭代周期,而不是一段缓慢、深思熟虑的历程。
- **日期存在小幅偏差。** `v1.0.0` 标签的实际 commit 日期是 2026-07-26(日本时间),而非下文所写的 27 日 —— 相差一天,很可能是时区导致的误差。
- **未经独立核实。** `v1.3.0`–`v1.3.11`、`v1.3.40`–`v1.3.53` 以及产品版 `v0.6`–`v0.13` 的功能层面细节 —— 文档本身也只确认了这些版本*存在过*,并未确认它们*具体做了什么*。这些条目应理解为"这个版本确实存在过",而非"这个版本确实做了描述中的事"。
- **完全在本仓库 git 历史之外。** `yana-web`、Chat Terminal、capability-runtime 实验以及机器人分支(第 XII–XV 节)存在于其他独立的仓库/归档中,本仓库的 `git log` 既无法证实也无法证伪。

## 一、Pre-YAMTAM — Claude Code 谱系

| 版本 | 主要变化 |
|---|---|
| Claude Development Template | 最初的基础:agents、hooks、rules、MCP、PRD/项目工作流。 |
| GitNexus integration | 增加代码智能/上下文能力;成为 pre-YAMTAM 分支的重要组成部分。 |
| claude-code v3.0 | 早期调试规范、基础工作流/守护机制;约 69 个文件。 |
| v4.0 | 自动化层:Context Synthesizer、BRAIN_DUMP、Auto-QA。 |
| v5.0 | 大幅转向 spec-driven 开发:spec planner → executor → verifier;新增 context monitoring。 |
| v6.0 | Tool-attention 层;管理 MCP/工具使用与所谓 "MCP Tax" 的上下文成本。 |
| v7.0 | 持久化记忆;新增编码规范/工程规则。 |
| v8.0 | 记忆架构发展为多层体系。 |
| v9.0 | 质量控制代理层:prompt-firewall、token-guard、tool-router、config-doctor、agent-gardener 等。 |
| v9 GitNexus variants | GitNexus 集成/审计快照;包含 `gitnexus-v9`、`v9-real` 及专属代理包。 |
| v10.0 | 侧重可靠性而非单纯增加代理数量:`/resume`、`/route`、`/verify-pack`、记忆路由、会话检查点、审计/修复。 |
| `gitnexus-v10-audited` | 已审计的 v10 快照;成为 YAMTAM ENGINE v1.0 的直接基础。 |
| `claude-code-v1.2-enhanced` | 处于 Claude 时代与 YAMTAM 时代之间的分支;尚需进一步挖掘才能确定具体功能。 |

**过渡节点:** `claude-code-v10.0` → `YAMTAM_ENGINE_v1.0_school-stable_from-gitnexus-v10-audited`。两个归档产物拥有相同的大小/快照谱系,标志着这里大致就是身份从 "Claude Code" 转变为 "YAMTAM Engine" 的节点。

## 二、YAMTAM Genesis — v1.0 → v1.2.9

| 版本 | 功能 |
|---|---|
| YAMTAM ENGINE v1.0 | 将 Claude/GitNexus 体系打包为 YAMTAM ENGINE。 |
| v1.1 | 继续架构开发;归档中还有合并的 `v1.0_v1.1_plans`。 |
| v1.2 | 开始形成明确的安全/控制体系,而不只是单纯的代理包。 |
| v1.2.1 | Truthful Cost Guard —— 可信的成本追踪/展示。 |
| v1.2.2 | Budget Mode Switch —— 基于预算的模式切换。 |
| v1.2.3 | Scope Lock —— 限制 AI 被允许修改的范围。 |
| v1.2.4 | Local Audit Log —— 本地活动记录。 |
| v1.2.5 | E2E Safety —— 端到端流程的安全性。 |
| v1.2.6 | Handoff Mode —— 会话/代理之间的上下文/工作交接。 |
| v1.2.7 | Replit Incident Defense / Production Protection —— 防范危险的生产环境操作。 |
| v1.2.8 | PocketOS Incident Defense / API Destruction Guard —— 扩展对破坏性 API 操作的防护。 |
| v1.2.8-fixed | 对 v1.2.8 的修复/加固。 |
| v1.2.9 | 在 standalone 转型前完成这一轮安全性工作。 |
| v1.2.9-fixed | Hook Test Suite + Release QA,这一阶段的最后一次构建;旧文档记录测试 13/13 通过。 |

一份旧的交接文档完整记录了 `1.2.1 → 1.2.9-fixed` 这条链条,并提醒内部的 `v10`/`v11`/`v12` 是另一套独立的编号体系(`JNMT_YAMTAM_HANDOVER_ALL_IN_ONE_v2.md`)。

## 三、YAMTAM 拆分为独立引擎

这一阶段与其说是 SemVer 发布,不如说是一系列架构状态:

| 状态 | 内容 |
|---|---|
| repo-scaffold | 将 YAMTAM 从旧项目的 `.claude/` 中拆分为独立的仓库/引擎。 |
| scaffold update #1 | 明确路线图和 standalone 状态。 |
| scaffold update #2 | Agent OS gates、prompts、behavior examples。 |
| scaffold metadata | 完善元数据/变更日志。 |
| `yamtam-engine-main` 快照 | standalone 引擎的连续快照;有大量同名但大小不同的归档。 |

从这时起,`core/ gates/ prompts/ docs/ releases/` 这样的结构开始比旧的 `.claude/` 结构更重要。

## 四、YAMTAM v1.3.x — 爆发式增长期

这是最难追溯的一段时期,因为版本迭代极快,单个 SemVer 版本号可能对应多次重新构建。

| 版本 | 已发现的内容 |
|---|---|
| 1.3.0-fixed | 早期 standalone 稳定化。 |
| 1.3.1 | standalone 之后的迭代。 |
| 1.3.2–1.3.10 | 极快的修复/稳定化链条;证据不足以准确对应每个版本的具体功能。 |
| 1.3.11-fixed | 同一版本号下至少有多次构建/重建;不应视为单一产物。 |
| 1.3.12 | Superpowers integration。 |
| 1.3.13 | TDD workflow。 |
| 1.3.14 | Checkpoint + Handoff。 |
| 1.3.15-clean | 干净的分发/构建版本。 |
| 1.3.16 | Claude Code Harness。 |
| 1.3.16-fixed | Harness 版本的修复。 |
| 1.3.17 | Command Suite;代理数量大幅增长,约 19 → 42。 |
| 1.3.18 | 大规模导入代理/技能;约 42 → 83 个代理。 |
| 1.3.19 | 命令导入/扩展。 |
| 1.3.20 | YAMTAM 原生治理机制。 |
| 1.3.21 | Conflict Resolution。 |
| 1.3.22 | 技能与 hook 的审查/加固。 |
| 1.3.23-clean | 干净构建。 |
| 1.3.23-fixed | 修复构建。 |
| 1.3.24 | Claude Forge。 |
| 1.3.25-clean | 干净分发版本。 |
| 1.3.25 rebuild | 同一 SemVer 下的重新构建。 |
| 1.3.26 | 持续扩展。 |
| 1.3.26-fixed | 被找回的归档产物之一。 |
| 1.3.27 | 引擎持续开发。 |
| 1.3.27-fixed | 被找回的产物。 |
| 1.3.28 | 引擎持续开发。 |
| 1.3.28-fixed | 被找回的产物。 |
| 1.3.28 rebuild | 同属 1.3.28 系列的另一个产物。 |
| 1.3.29 | 下一次迭代。 |
| 1.3.30 | 下一次迭代。 |
| 1.3.31 | 32–56 极速发布区间之前的标记点。 |
| 1.3.32–1.3.38 | 确实存在过,但标签是事后补打的。 |
| 1.3.39 | 为 1.3.32–1.3.38 补打的标签。 |
| 1.3.40–1.3.48 | 快速迭代;证据不足,暂不指定具体功能。 |
| 1.3.49 → 1.3.50 | 有迹象表明这两个版本状态非常接近,甚至可能处于同一个 commit 上下文中。 |
| 1.3.51–1.3.53 | 快速演进。 |
| 1.3.54 | 新增 15 个 agentic-AI 技能,技能总数约从 306 → 321。 |
| 1.3.55 | 下一次迭代。 |
| 1.3.56 | 已确认的 1.3.x 链条的终点。 |

之后的一次保留期清理 commit 删除了大量旧的 v1.3.x ZIP 归档,因此 Git 中仍保留历史记录,但归档产物本身已不完整 —— 这正是这一时期出现大量"丢失版本"的主要原因。

## 五、Late YAMTAM

| 版本 | 角色 |
|---|---|
| v1.4.00 | 脱离 1.3.x 的极速发布线。 |
| v1.4.20 | 历史记录中仍被提及的发布产物。 |
| v1.5.0 | 引擎演进。 |
| v1.6.0 | 重大迭代。 |
| v1.6.1 | 补丁。 |
| v1.7.0 | 重大迭代。 |
| v1.7.1 | 补丁。 |
| v1.7.2 | 补丁。 |
| v1.7.3 | 1.7 后期产物。 |
| v1.8.0 | 旧 YAMTAM release-pack 编号体系的最后节点之一。 |

> 这里的 YAMTAM `1.4.x` **并非** 8 月份的 Yana Product `1.4.x` —— 两者是完全不同的版本轴。

## 六、产品化 — 重置为 v0.x

```
YAMTAM Engine v1.x
        │
   Product architecture
        │
        v0.1.x
```

| 版本 | 事件/功能 |
|---|---|
| v0.1–0.2 | 早期产品化。 |
| v0.3 | Policy Kit。 |
| v0.4 | Guard Installer。 |
| v0.5 | Runtime/task/eval 开发。 |
| v0.6–0.13 | 产品架构快速发展;需要更多 commit 考据才能对应每个具体功能。 |
| v0.14.0 | 图相关开发。 |
| v0.14.1 | 导入约 +423 个技能。 |
| v0.14.2 | 导入约 +1,048 个技能。 |
| v0.15.0 | 技能/设计/hunt 扩展;某些组件曾出现 `2.0.0` 元数据 → 版本漂移。 |
| v0.16.0 | 产品线持续稳定。 |
| v0.17.0 | CLI/产品与 `yamtam-rt v1.0.0` 对接。 |
| v0.18.0 | 短暂存在/未正式发布的状态;之后被正式标记为 SKIPPED。 |
| v0.22.4 | 有版本痕迹,但尚不确定属于 product/component/internal 中的哪一条轴线。 |
| v0.40.0 | 取代 v0.18.0;产品编号出现大跳跃。 |

## 七、`yamtam-rt` → `yana-rt`

这是 Rust 运行时成为独立版本轴线的时期:

| Runtime | 含义 |
|---|---|
| `yamtam-rt` 0.7 | 早期 Rust 运行时。 |
| 0.8 | 运行时迭代。 |
| 0.9 | 1.0 之前的运行时。 |
| 1.0.0 | 运行时稳定边界;被 YAMTAM Product 0.17 接入 CLI。 |
| → `yana-rt` | 随 YAMTAM → Yana 一起重命名。 |
| `yana-rt` 1.1.x | 独立的运行时开发。 |
| 1.3.2 | 运行时轴线继续独立于 Product 发展。 |
| 1.3.3 | 与 Product 1.0.0 同期的运行时发布。 |
| 1.4.0 | 新一代运行时;Product 1.3.2 时期仍可能搭载运行时 1.4.0。 |

这正是不能用 Product 版本号去推断运行时版本号的具体原因 —— 关于本仓库如今如何保持各版本轴线相互独立,参见 [`VERSIONING.md`](../../VERSIONING.md)。

## 八、Proto-Yana / 更名时代

"Yana" 这个名字实际上出现在正式更名之前。大约在 6 月初到中旬:

```
yana-router → yana-web → yana-desktop
```

随后是正式更名,**2026-06-15**:

```
YAMTAM ENGINE → Yana AI
yamtam-engine → yana-ai
yamtam-rt     → yana-rt
YAMTAM_*      → YANA_*
.yamtam/      → .yana/
bin/yamtam    → bin/yana
```

迁移过程又持续了好几天,因为标识符/包名/引用中仍残留着 YAMTAM 的名字。因此应将 6 月 15 日理解为更名*事件*,而将大约 6 月 15 日至 25 日理解为迁移*窗口期*,而非一次性的干净切换。

## 九、Early Yana v0.x

| 版本 | 内容 |
|---|---|
| 0.40.0 | 连接 YAMTAM 与 Yana 的最后一座桥梁。 |
| 0.41.0–0.41.2 | 早期 Yana 产品开发。 |
| 0.41.3 | 2026-06-13 确认的产品状态。 |
| 0.42.0 | 二进制分发工作流出现之前的产品状态。 |
| 0.42.1 | 首次二进制发布 —— 不只是补丁,而是改变了 Yana 的分发方式。 |
| 0.42.2 | WASM + 发布流水线。 |
| 0.42.3 | 稳定化/pre-0.43 状态。 |
| 0.43.0 | 引导流程 + 对话历史时代。 |
| 0.43.1 | 发现 CI 强制将 Product/Rust/Python 使用同一版本号 → 正式确立独立版本轴线。 |
| 0.43.2 | 1.0 之前最后几个产品状态之一。 |

## 十、Yana Stable

| Product | 含义 |
|---|---|
| v1.0.0 — 07/26 或 07/27 | 首个稳定的 product-axis 1.0 发布。并非项目诞生的日期。 |
| v1.1.0 — 07/30 | 下一个稳定 product 发布 + Desktop 开发。 |
| v1.2.0 | product 轴线被**跳过**。1.2 版本号出现在其他 surface/组件上,但并非正式的 Product 发布。 |
| v1.3.0 — 08/01 | 在 Desktop/版本显示漂移之后重新同步 product 版本。 |
| v1.3.1 — 08/02 | 稳定化/补丁。 |
| v1.3.2 — 08/11 | Product 1.3.2、`yana-rt` 1.4.0、Python 0.42.5;safety/SSRF/运行时相关工作已相当成熟。 |
| v1.4.0 — 08/16 | Capability Runtime、OS/服务/提供商扩展及安全加固。 |
| v1.4.1 — 08/20 | 1.4.0 之后的补丁/稳定化。 |

## 十一、Desktop

Desktop 应被视为独立的轴线/组件:

| 版本 | 角色 |
|---|---|
| 0.1.0 元数据时代 | 包元数据曾长期停留在非常旧的版本号上。 |
| 1.1.0 | Desktop 发布。 |
| 1.2.0 | Desktop/发布层面的版本号 —— 这也是容易误以为 Product 也有 1.2.0 的原因之一。 |
| 1.3.0 | 早于/影响了 Product 显示版本同步的 Desktop 版本。 |

## 十二、Yana-AI-Chat_Terminal

这里实际存在多个归档产物,而非单一仓库:

| 产物 | 功能 |
|---|---|
| `Yana-AI-Chat_Teminal-main.zip` | 主要的 Chat Terminal 快照。 |
| `...main (1).zip` | 同一分支的另一个快照。 |
| `Yana-AI-Chat-Terminal-14-UI-Engines.zip` | 探索 14 种 UI 引擎的实验/设计方向。 |
| `...Compose-ZeroMemory.zip` | "Compose/ZeroMemory" 方向。 |
| `...Visible-UI-Patch.zip` | UI 可见性补丁。 |

## 十三、Capability Runtime 实验

展示了运行时架构并非一步到位达到最终实现:

```
yana-local-capability-runtime-design-v1
                ↓
              v2
                ↓
yana-runtime-design-v3
                ↓
              v4
                ↓
yana-runtime-foundation-final
                ↓
yana-program-j-capability-runtime-rust
                ↓
        Yana runtime implementation
```

这些属于架构原型,不应被称为 Product 发布。

## 十四、`yana-web`

这是生态系统中的 Web/UI 分支。它在正式更名完成*之前*就已出现 —— 也就是说,在核心部分仍叫 YAMTAM 的时候,"Yana" 这个身份已经被用在新组件上了:

```
YAMTAM core
    │
Proto-Yana
    ├── yana-router
    ├── yana-web
    └── yana-desktop
            │
        Yana AI
```

并非 `Yana 1.0 → yana-web` 的顺序 —— `yana-web` 的存在早于 Product 1.0 发布。

## 十五、机器人

Yana 走出纯软件领域的分支:

```
Yana ecosystem
      │
      └── yana-wheelbot
                │
                └────► yana-robot
                         ▲
                         │
                    xiaozhi-esp32
                    external DNA
```

`yana-wheelbot` 是物理控制/机器人分支。`yana-robot` 走得更远:ESP32-S3 固件、Web/移动端控制、本地实时安全机制、ToF 传感、电机/舵机控制、LED/显示屏,以及面向 AI/MCP 语义控制的方向 —— 它还引入了来自外部 `xiaozhi-esp32` 项目的代码血统,因此是一个混合后代,而非纯粹的 Yana-AI 分支(fork)。

## 完整谱系,精简版

```
Claude Development Template
        ↓
GitNexus
        ↓
claude-code v3
 ↓ v4
 ↓ v5   Spec-driven
 ↓ v6   Tool attention
 ↓ v7   Persistent memory
 ↓ v8   Memory architecture
 ↓ v9   Quality agents
 ↓ v10  Reliability
        ↓
╔══════════════════╗
║ YAMTAM ENGINE 1.0║
╚══════════════════╝
        ↓
1.1 → 1.2
        ↓
1.2.1 Cost Guard
1.2.2 Budget
1.2.3 Scope Lock
1.2.4 Audit
1.2.5 E2E Safety
1.2.6 Handoff
1.2.7 Production Defense
1.2.8 API Defense
1.2.9 Release QA
        ↓
STANDALONE ENGINE
        ↓
1.3.0 → ... → 1.3.56
        ↓
1.4 → 1.5 → 1.6 → 1.7 → 1.8
        ↓
──────── PRODUCT RESET ────────
        ↓
0.1 → ... → 0.17
        │
        ├──── yamtam-rt
        │
        ↓
0.18 [ephemeral/skipped]
        ↓
0.40 → 0.41 → 0.42 → 0.43
        ↓
════ YAMTAM → YANA ════
        ↓
              YANA AI
      ┌─────────┼─────────┐
      ↓         ↓         ↓
   yana-rt    Python    Desktop
      │
      ├───────────────┐
      ↓               ↓
  yana-web       Chat Terminal
                      │
               runtime experiments
             YANA ECOSYSTEM
                    │
                    ↓
              yana-wheelbot
                    ↓
               yana-robot
                    ↑
              xiaozhi-esp32
```

目前最大的空白在于 `v1.3.0`–`1.3.11`、`1.3.40`–`53` 以及 Product `0.6`–`0.13` 的功能层面细节 —— 这些版本/状态确实存在过,但在没有 commit 级别证据支撑之前,不应把这里的任何一行理解为"这个版本新增了 X"。
