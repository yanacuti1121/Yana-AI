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
│ v0.43.2 · Tường lửa an toàn cho AI coding agent │ Mẹo bắt đầu                                                                               │
│ 101 agents · 2.016 skills                       │ yana-ai doctor                                                                            │
│ 71 rules · 58 hooks · 108 scripts               │ yana-ai init                                                                              │
│ 170 commands                                    │                                                                                          │
│                                                  │ Mới trong bản này                                                                        │
│                                                  │ v0.43.2 — sửa Ollama model-id, thêm entry-point verify law                               │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

<h1 align="center">Yana AI</h1>

<p align="center">
  <strong>Tường lửa an toàn giữa AI coding agent và shell của bạn.</strong>
</p>

<p align="center">
  <em>Xây dựng bởi Vũ Văn Tâm · 17 tuổi · Việt Nam</em>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>🇻🇳 Tiếng Việt</strong> · <a href="README.ko.md">🇰🇷 한국어</a> · <a href="README.zh.md">🇨🇳 中文</a>
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
  <img src="https://img.shields.io/badge/🧩_skills-2,016-2f7e6e?style=flat-square" />
  <img src="https://img.shields.io/badge/🤖_agents-101-7d6aa8?style=flat-square" />
  <img src="https://img.shields.io/badge/📜_rules-71-b96b80?style=flat-square" />
  <img src="https://img.shields.io/badge/🪝_hooks-58-b78f3d?style=flat-square" />
  <img src="https://img.shields.io/badge/⚡_commands-170-3a7ca5?style=flat-square" />
  <img src="https://img.shields.io/badge/🇻🇳_made_in-Vietnam-da251d?style=flat-square" />
</p>

---

Agent của bạn thử làm gì đó nguy hiểm. Yana chặn lại, giải thích lý do, và ghi log. Hoạt động với Claude Code, Cursor, Windsurf, Antigravity, Kiro, OpenCode, Zed, Gemini, GitHub Copilot, Aider, và nhiều công cụ khác.

```bash
npm install -g yana-ai && npx yana-ai-install   # gắn hooks (60 giây)
```

Sau đó thử bảo agent làm bậy, và xem. Mọi ví dụ dưới đây đều copy trực tiếp từ một lần chạy thật `core/hooks/guard-destructive.sh` ngày 2026-07-04, không phải quảng cáo suông (xem [Giới hạn thực tế](docs/reference/known-limitations.md) để biết guard này chưa bắt được gì):

```bash
# Agent thử: git push --force origin main
Blocked: 'git push --force' (any flag spelling) is not allowed. The
orchestrator pushes branches; force-pushing risks overwriting shared history.

# Agent thử: rm -rf /some/path
Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible.
Use targeted 'rm' with explicit paths, or ask the human to confirm first.

# Agent thử: git clean -f
Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked
files. Ask the human to confirm before running this.
```

Đó là toàn bộ ý tưởng: quy tắc tất định (deterministic), chạy local, không có LLM trong đường ra quyết định, không dữ liệu nào rời khỏi máy bạn.

---

## Vấn đề

AI coding agent mắc sai lầm. Chúng `rm -rf` nhầm thư mục. Chúng push force lên main. Chúng bịa ra kết quả test. Đến lúc bạn nhận ra thì thiệt hại đã xảy ra.

Yana AI nằm giữa agent và hệ thống của bạn: mọi lệnh có rủi ro đều đi qua một chuỗi kiểm tra tất định trước khi thực thi.

---

## Nó chặn gì

Các thao tác git phá hoại, `rm` ngoài phạm vi workspace, pipe nội dung từ internet vào bash, và cài package chưa qua kiểm định, qua 58 agent hooks có Rust runtime (`yana-rt`) hỗ trợ. Bên dưới: 101 agent chuyên biệt, 2.016 skills, và 71 rule được thực thi, kiểm tra 830 cách trong CI.

## Cách hoạt động

```
Agent muốn chạy một lệnh
         ↓
Anti-evasion scan      — chặn base64 decode+exec, pipe vào shell interpreter
Shell sanitization     — quote mọi biến, loại bỏ ký tự đặc biệt của shell
Egress / SSRF policy   — chặn metadata endpoint đã biết, dải IP private
Supply-chain vetting   — checklist typosquat/CVE trước khi cài package
Blast-radius cap       — giới hạn phạm vi/số file một lệnh phá hoại có thể chạm tới
Merkle audit log       — mọi hành động (cho phép lẫn bị chặn) đều được log, chống giả mạo
Human gate             — hành động không thể hoàn tác (push, publish, xóa) cần xác nhận rõ ràng từ người
         ↓
Thực thi (hoặc chặn + log)
```

Xem [Giới hạn thực tế](docs/reference/known-limitations.md) để biết chính xác cái nào đang là hook sống, cái nào chỉ là chính sách agent tự áp dụng theo quy ước, đã xác minh trực tiếp trên code chứ không phải trên tài liệu mô tả nó.

## Con số

| | |
|---|---|
| 🧩 Skills | **2.016** định nghĩa workflow skill |
| 🤖 Agents | **101** agent chuyên biệt |
| 📜 Safety rules | **71** rule được thực thi |
| 🪝 Hooks | **58** hook trước/sau khi thực thi |
| ⚡ Slash commands | **170** |
| 🔧 Scripts | **108** |
| 🔌 Harness adapters | **12** (Claude Code, Cursor, Windsurf, Antigravity, Kiro, OpenCode, Zed, Gemini, Copilot, Aider...) |
| 🦀 Rust subcommands | **26** (`scan`, `graph`, `vault`, `route`, `mission`, `hunt`, `fix`, `doctor`, `filescan`...) |
| ✅ Rule checks trong CI | **830** |

---

## Cài đặt nhanh

**→ [npm install](https://www.npmjs.com/package/yana-ai)** — `npm install -g yana-ai`

```bash
# Claude Code plugin — npx yana-ai-install gắn hooks
# (bắt buộc: npm v12+ không còn tự chạy postinstall scripts mặc định)
npm install yana-ai && npx yana-ai-install

# Python CLI
pip install yana-ai

# Rust runtime (nhanh hơn 1256 lần)
cargo install yana-rt
```

```bash
# Xác nhận mọi thứ đã gắn đúng
yana-ai doctor .
```

### Yêu cầu

- Node.js 18+ (cho package npm)
- Git
- Bất kỳ AI coding tool nào: [Claude Code](https://claude.ai/code), Cursor, Windsurf, Aider, v.v.

### Clone từ source

```bash
git clone https://github.com/yanacuti1121/yana-ai.git
cd yana-ai
npm install
bash install.sh                 # copy hooks + config vào project của bạn
yana-ai doctor                  # xác nhận
```

---

## Hỗ trợ đa harness

Yana AI thích ứng với bất kỳ công cụ nào bạn dùng:

```bash
bash core/scripts/switch-engine.sh cursor    # .cursorrules + 7 .cursor/rules/*.mdc
bash core/scripts/switch-engine.sh opencode  # OPENCODE.md
bash core/scripts/switch-engine.sh zed       # .zed/settings.json
bash core/scripts/switch-engine.sh gemini    # GEMINI.md
bash core/scripts/switch-engine.sh copilot   # .github/copilot-instructions.md
bash core/scripts/switch-engine.sh status    # kiểm tra cả 12 adapter
```

---

## GitHub Action

Quét cấu hình AI agent của bất kỳ repo nào trên mỗi PR: secrets, permissions, hook injection, lỗ hổng MCP.

```yaml
# .github/workflows/yana-ai-scan.yml
- uses: yanacuti1121/yana-ai/.github/actions/scan@main
  with:
    fail-on: 'high'       # fail CI khi có finding HIGH hoặc CRITICAL
    diff-only: 'true'     # chỉ quét file thay đổi trên PR
    comment-on-pr: 'true' # đăng tóm tắt finding dưới dạng comment PR
```

Đăng comment trên mỗi PR:

```
🟠 Yana AI Security Scan — HIGH

| Metric  | Value  |
|---------|--------|
| Risk    | HIGH   |
| Score   | 58/100 |
| Findings| 3      |
```

→ [Template workflow đầy đủ](docs/install/github-action.yml) · [tài liệu tham khảo đầy đủ](docs/reference/github-action.md)

---

## Rust runtime — `yana-rt`

26 subcommand. Không phụ thuộc Python.

```bash
yana-ai audit .                       # quét bảo mật — secrets, CVE, rủi ro supply chain
yana-ai graph .                       # knowledge graph — dependency file, resolve import
yana-ai vault search Q                # tìm trong 2.016 skills theo từ khóa
yana-ai hunt .                        # săn pattern bảo mật (OWASP, injection, SSRF)
yana-ai fix .                         # tự động fix vi phạm rule
yana-ai doctor .                      # kiểm tra sức khỏe hệ thống toàn diện
yana-ai map .                         # bản đồ blast radius — agent chạm được những gì?
yana-ai ci                            # chạy toàn bộ gate check (dùng trong CI)
yana-ai route classify "fix auth bug" # phân loại task → simple/complex/external
yana-ai mission create "add-auth"     # tạo mission agent song song
```

**Benchmark:** `yana-ai audit` trên repo 10k file: **nhanh hơn 1256 lần** so với bản Python tương đương.

---

## Kiến trúc an toàn

```
core/
├── hooks/          # 58 hook PreToolUse / PostToolUse / Stop
├── rules/          # 71 rule được thực thi (security, correctness, UI, git)
├── scripts/        # safe-run.sh, verify-core-lock.sh, secure-logger.sh
├── gates/          # truth_gate.md, action_gate.md
├── agents/         # 101 định nghĩa agent chuyên biệt
├── skills/         # 2.016 file SKILL.md
├── config/
│   ├── core-lock.json    # manifest SHA-256 — pin 240 file core
│   └── skills-lock.json  # hash nội dung skill
└── memory/
    ├── L1_atomic/  # fact vĩnh viễn — tồn tại qua các session
    └── L2_session/ # trạng thái session — tự hết hạn
```

Các thuộc tính chính, đã xác minh trên code thật, không chỉ trên tài liệu mô tả:
- **Merkle audit chain** — mọi hành động được log thành một entry JSONL nối hash; sửa một dòng đã ghi sẽ bị phát hiện khi tính lại chain (`verify-audit-chain.sh`)
- **Core-lock integrity** — manifest SHA-256 (`core-lock.json`) phát hiện drift, xóa file, và file lạ chưa qua review chèn vào `core/rules`, `core/hooks`, `core/gates`, `core/scripts`
- **Review trước khi thay đổi hạ tầng** — trước khi một thay đổi vào `core/rules/**`, `core/hooks/**`, `core/gates/**`, hay `core/agents/**`, hai agent reviewer độc lập (security-auditor cùng một reviewer đi kèm) được dispatch; một finding mức Safety từ một trong hai sẽ chặn việc ghi cho đến khi người dùng giải quyết
- **Human gate** — hành động không thể hoàn tác (force-push, publish, deploy, xóa) cần xác nhận rõ ràng từ người trong phiên hiện tại, không phải một sự chấp thuận đứng yên từ trước

---

## Trông như thế nào trong thực tế

Mọi ví dụ dưới đây đều copy trực tiếp từ một lần chạy thật `core/hooks/guard-destructive.sh` ngày 2026-07-04, không phải quảng cáo suông. Xem "Giới hạn thực tế" bên dưới để biết guard này *chưa* bắt được gì.

```bash
# Agent thử: git push --force origin main
Blocked: 'git push --force' (any flag spelling) is not allowed. The
orchestrator pushes branches; force-pushing risks overwriting shared history.

# Agent thử: rm -rf /some/path
Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible.
Use targeted 'rm' with explicit paths, or ask the human to confirm first.

# Agent thử: git clean -f
Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked
files. Ask the human to confirm before running this.
```

## Giới hạn thực tế

Trung thực, không quảng cáo: đã xác minh trực tiếp trên hook sống, không phải trên tài liệu mô tả chúng.

- **`guard-destructive.sh` là guard trên chuỗi lệnh, không phải bộ phân tích shell thật.** Nó tách token theo khoảng trắng và so khớp các cách viết nguy hiểm đã biết (`rm -rf`, `git push --force`, `git clean -f`, `git reset --hard`, push trực tiếp vào main/master). Tính đến 2026-07-05 (4 vòng review đối kháng trong một ngày) nó đã chuẩn hóa quote nguyên token (`"..."`, `'...'`, `$'...'`), escape backslash, ghép biến kiểu `${IFS}`, và từ chối thẳng các dạng brace-expansion cạnh lệnh git/rm — nhưng nó **chưa** xử lý được kiểu ghép quote giữa token (đoạn có quote và không quote xen kẽ trong cùng một từ, không có khoảng trắng ngăn cách, ví dụ `--forc"e"` — shell thật sẽ hiểu thành `--force`, guard này thì không). Để đóng lỗ hổng này cần parser theo trạng thái quote từng ký tự, không phải thêm một phép so khớp token nữa: đây là câu hỏi thiết kế dài hạn, không âm thầm coi là đã xong. Một lệnh cố tình soạn ra để lách vẫn có thể qua được guard này; một agent gõ lệnh bình thường sẽ bị bắt.
- **Chặn SSRF/metadata-endpoint và chặn cài package chưa qua kiểm định/typosquat là chính sách đã ghi lại, chưa phải hook sống.** Các phiên bản README trước đây từng cho đây là ví dụ hoạt động thật — đã xác minh trực tiếp (2026-07-04, xác nhận lại 2026-07-05) rằng không có hook `PreToolUse` nào đang được gắn thực sự chặn `curl` đến metadata endpoint, `Read` file `.env`, hay `npm install` một package bị giả mạo tên (typosquat). Giờ nói thẳng thay vì trình bày như demo hoạt động thật.
- **`core/` và `.claude/` là hai bản copy cùng một nguồn theo thiết kế**, không phải trùng lặp ngoài ý muốn. `core/` là bản gốc, `.claude/` là bản Claude Code đọc lúc chạy, và `core/config/core-lock.json` pin hash SHA-256 của cả hai. Nếu thấy chúng như nội dung trùng lặp, đó là chủ ý, không phải bug cần "dọn dẹp."
- **macOS không có sẵn `timeout`/`gtimeout` kiểu GNU.** Một hook từng giả định luôn có timeout này đã âm thầm không bao giờ chạy được hook nào trên các máy bị ảnh hưởng cho đến khi phát hiện và fix (2026-07-04). Giờ nó xuống cấp một cách nhẹ nhàng (chạy không giới hạn timeout) thay vì âm thầm không làm gì cả, nhưng đáng lưu ý loại bug "giả định môi trường" này là chính xác thứ cần để ý nếu bạn fork hoặc mở rộng các hook này.

Tìm thấy lỗ hổng chưa liệt kê ở đây? [Mở issue](https://github.com/yanacuti1121/yana-ai/issues). Báo cáo thực tế là cách một guard như thế này thực sự trở nên sắc bén hơn, không phải bằng cách viết thêm tài liệu mô tả nó nên làm gì.

---

## Yana AI (sản phẩm web)

**[Trải nghiệm trực tiếp →](https://yanai-production.up.railway.app)** · **[Tải Desktop →](https://yanacuti1121.github.io/Yana-AI/desktop.html)**

Yana là giao diện đầu tiên xây trên lõi Yana AI: một web UI cho phép bất kỳ ai chat với AI, đổi provider, và dùng skill routing mà không cần biết gì về hạ tầng bên dưới.

```
Người dùng → Yana AI → Yana AI Core (Router · An toàn · Ngữ cảnh) → Model
```

- Không cần đăng ký: dùng API key của riêng bạn
- 🔐 **Key vault mã hóa** — key lưu bằng AES-256-GCM, master key không thể export (WebCrypto + IndexedDB), không bao giờ ở dạng plaintext
- Đa provider: Anthropic · Groq · Gemini · OpenAI · DeepSeek · OpenRouter · 9Router · Ollama

**Thiết lập provider**, dùng key của bạn, key được mã hóa cục bộ (không bao giờ gửi về Yana AI):

| Provider | Loại | Thiết lập |
|----------|------|-------|
| **Claude** | Cloud | API key → [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **OpenAI** | Cloud | API key → [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Gemini** | Cloud | API key → [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| **Groq** | Cloud | API key → [console.groq.com/keys](https://console.groq.com/keys) |
| **DeepSeek** | Cloud | API key → [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) |
| **OpenRouter** | Cloud | API key → [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| **9Router** | Local | `npm install -g 9router` → `9router` (chạy tại `localhost:20128`) |
| **Ollama** | Local | [ollama.com/download](https://ollama.com/download) → `ollama serve` → `ollama pull llama3.2` |

- 📊 **100% dữ liệu thật** — thống kê provider trực tiếp, khu vườn L1 memory, panel sức khỏe audit-log; không số liệu demo
- Có sẵn skill routing, gõ tự nhiên và Yana AI tự dispatch đúng agent
- **Cả cho việc không phải code:** học tập (trợ lý học kiểu Socratic), việc hàng ngày (tóm tắt / lên kế hoạch / soạn thảo)
- SSE streaming, thân thiện mobile · **[Ứng dụng desktop Electron](https://yanacuti1121.github.io/Yana-AI/desktop.html)** — macOS, Windows, Linux

Nếu Yana AI là lưới điện, thì Yana là tòa nhà đầu tiên cắm vào lưới điện đó.

---

## Xây dựng bởi một người

Một người. Không team. Không tài trợ.

- Kiến trúc hook, safety gate, Python CLI
- Rust runtime (`yana-rt`), 101 agent, 2.016 skill, hỗ trợ đa harness
- 12 harness adapter (Claude Code, Cursor, Windsurf, Antigravity, Kiro, Zed, Gemini, Copilot, Aider…)

2.016 skill bao phủ: frontend, backend, AI/LLM, security, Kubernetes, WebAssembly, DevOps, database, testing, và nhiều hơn nữa. Hai agent persona phục vụ việc không phải code: học tập (`hoc-tap`) và trợ lý hàng ngày (`daily-assistant`).

---

## Thêm Yana AI vào repo của bạn

**Badge tĩnh**, dán vào README của bạn:

```markdown
[![Protected by Yana AI](https://img.shields.io/badge/protected%20by-Yana AI%20ENGINE-ff6b35?style=for-the-badge)](https://github.com/yanacuti1121/yana-ai)
```

**Badge audit động**, hiện điểm bảo mật trực tiếp:

```bash
yana-ai badge .           # in badge markdown với điểm hiện tại
yana-ai badge . --json    # output dạng máy đọc được
```

**GitHub Action**, tự động quét mọi PR:

```yaml
- uses: yanacuti1121/yana-ai/.github/actions/scan@main
  with:
    fail-on: 'high'
```

→ [Template workflow đầy đủ](docs/install/github-action.yml)

---

## Yana task router

Mọi task được phân loại trước khi thực thi: không còn phải đoán nên xử lý inline hay dispatch agent.

```bash
yana-ai route classify "implement JWT refresh token"
# → { "route": "complex", "gate": "harness", "confidence": 0.36,
#     "suggested_agents": ["security-engineer", "backend-developer"] }

yana-ai route classify "xem git log 10 commit"
# → { "route": "simple", "gate": "auto", "confidence": 0.43 }

yana-ai route classify "deploy to production"
# → { "route": "external", "gate": "confirm", "confidence": 0.30 }
```

Năm route:
- **simple** → Yana xử lý trực tiếp (chỉ đọc, không cần agent)
- **skill** → so khớp với index 2.016 skill, dispatch đúng agent skill
- **learn** → route tới `hoc-tap`, trợ lý học kiểu Socratic (kích hoạt khi gặp "học", "giải thích", "tại sao" — cả tiếng Anh và tiếng Việt)
- **daily** → route tới `daily-assistant`, tóm tắt / lên kế hoạch / soạn thảo (kích hoạt khi gặp "tóm tắt", "viết email", "lên kế hoạch" — cả tiếng Anh và tiếng Việt)
- **complex** → dispatch agent chuyên biệt với brief đã giới hạn phạm vi
- **external** → dừng lại, xác nhận với người trước khi tiếp tục

Chọn agent theo lĩnh vực: task auth → `security-engineer`, database → `database-expert`, UI → `frontend-developer + ui-ux-designer`.

---

## Mission dispatcher

Điều phối song song theo từng wave với xử lý dependency, viết bằng Rust, không dùng Python.

```bash
# 1. Tạo mission
MID=$(yana-ai mission create "implement-auth" | awk '/id:/{print $2}')

# 2. Khai báo task kèm dependency
yana-ai mission task $MID "design-schema"   --agent database-expert --produces schema.sql
yana-ai mission task $MID "implement-auth"  --agent backend-developer \
  --consumes schema.sql --produces src/auth.ts
yana-ai mission task $MID "write-tests"     --agent test-engineer \
  --consumes src/auth.ts --produces tests/auth.test.ts

# 3. Dispatch wave 1 — chỉ những task đã đủ dependency
yana-ai mission dispatch $MID --max-parallel 3
# → JSON brief cho mỗi agent sẵn sàng

# 4. Đánh dấu hoàn thành, dispatch wave tiếp theo
yana-ai mission done $MID "design-schema" --evidence schema.sql
yana-ai mission dispatch $MID  # → wave 2 mở khóa

# Hủy / thử lại task bị kẹt
yana-ai mission cancel $MID "implement-auth"
yana-ai mission retry  $MID "write-tests"
```

Task được đánh dấu **Running** khi dispatch: chạy lại `dispatch` không bao giờ dispatch trùng cùng một task.

---

## Multi-agent launcher

Chạy nhiều agent song song với giới hạn cứng và kill switch:

```bash
# Chạy 3 agent, tối đa 3 chạy song song cùng lúc
bash core/scripts/multi-agent-launch.sh start \
  --agents "scanner,auditor,qa-team" \
  --concurrency 3

# Trạng thái thời gian thực
bash core/scripts/multi-agent-launch.sh status

# Dừng một agent cụ thể
bash core/scripts/multi-agent-launch.sh kill scanner

# Kill switch — dừng tất cả ngay lập tức
bash core/scripts/multi-agent-launch.sh kill all

# Xem log của một agent
bash core/scripts/multi-agent-launch.sh log auditor
```

Hoặc điều khiển bằng file danh sách task:
```bash
# tasks.txt — mỗi dòng một task: agent_name:mô tả task
echo "scanner:scan the whole repo
auditor:check the hooks
qa-team:run the test suite" > tasks.txt

bash core/scripts/multi-agent-launch.sh start --tasks-file tasks.txt --concurrency 4
```

`status` hiện 6 trạng thái: `working` (còn sống, log vừa cập nhật), `blocked` (còn sống nhưng log không đổi quá `YANA_AGENT_STALE_SECONDS` giây, mặc định 30, có thể đang kẹt), `done` (thoát với mã 0), `failed` (thoát với mã khác 0), `unknown` (process đã mất nhưng chưa từng ghi mã thoát riêng, ví dụ sau khi bị SIGKILL), `killed` (đã dừng bằng `kill`).

Xem [tài liệu CLI đầy đủ](docs/reference/cli-reference.md) để biết ví dụ output và chi tiết hơn.

---

## Liên hệ

**Vũ Văn Tâm** · Việt Nam · 17 tuổi

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana | [yanai-production.up.railway.app](https://yanai-production.up.railway.app) |

---

## English · 🇰🇷 한국어 · 🇨🇳 中文

Bản dịch đầy đủ của tài liệu này: **[README.md](README.md)** (English) · **[README.ko.md](README.ko.md)** (한국어) · **[README.zh.md](README.zh.md)** (中文)

---

## Ghi nhận

Yana AI được xây dựng dựa trên ý tưởng, pattern, và công cụ từ cộng đồng mã nguồn mở, bao gồm các dự án cấp phép Apache 2.0, MIT, và các giấy phép permissive khác. Mọi nguồn bên thứ ba đều được sử dụng tuân thủ giấy phép tương ứng. Dự án này không có ý định sao chép, trình bày sai lệch, hay xâm phạm sở hữu trí tuệ của bất kỳ cá nhân hay tổ chức nào. Khi một dự án cụ thể ảnh hưởng trực tiếp đến quyết định thiết kế, dự án đó được ghi công trong file source và tài liệu rule liên quan.
