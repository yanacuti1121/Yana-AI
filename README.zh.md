<h1 align="center">Yana AI</h1>

<p align="center">
  <strong>AI 编程智能体与你的 shell 之间的安全防火墙。</strong>
</p>

<p align="center">
  <em>作者：Vũ Văn Tâm · 17 岁 · 越南</em>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.vi.md">🇻🇳 Tiếng Việt</a> · <a href="README.ko.md">🇰🇷 한국어</a> · <strong>🇨🇳 中文</strong>
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

当你的智能体尝试执行危险操作时，Yana 会拦截它，说明原因，并记录下来。支持 Claude Code、Cursor、Windsurf、Antigravity、Kiro、OpenCode、Zed、Gemini、GitHub Copilot、Aider 等工具。

```bash
npm install -g yana-ai && npx yana-ai-install   # 接入钩子（60 秒）
```

试着让智能体做点坏事，看看会发生什么。下面每个示例都是 2026-07-04 对 `core/hooks/guard-destructive.sh` 的一次真实运行结果，原样复制，不是宣传文案（这个防护还没能拦住什么，见 [Known Limitations](docs/reference/known-limitations.md)）：

```bash
# 智能体尝试：git push --force origin main
Blocked: 'git push --force' (any flag spelling) is not allowed. The
orchestrator pushes branches; force-pushing risks overwriting shared history.

# 智能体尝试：rm -rf /some/path
Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible.
Use targeted 'rm' with explicit paths, or ask the human to confirm first.

# 智能体尝试：git clean -f
Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked
files. Ask the human to confirm before running this.
```

这就是全部要点：确定性规则，完全本地运行，决策路径中没有 LLM，任何数据都不会离开你的机器。

## 能拦住什么

破坏性的 git 操作、工作区之外的 `rm`、把网络内容管道进 bash、未经审查的包安装，全部由 55 个智能体钩子拦截，背后由 Rust 运行时（`yana-rt`）支撑。底层还有 101 个专职智能体、1,989 个技能、70 条强制规则，在 CI 中以 826 种方式检查。完整的分层结构见[架构文档](docs/reference/architecture.md)。

## 验证是否生效

```bash
yana-ai doctor .      # 检查钩子是否接好、配置是否完整、各层网关是否健康
yana-ai audit .       # 扫描你仓库中智能体配置的风险项
```

## 防火墙之外

这套引擎还提供[带任务路由器、任务集调度器和多智能体启动器的 CLI](docs/reference/cli-reference.md)、用于扫描每个 PR 的 [GitHub Action](docs/reference/github-action.md)，以及基于同一内核构建的聊天界面 [Yana](docs/reference/yana-web.md)。

**→ [完整文档与演示](https://yanacuti1121.github.io/Yana-AI/)** · [Architecture](ARCHITECTURE.md) · [Vision](VISION.md) · [Roadmap](ROADMAP.md) · [Versioning](VERSIONING.md)

## 真实的局限

规则是确定性的模式：能拦住已知的危险形态，拦不住全新的攻击手法。哪些是文档上写的政策、哪些是真正生效的机制，完整内容见 [Known Limitations](docs/reference/known-limitations.md)。如果某个网关拦得太多或太少，[提个 issue](https://github.com/yanacuti1121/yana-ai/issues)；真实反馈才是让这些网关变得更精准的方式。

---

**Vũ Văn Tâm** · 越南 · 17 岁

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana | [yanai-production.up.railway.app](https://yanai-production.up.railway.app) |

Apache-2.0。本项目基于开源社区的想法、模式与工具构建，包含以 Apache 2.0、MIT 及其他宽松许可证发布的项目，均在各自许可证范围内使用。对设计决策产生直接影响的项目，已在相应源文件与规则文档中注明来源。
