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

| Version | Nội dung | Status |
|---------|----------|--------|
| v0.1 | Auditor — scan, report, no auto-fix | ✅ done |
| v0.2 | CI Gate — `--fail-on`, GitHub Action example | ✅ done |
| v0.3 | Policy Kit — recommended configs, templates | ✅ done |
| v0.4 | Control Layer — scope guard, truth gate, token guard | ✅ done |
| v0.5 | Runtime — task lifecycle, evals, evidence schema | ✅ done |

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

---

## Upgrade Roadmap (2026-05-26 revision)

> "Make it trustworthy before making it bigger."  
> Bản hiện tại đã có xương. Giờ cần làm răng scanner sắc, report sạch, CI cắm được.

### Ưu tiên thực tế (theo thứ tự)

| # | Feature | Lý do | Status |
|---|---------|-------|--------|
| 1 | Rule condition engine v2 | `accompanied_by`, `not_followed_by`, `not_preceded_by`, `missing_key` | ✅ done |
| 2 | Rule test fixtures | `tests/fixtures/` + `test_scanner_conditions.py` | ✅ done |
| 3 | **SARIF output** (`--sarif`) | GitHub Code Scanning đọc được, finding hiện trong Security tab | ✅ done |
| 4 | **`--diff` mode** (`--diff origin/main`) | Chỉ scan file thay đổi trong PR — giảm noise, nhanh hơn, hợp CI hơn | ✅ done |
| 5 | **`.yamtamignore` + baseline** | Repo cũ có 50 findings không nản, chỉ fail trên risk mới | ✅ done |
| 6 | **`examples/unsafe-agent-repo`** | Demo chạy được ngay — không cần tin lời | ✅ done |
| 7 | **GitHub Action official** | `uses: phamlongh230-lgtm/yamtam-engine/actions/audit@v1` — adopt cực thấp | |
| 8 | **`yamtam explain <rule>`** | Mỗi finding thành giáo trình bảo mật, không phải cảnh báo khô | |
| 9 | **Agent Blast Radius Map** (`yamtam map .`) | Trả lời "agent của tôi chạm được tới đâu?" | |
| 10 | **`yamtam init-policy <tool>`** | Generate safe config template, không auto-fix | |

### Chi tiết từng feature

**SARIF output:**
```bash
yamtam audit . --sarif yamtam.sarif
# → upload to GitHub Code Scanning
```
Files: `reports/sarif-template.json` + `render_sarif(report)` trong `audit_scanner.py`

**`--diff` mode:**
```bash
yamtam audit . --diff origin/main --fail-on high
```
Dùng `git diff --name-only origin/main` để lấy danh sách file thay đổi, scan chỉ các file đó.

**`.yamtamignore`:**
```
# .yamtamignore
CI003:.github/workflows/deploy.yml   # accepted risk until 2026-06-30
SH008:scripts/legacy.sh              # false positive
```
Tagline: *"YAMTAM blocks new agent risk, not your entire legacy mess."*

**`yamtam explain <rule>`:**
```bash
yamtam explain CI001
```
Files: `rules/docs/CI001.md`, `MCP001.md`, `SH002.md`, …

**Agent Blast Radius Map:**
```bash
yamtam map .
# → Claude Code: Shell HIGH · File write MEDIUM · Git push BLOCKED · MCP db raw SQL
```

**`yamtam init-policy`:**
```bash
yamtam init-policy claude --out .claude/settings.recommended.json
yamtam init-policy github-actions
```
Files: `templates/claude/settings.safe.json`, `templates/github-actions/ai-pr-safe.yml`

**`yamtam score --explain`:**
```bash
yamtam score --explain report.json
# Start: 100 | -30 CRITICAL AC002 | -20 HIGH MCP003 | Final: 50/100 HIGH
```

### Không làm

- Dashboard web
- Cloud runtime / SaaS
- Auto-fix trực tiếp vào repo
- AI scan (AI chỉ được giải thích findings, không tự tạo findings)
- Thêm agent/hook/skill vào YAMTAM system
- Marketplace plugin

---

*File này là source of truth cho định hướng. Mọi quyết định lớn về product direction được ghi ở đây.*
