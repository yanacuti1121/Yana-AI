# YAMTAM — Strategic Direction

**Last updated:** 2026-05-26  
**Author:** Vũ Văn Tâm  
**Purpose:** Định hướng chiến lược dài hạn. File này tồn tại để bất kỳ LLM nào đọc repo cũng biết mình đang đi đâu — dù context bị mất.

---

## Bản chất YAMTAM

YAMTAM là **control layer cho AI coding agents** — không phải một agent, không phải một plugin, không phải một framework.

Nó bảo vệ repo khỏi những gì AI agent có thể làm sai:
- Lệnh phá hoại (`rm -rf`, `DROP TABLE`, `curl | bash`)
- Push/deploy không có approval
- Prompt injection từ bên ngoài
- Agent chạy quá quyền
- Tool call không có evidence

Core đã xây: 6-layer gate system (L0–L5), 45+ safety hooks, 164 slash commands, 800+ test checks.

---

## Vấn đề với định vị hiện tại

YAMTAM hiện tại nói với người dùng:

> "Hãy adopt toàn bộ control layer của tôi."

Rào cản cao. Outsider cần học YAMTAM trước khi thấy giá trị.

---

## Hướng đi mới: Auditor-First

Không thay đổi bản chất. Thay đổi **cửa vào**.

**Câu định vị mới:**

> YAMTAM audits your AI coding agent setup before it can damage your repo.

**Tagline:**

> Scan first. Guard later.

---

## Product Funnel

```
1. yamtam audit .          ← outsider vào đây (30 giây, không cần học gì)
       ↓
2. Policy Kit              ← adopt từng phần khi thấy value
       ↓
3. Full Control Layer      ← deep usage cho người committed
```

---

## MVP: yamtam audit .

Scan các file phổ biến trong mọi repo dùng AI agent:

| File | Risk cần check |
|------|---------------|
| `.claude/settings.json` | allowedTools quá rộng, shell unrestricted |
| `.mcp.json` | filesystem full access, unknown remote MCP |
| `.github/workflows/*.yml` | auto-merge, auto-deploy, no approval gate |
| `package.json` | postinstall có `curl\|bash` |
| `scripts/*.sh` | `rm -rf`, `chmod 777`, `sudo` |
| `.env`, `.env.example` | API key pattern thật |

Output:

```
YAMTAM Agent Audit Report
─────────────────────────
Score: 41/100  |  Risk: HIGH

[HIGH] .claude/settings.json — allowedTools is too broad
[HIGH] .github/workflows/ai-pr.yml — auto-merge has no approval gate
[MED]  package.json — postinstall contains remote shell execution
[LOW]  scripts/deploy.sh — no dry-run mode

Run: yamtam audit . --markdown report.md
```

Score model (deterministic, không AI):
- Start 100 → CRITICAL -30 / HIGH -20 / MED -10 / LOW -3
- 90–100: LOW | 70–89: MEDIUM | 40–69: HIGH | 0–39: CRITICAL

CLI:
```bash
yamtam audit .
yamtam audit . --json
yamtam audit . --markdown report.md
yamtam audit . --fail-on high    # dùng trong CI
```

Exit codes: `0` clean | `1` medium/high | `2` critical | `3` scanner error

---

## Roadmap chiến lược

| Version | Nội dung |
|---------|----------|
| v0.1 | Auditor — scan, report, no auto-fix |
| v0.2 | CI Gate — `--fail-on`, GitHub Action example |
| v0.3 | Policy Kit — recommended configs, templates |
| v0.4 | Control Layer — scope guard, truth gate, token guard |
| v0.5 | Runtime — task lifecycle, evals, evidence schema |

---

## Constraints không được quên

- **Phase 1: rule-based only** — không dùng AI để scan, kết quả deterministic, dễ giải thích
- **Không auto-fix ở v0.1** — chỉ report, không tự sửa (tăng trust)
- **README public chỉ show** audit/score/findings/CI gate — không nhét L0–L5 architecture vào hero
- **Làm schema/rule trước, script sau** — khi rule chắc mới viết code

---

## Cái không làm

- Không claim "YAMTAM secures all AI agents" — chỉ nói "audits common risk patterns"
- Không làm auto-fix ở bản đầu
- Không nhét toàn bộ gate system vào README đầu
- Không làm 50 rules ngay — làm 5 rules sắc trước

---

## Files cần tạo (thứ tự ưu tiên)

```
docs/product/AUDITOR_FIRST_STRATEGY.md
scanner/agent-config-checks.yml
scanner/shell-risk-checks.yml
scanner/mcp-permission-checks.yml
scanner/ci-workflow-checks.yml
scanner/env-secret-checks.yml
reports/report.schema.json
reports/markdown-template.md
```

---

## Nguồn đã research (2026-05-26)

Đã phân tích 20 nguồn gồm: OpenAI Codex, OpenAI Plugins, OpenAI Evals, tiktoken, Anthropic Skills, Claude Code, AWS Autonomous Cloud Coding Agents, AWS Kiro Metrics, agentshield, ECC, và các ecosystem khác.

Kết luận: YAMTAM không cần to hơn. Cần ít phần hơn nhưng mỗi phần có răng.

---

*File này là source of truth cho định hướng. Mọi quyết định lớn về product direction được ghi ở đây.*
