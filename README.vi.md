<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/yana-banner-dark.svg">
    <img src="docs/yana-banner-light.svg" alt="Yana AI" width="760">
  </picture>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.vi.md"><strong>Tiếng Việt</strong></a> · <a href="README.ko.md">한국어</a> · <a href="README.zh.md">中文</a>
</p>

<h1 align="center">Yana AI 🐰</h1>

<p align="center">
  <a href="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml"><img src="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://crates.io/crates/yana-rt"><img src="https://img.shields.io/crates/v/yana-rt?logo=rust&color=ce422b" alt="yana-rt on crates.io"></a>
  <a href="https://pypi.org/project/yana-ai/"><img src="https://img.shields.io/pypi/v/yana-ai?logo=pypi&color=3775a9" alt="yana-ai on PyPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-2563eb" alt="Apache 2.0 license"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-2e8b75" alt="Contributions welcome"></a>
</p>

<p align="center"><em>Sáng lập bởi Vũ Văn Tâm · Việt Nam</em></p>

---

## Một Runtime. Mọi AI. Con Người Nắm Quyền.

Yana biến các model và agent AI độc lập thành một hệ thống thống nhất, có quản trị, tồn tại lâu dài — trong khi con người giữ quyền quyết định cuối cùng.

Các model AI rất mạnh trong việc suy luận, lập kế hoạch, viết code và dùng tool. Nhưng trí tuệ thôi không tạo ra một hệ thống AI đáng tin cậy. Model thay đổi. Context biến mất. Agent kết thúc. Provider gặp sự cố. Mỗi tool có quyền hạn khác nhau. Công việc trải dài qua nhiều phiên, nhiều máy, nhiều môi trường AI khác nhau.

**Yana cung cấp control plane giữ tất cả những mảnh đó lại với nhau.**

```
                         HUMAN
                    final authority
                          │
                          ▼
                    ┌───────────┐
                    │   YANA    │
                    │ControlPlane│
                    └─────┬─────┘
                          │
      ┌───────────────────┼───────────────────┐
      │                   │                   │
      ▼                   ▼                   ▼
 Intelligence        Continuity          Governance
 models/providers   missions/memory    authority/policy
      │                   │                   │
      └───────────────────┼───────────────────┘
                          ▼
                 Canonical Capabilities
                          │
                          ▼
                  Bounded Execution
                          │
                          ▼
                    Real Environment
```

### Trí tuệ không phải là quyền lực

Đây là nền tảng của Yana. Một model AI có thể quyết định nó muốn làm gì. Điều đó không có nghĩa là nó được phép làm việc đó.

Thay vì cho model quyền truy cập không giới hạn vào shell, filesystem, process, repository hay môi trường phát triển, Yana tách bạch:

```
INTELLIGENCE (trí tuệ)
"Tôi nên làm gì?"
        │
        ▼
PROPOSAL (đề xuất)
"Tôi muốn thực thi tool này."
        │
        ▼
AUTHORITY (thẩm quyền)
"Việc này có được phép không?"
        │
        ▼
CAPABILITY (năng lực)
"Đây chính xác là loại quyền lực gì?"
        │
        ▼
POLICY / HUMAN APPROVAL (chính sách / con người duyệt)
"Có được thực hiện ngay bây giờ không?"
        │
        ▼
BOUNDED EXECUTION (thực thi có giới hạn)
"Chỉ thực hiện đúng thao tác đã được phép."
```

Nói cách khác: **model cung cấp trí tuệ, Yana kiểm soát capability, và con người giữ quyền quyết định cuối cùng.**

### Hơn cả một agent framework

Hầu hết agent framework chỉ hỏi *làm sao để agent mạnh hơn?* Yana đặt một câu hỏi hệ thống lớn hơn: *làm sao vận hành nhiều model, nhiều agent, nhiều tool, nhiều workspace và các task chạy dài như một hệ thống duy nhất — trong khi vẫn kiểm soát được sức mạnh của chúng?*

Sự khác biệt đó thay đổi cả kiến trúc. Yana không được xây quanh một AI cố định — model và agent có thể trở thành những "công nhân" có thể thay thế bên trong một hệ thống tồn tại lâu dài. **Model có thể tạm thời. Agent có thể tạm thời. Yana là control plane tồn tại lâu dài bao quanh chúng.**

Phía dưới đó: một management plane cục bộ (Yana OS) quản lý vòng đời agent thay vì từng lệnh gọi tool riêng lẻ, một ranh giới rõ ràng giữa skill (agent biết gì) và capability (agent thực sự được làm gì), và một tầng `core/` chuẩn hoá duy nhất được materialize xuyên suốt mọi harness được hỗ trợ — Claude Code, Codex, Cursor, Antigravity — để đổi engine AI không có nghĩa là phải xây lại toàn bộ governance từ đầu. Chi tiết đầy đủ ở [Kiến trúc chuyên sâu](#kiến-trúc-chuyên-sâu) bên dưới.

> Model có thể đổi. Thẩm quyền thì không.

---

*Mọi nội dung phía dưới đường kẻ này đi sâu hơn — cài đặt, xem nó chặn một lệnh nguy hiểm trực tiếp, kiến trúc runtime đầy đủ, và giới hạn đã biết, được xác minh dựa trên codebase hiện tại chứ không phải mô tả mang tính kỳ vọng.*

## Chọn kết quả đầu tiên bạn muốn

<table>
<tr>
<td width="33%" valign="top">

### Chạy AI local

Mở terminal workspace viết bằng Rust với provider local.

```bash
cargo install yana-rt
yana-ai-rt --provider ollama
```

Streaming, hủy generation, tab, session, đổi model và tool có guard.

</td>
<td width="33%" valign="top">

### Quản trị repository

Áp dụng các adapter surface được hỗ trợ vào dự án hiện có.

```bash
pip install yana-ai
cd your-project
yana-ai install
yana-ai doctor .
```

Rule, hook, agent, skill, command và integrity check nằm cùng dự án.

</td>
<td width="33%" valign="top">

### Điều phối công việc

Route task và tạo mission có dependency bằng runtime native.

```bash
yana-rt route classify "fix auth"
yana-rt mission create "add-auth"
```

Dùng evidence, capability, memory, workspace và OS control từ cùng một CLI.

</td>
</tr>
</table>

> Mới bắt đầu? Đi từ [Cài đặt nhanh](#cài-đặt-nhanh). Đang xây platform? Đọc [kiến trúc](docs/reference/architecture.md). Đang đánh giá an toàn? Hãy đọc [Giới hạn thực tế](#giới-hạn-thực-tế) trước danh sách tính năng. Tò mò dự án đi từ đâu tới đây? Đọc [lịch sử dự án](docs/reference/history.vi.md).

## Xem cơ chế quản trị hoạt động

Agent của bạn thử làm gì đó nguy hiểm. Yana chặn lại, giải thích lý do, và ghi log — chặn cứng trên Claude Code và Cursor, tư vấn (advisory) trên Codex và Antigravity.

```bash
pip install yana-ai && yana-ai install   # gắn hooks (60 giây)
```

> **Lỗi đã biết, đã fix từ 2026-07-25:** bản PyPI cũ của `yana-rt` có thể tự đệ quy và chiếm 100% CPU — xem [CHANGELOG.md](CHANGELOG.md) để biết chi tiết sự cố. `pip install -U yana-ai` (hoặc `cargo install yana-rt`, chưa từng bị ảnh hưởng) là hết.

Sau đó thử bảo agent làm bậy, và xem.

<p align="center">
  <img src="docs/assets/demo.gif" alt="Yana AI blocking a force-push, an rm -rf, and a disguised python3 -c inline-script destructive command in real time, entirely locally with no LLM call" width="700" />
</p>

Mọi ví dụ dưới đây đều copy trực tiếp từ một lần chạy thật `core/hooks/guard-destructive.sh` ngày 2026-07-04, không phải quảng cáo suông (xem [Giới hạn thực tế](docs/reference/known-limitations.md) để biết guard này chưa bắt được gì):

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

Đó là toàn bộ ý tưởng: quy tắc tất định (deterministic), chạy local, không có LLM trong đường ra quyết định, không dữ liệu nào rời khỏi máy bạn. Xem [Giới hạn thực tế](docs/reference/known-limitations.md) để biết chính xác cái nào đang là hook sống, cái nào chỉ là chính sách agent tự áp dụng theo quy ước, đã xác minh trực tiếp trên code chứ không phải trên tài liệu mô tả nó.

---

## Yana hợp nhất những gì

| Tầng | Giá trị cho developer | Bề mặt chính |
| --- | --- | --- |
| **Runtime** | Chat native, state, routing, health và thao tác dự án | `yana-rt`, `yana-ai-rt` |
| **Model** | Ưu tiên local nhưng không loại bỏ cloud provider | Rust catalog gồm 19 provider: 5 local runtime + 14 adapter cloud/API |
| **Adapter** | Một contract dự án được quản trị trên các harness hỗ trợ | Claude Code, Codex, Cursor, Antigravity |
| **Điều phối** | Task, mission, memory, evidence và workspace | router, mission dispatcher, event bus |
| **Quản trị** | Check tất định, audit chain, quarantine, HALT và human gate | capability, hook, Yana OS, Giám Thị |

```text
 Terminal · Discord · Electron Desktop       Claude Code · Codex · Cursor · Antigravity
                    │                                           │
                    └──────────── các lối vào được quản trị ─────┘
                                         │
                              Giám Thị — thẩm quyền gốc
                         HALT · quarantine · human unlock
                                         │
                               Yana control plane
                    policy · identity · evidence · capability
                              ┌──────────┴──────────┐
                              │                     │
                    Rust TurnEngine          adapter dự án
              stream · cancel · tool loop    hook · rule · gate
                     ┌────────┴────────┐
                provider plane    capability plane
                local + cloud      file · Git · process
```

Chỉ có một thứ bậc thẩm quyền, nhưng không giả vờ mọi tích hợp đều dùng cùng một cơ chế. Terminal chat, Discord và Electron Desktop gửi turn có kiểu dữ liệu rõ ràng vào Rust `TurnEngine`. Claude Code, Codex, Cursor và Antigravity vẫn là các harness native, được quản trị qua adapter, hook, rule và gate nằm trong dự án. Bản Yana chỉ chạy trên trình duyệt, khi chưa cấu hình Rust runtime, vẫn dùng JavaScript gateway cũ; README ghi rõ boundary này thay vì gọi nó là đường chạy được quản trị đầy đủ.

### Một runtime, nhiều giao diện

| Giao diện | Kết nối gì | Ranh giới quản trị |
| --- | --- | --- |
| **Terminal + Desktop + Web đóng gói** | Toàn bộ provider local và cloud trong catalog Rust chuẩn | Một `TurnEngine`, một đường thẩm quyền capability, một ranh giới HALT của Giám Thị |
| **Discord** | Chat từ xa có xác thực và allowlist theo kênh/người dùng | Dùng cùng provider catalog và `TurnEngine`; chủ ý không mở capability host hay tool |
| **MCP (opt-in)** | Tool stdio cho kiểm tra lệnh cùng thao tác repo, Git, host, process và workspace được quản trị | Build với Cargo feature `mcp`; thao tác workspace cần duyệt vẫn bị từ chối qua MCP |
| **Claude Code, Codex, Cursor, Antigravity** | Harness coding-agent native | Được quản trị qua adapter, hook, rule và gate sinh theo từng engine, không giả vờ chúng chạy trong process của Yana |

Vì vậy AI local và cloud dùng chung một runtime contract nhưng không bị nhập thành một trust domain. Đổi provider chỉ thay nơi inference diễn ra; nó không thay đổi runtime authority hay ranh giới capability chuẩn hoá của Yana.

Trí tuệ model có thể đề xuất hành động. Code tất định và thẩm quyền con người quyết định hành động đó có được phép xảy ra hay không.

## Kiến trúc chuyên sâu

Phần hero ở trên nói nguyên tắc; phần này là bức tranh đầy đủ mà nó dẫn tới.

### Một control plane cho toàn hệ thống AI

Yana gom nhiều mối quan tâm vốn tách biệt vào chung một kiến trúc:

- **Trí tuệ (Intelligence)** — các provider model local và cloud (Claude, OpenAI, Gemini, DeepSeek, Groq, Ollama, LM Studio, llama.cpp, ...) cung cấp khả năng suy luận mà không nắm quyền hệ thống. Đổi provider trí tuệ không đòi hỏi đổi cả hệ thống thẩm quyền.
- **Thực thi (Execution)** — ý định của AI được dịch thành capability chuẩn hoá trước khi chạm tới môi trường thật (`model proposal → TurnEngine → RuntimeAuthority → canonical capability → policy/approval → bounded executor → host`). Một cái tên tool không thể tự cấp quyền cho chính nó.
- **Điều phối (Orchestration)** — mỗi turn AI riêng lẻ tham gia vào những đơn vị công việc lớn hơn: task, mission, routing, event bus, workspace, checkpoint — để công việc tồn tại lâu hơn một vòng hỏi-đáp đơn lẻ.
- **State và bộ nhớ** — session state, memory, mission state, workspace state được giữ lại ngoài phạm vi một phiên model đơn lẻ; trí tuệ thực hiện công việc có thể thay đổi trong khi bối cảnh vận hành xung quanh vẫn còn nguyên.
- **Bằng chứng và trách nhiệm giải trình** — việc thực thi được kết nối với evidence, provenance, audit, nguồn nghiên cứu, kế toán chi phí và quyết định chính sách. Câu hỏi không chỉ còn là "AI có tạo ra câu trả lời không?" mà là "chuyện gì đã xảy ra, tại sao nó được phép, bằng chứng nào chứng minh, chi phí bao nhiêu, và nó để lại trạng thái gì?"

### Yana OS — quản lý hệ thống AI

Yana OS không phải bản thay thế cho Linux, macOS hay Windows — nó là management plane cục bộ của Yana, suy luận về trạng thái vận hành xung quanh các agent: agent nào tồn tại, nó có identity và mức autonomy gì, nó đang giữ tài nguyên gì, nó chịu trách nhiệm cho công việc gì, nó có khoẻ mạnh không, và có nên bị cách ly (quarantine) hay dừng (HALT) không. Điều này đưa việc quản trị vượt ra ngoài từng lệnh gọi tool riêng lẻ, tiến tới quản lý vòng đời agent (identity, agent lifecycle, autonomy, resources, health, monitoring, supervision, leases, governor, quarantine, HALT) — nhưng nó cố tình không trở thành một execution engine thứ hai. Việc thực thi vẫn thuộc về ranh giới capability chuẩn hoá.

### Thẩm quyền con người nằm trên model

```
                    HUMAN
                      │
                      ▼
                  GIÁM THỊ
                HALT / Control
                      │
                      ▼
             YANA CONTROL PLANE
                      │
                      ▼
               RuntimeAuthority
                      │
                      ▼
                Capabilities
                      │
                      ▼
                  Executor
                      │
                      ▼
                     Host
```

Một model đủ mạnh không tự nhiên trở thành tối cao chỉ vì nó suy luận giỏi hơn. Subagent không tự động thừa hưởng thẩm quyền của con người. Việc duyệt cho một thao tác không tạo ra quyền vĩnh viễn. Và hệ thống có thể thu hồi quyền thực thi độc lập với ý định của model.

### Skill là kiến thức. Capability là quyền lực.

Yana duy trì một hệ sinh thái lớn gồm agent, skill, command, rule và hook — nhưng cố tình tách bạch những thứ này khỏi thẩm quyền thực thi. Một skill có thể dạy agent cách làm một việc; một capability quyết định liệu hệ thống có thực sự được làm việc đó không. Một nghìn skill không đồng nghĩa với một nghìn quyền hệ thống không giới hạn — điều này cho phép bề mặt kiến thức của Yana phát triển mà không buộc bề mặt thực thi đáng tin cậy phải phát triển cùng tốc độ.

### Một tầng vận hành chuẩn hoá, nhiều môi trường AI

Yana không đòi hỏi mọi sản phẩm AI phải dùng chung một cơ chế thực thi. Terminal, Electron Desktop, packaged Web và Discord dùng đường runtime Rust của Yana; Web dạng browser-only vẫn chỉ là bề mặt tương thích trừ khi được nối vào một runtime đáng tin cậy. Khi một môi trường AI khác sở hữu runtime riêng của nó — Claude Code, Codex, Cursor, Antigravity — Yana tích hợp qua các bề mặt quản trị riêng cho từng engine. Cơ chế tích hợp có thể thay đổi; nguyên tắc thẩm quyền thì không. Một hệ thống thẩm quyền không đòi hỏi một cơ chế tích hợp giả.

`core/` chuẩn hoá của Yana định nghĩa kiến thức vận hành có thể tái sử dụng — agent, skill, command, rule, hook, script, policy — sau đó được materialize cho từng AI harness khác nhau (Claude Code, Codex, Cursor, ...). Đổi engine AI không có nghĩa là phải xây lại toàn bộ môi trường vận hành từ đầu: trí tuệ có thể thay đổi, còn workflow, nguyên tắc quản trị, kiến thức vận hành và trạng thái hệ thống vẫn giữ nguyên.

### Ý tưởng lớn hơn

Giá trị dài hạn của Yana không đơn thuần nằm ở việc nó chạy được một model AI — model ngày càng dễ thay thế lẫn nhau. Giá trị của nó cũng không đơn thuần nằm ở số lượng agent hay skill. Sự trừu tượng hoá mạnh hơn là hệ thống bao quanh những model đó: thẩm quyền, tính liên tục, và thực thi, bao bọc quanh trí tuệ có thể thay thế và các "công nhân" agent tạm thời.

### Ý tưởng trong 30 giây

Yana biến các model và agent AI độc lập thành một hệ thống thống nhất, có quản trị, tồn tại lâu dài. Nó cung cấp control plane bao quanh trí tuệ: model để suy luận, agent và skill để có kiến thức và workflow, mission và memory để duy trì tính liên tục, và capability chuẩn hoá để thực thi có quản trị.

AI có thể suy luận và đề xuất. Yana quyết định trí tuệ đó nhận được quyền lực gì. Con người giữ quyền quyết định cuối cùng.

> AI suy nghĩ. Yana vận hành hệ thống. Con người vẫn nắm quyền kiểm soát.

### Các dự án liên quan

Yana có điểm gần và điểm khác với từng dự án dưới đây — không dự án nào là đối thủ cần hạ thấp, mỗi cái đều đáng đọc nếu đúng tầng bạn đang cần:

| Dự án | Gần Yana ở đâu | Khác Yana ở đâu |
| --- | --- | --- |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) (nay là "Agent Canvas") | Control center self-hosted điều phối nhiều backend coding-agent (Claude Code, Codex, Gemini, mọi agent ACP) | Thiên về agent-orchestration — một control center để chạy agent, không phải một authority calculus quyết định agent nào được thực thi gì |
| [Letta](https://github.com/letta-ai/letta-code) (tiền thân là MemGPT; repo `letta-ai/letta` giờ chỉ còn là landing page đã archive — link này trỏ đúng dự án đang hoạt động) | State và identity của agent tồn tại lâu dài, độc lập với model | Thiên về memory-và-identity — câu chuyện continuity của họ là agent nhớ gì qua các phiên, không phải agent được phép thực thi gì |
| [Goose](https://github.com/block/goose) | Provider-agnostic, đa provider, đa extension (MCP) — gần nhất với provider plane của Yana | Trước hết là một agent runtime mạnh; approval thực thi và scoping capability không phải nguyên tắc tổ chức của họ như thẩm quyền là của Yana |
| [AutoGen](https://github.com/microsoft/autogen) — **hiện đang maintenance mode**, được kế nhiệm bởi [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) | Pattern điều phối multi-agent | Delegation ở đó là mối quan tâm workflow/routing, không phải authority calculus — một agent giao việc cho agent khác không giống tuyên bố "thẩm quyền của agent là tập con bị giới hạn của thẩm quyền đã giao nó" |

Mỗi dự án trong 4 cái trên đều làm tốt một tầng — execution boundary, memory continuity, runtime cohesion, pattern điều phối. **Yana ghép continuity, orchestration, execution và governance vào chung một hệ thống, lấy authority boundary làm xương sống — không phải thêm một tầng nữa cạnh các tầng kia, mà là thứ mà các tầng kia gắn vào.**

## Cài đặt nhanh

**→ [pip install](https://pypi.org/project/yana-ai/)** — `pip install yana-ai`

> **Lưu ý (2026-07-30): không phân phối qua npm.** Yana AI không còn (và không có kế hoạch) publish lên npm registry nữa — xem [VERSIONING.md](VERSIONING.md#why-product-has-no-registry) để biết toàn bộ lịch sử. Dùng `pip` hoặc `cargo` bên dưới.

```bash
# Python CLI — cài lệnh yana-ai
pip install yana-ai
yana-ai install                # gắn hooks vào dự án hiện tại

# Rust runtime (nhanh hơn ~2–12 lần với lệnh giới hạn phạm vi — xem BENCHMARK.md)
cargo install yana-rt
```

```bash
# Xác nhận mọi thứ đã gắn đúng
yana-ai doctor .
```

### Yêu cầu

- Python 3.11+ (cho package pip) hoặc Rust/Cargo (cho `cargo install yana-rt`)
- Git
- Một trong 4 harness được hỗ trợ: [Claude Code](https://claude.ai/code), Cursor, Codex, hoặc Antigravity — xem [Hỗ trợ đa harness](#hỗ-trợ-đa-harness) bên dưới. Các công cụ khác chưa được nối; muốn thêm một công cụ nghĩa là phải viết adapter thật, không chỉ tuyên bố hỗ trợ.

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
bash core/scripts/switch-engine.sh cursor      # .cursorrules + hook beforeShellExecution thật
bash core/scripts/switch-engine.sh codex       # AGENTS.md
bash core/scripts/switch-engine.sh antigravity # .agent/rules/yana-ai.md
bash core/scripts/switch-engine.sh status      # kiểm tra cả 4 adapter
```

---

## Cấu trúc repository

Các bảng ở trên mô tả kiến trúc runtime. Đây là cây thư mục thật nơi nó
sống, nhóm theo chức năng từng đường dẫn thay vì theo thứ tự chữ cái.
Hai cặp thư mục trùng tên nhưng khác nhau hoàn toàn, được ghi chú bên
dưới ở chỗ cần phân biệt:

| Đường dẫn | Nội dung |
| --- | --- |
| `src/` | Binary Rust `yana-rt`. Xem [Bên trong `src/`](#bên-trong-src-yana-os-và-các-mặt-phẳng-khác) bên dưới. |
| `core/` | Nội dung rule/hook/skill/agent, code JS/shell thực thi chúng, và trạng thái audit + trust (`core/memory/`). Xem [Kiến trúc an toàn](#kiến-trúc-an-toàn). |
| `gates/` | **Đặc tả chính sách** gate dạng Markdown (`action_gate.md`, `truth_gate.md`, ...) — khác với `core/gates/`, nơi chứa code JS/shell thực thi chúng. |
| `scripts/` | Một số ít script riêng cho việc build/bọc binary `yana-rt` — khác với 130+ script hook/an toàn tổng quát trong `core/scripts/`. |
| `memory/` | L1 atomic fact và L2 session state ở cấp top-level — khác với audit log và trust ledger trong `core/memory/`. |
| `scanner/` | Định nghĩa rule quét rủi ro dạng YAML (`shell-risk-checks.yml`, `auth-credential-checks.yml`, ...) mà `src/scanner/` biên dịch và chạy. |
| `policy/`, `guards/`, `router/`, `prompts/` | Cấu hình khai báo khác: template chính sách, chỉ mục guard, chính sách định tuyến model đứng sau `route.rs`, và system prompt. |
| `tools/yana-web/` | Dashboard trình duyệt (Node server + client). |
| `tools/yana-desktop/` | Vỏ ứng dụng desktop Electron. |
| `tools/` (còn lại) | Tiện ích độc lập: `airllm-bridge`, `codexmate`, `moss-tts-nano`, `yana-pixel-bridge`, và vài script lẻ. |
| `bin/yana` | Điểm vào CLI đã cài đặt. |
| `adapters/` | Tài liệu adapter theo từng harness (Claude Code, Codex, Cursor, Antigravity). |
| `docs/` | Ghi chú kiến trúc, ADR, bài viết sự cố, nội dung docs-site. |
| `site/` | Website marketing/docs dựng bằng Astro. |
| `examples/` | Ví dụ spec, context-pack, và một repo test cố tình có lỗ hổng để chính test của scanner quét vào. |
| `demo/` | Script ghi lại đoạn demo terminal ở đầu README này. |
| `tests/` | Bộ test Python. |
| `ops/` | Script ký release và dịch vụ release-gate. |
| `releases/`, `artifacts/` | Log release và artifact build. |
| `reports/`, `ledger/` | Schema/template báo cáo quét và schema theo dõi token usage. |
| `github-app/` | Tích hợp GitHub App. |
| `vendor/` | Bản tham khảo vendored của các dự án bên ngoài Yana AI học hỏi/tích hợp, gồm `hermes-agent`, `openclaw`, và `penpot`. |

Một trục thứ năm, tách version độc lập, là gói Python phân phối qua PyPI,
nằm ở `src/yana_ai/` chứ không phải một thư mục top-level riêng.

### Bên trong `src/`: Yana OS và các mặt phẳng khác

`yana-rt` là một binary, nhưng không phải một module. Ngoài turn runtime
đã mô tả ở trên (`runtime/`, `model/`, `capability/`, `chat/`, `remote/`,
`mcp.rs`), còn bốn mặt phẳng khác nằm trong `src/`:

**Yana OS** (`src/os/`, nội bộ gọi là "Program K") là mặt phẳng quản lý
cục bộ, tách biệt khỏi vòng lặp turn:

- `identity/` — các tier xác thực guest / operator / sovereign
- `autonomy.rs` — nấc thang tự chủ (agent được làm gì mà không cần giám sát)
- `governor.rs` — giới hạn hành vi trên nền nấc thang đó
- `credential.rs` — xử lý credential
- `resource/` — quota CPU/RAM/PID
- `supervisor.rs` — đọc và ghi file khóa HALT; đây là hàm mà authority
  chain của runtime gọi vào ở mỗi turn, và cũng là file mà watcher độc
  lập mô tả bên dưới ghi vào
- `service/` (`manager.rs`, `runtime.rs`, `attribution.rs`) — quản lý
  vòng đời daemon
- `agent.rs`, `health.rs`, `monitor.rs`, `monitor_service.rs`,
  `state.rs`, `status.rs`, `roadmap.rs`, `platform/`

**Bảo mật và audit** (`guard/`, `scanner/`, `score/`, `evidence/`,
`provenance/`, `filescan/`) là công cụ đứng sau `yana-rt audit`,
`yana-rt hunt`, và quét rule trước khi commit: bản port Rust gốc của
các PreToolUse hook tần suất cao nhất, engine so khớp rule, bộ chấm
điểm mức độ nghiêm trọng CRITICAL/HIGH/MEDIUM/LOW, provenance cho
Truth Gate, và một kiểm tra xem code được port vào `core/lib/*_adapted/`
có còn khớp với bản gốc đã vendor hay không.

**Workspace và bộ nhớ** (`workspace/`, `memory.rs`, `vault/`,
`session_context.rs`) là event store cục bộ hợp nhất, hệ thống fact
L1/L2, secret vault có chỉ mục tìm kiếm riêng, và kiểu `SessionContext`
duy nhất mà mọi client (chat, MCP, Desktop) dùng để dựng một turn.

**Công cụ vận hành** là phần còn lại của bề mặt CLI: `init`, `doctor`,
`fix`, `watch`, `monitor`, `observability`, `config`, `cost`, `route`,
`plugin`, `task`, `skill_quality`, `spec`, `graph`, `hunt`, `ci`,
`design`, `mission`, `bus`, và `flock_v1` (khóa file liên-process mà
mọi thứ còn lại trong danh sách này dựa vào để không làm hỏng state
khi có nhiều writer chạy đồng thời).

Một trục thứ năm, độc lập, là `src/yana_ai/` (`rt.py`, `cli.py`) — CLI
Python phân phối qua PyPI. Nó được đóng gói và đánh version tách biệt
khỏi binary Rust; xem `VERSIONING.md`.

---

## Rust runtime — `yana-rt`

34 subcommand được định nghĩa trong source trên toàn bộ feature build. Không phụ thuộc Python. Bản build mặc định mở 32 lệnh runtime; Clap thêm mục `help` hiển thị, còn `mcp` và `remote` bị khóa theo feature.

```bash
yana-ai chat                          # chat streaming được quản trị trên provider catalog chuẩn
yana-ai presentation                  # hỏi → xem trước → xác nhận → tải PPTX có thể chỉnh sửa
yana-ai audit .                       # quét bảo mật — secrets, CVE, rủi ro supply chain
yana-ai graph .                       # knowledge graph — dependency file, resolve import
yana-ai vault search Q                # tìm trong 2.025 skills theo từ khóa
yana-ai hunt .                        # săn pattern bảo mật (OWASP, injection, SSRF)
yana-ai fix .                         # tự động fix vi phạm rule
yana-ai doctor .                      # kiểm tra sức khỏe hệ thống toàn diện
yana-ai map .                         # bản đồ blast radius — agent chạm được những gì?
yana-ai ci                            # chạy toàn bộ gate check (dùng trong CI)
yana-ai route classify "fix auth bug" # phân loại task → simple/complex/external
yana-ai mission create "add-auth"     # tạo mission agent song song
```

### Presentation Studio — từ tài liệu nguồn đến bộ slide có thể chỉnh sửa

`yana-ai presentation` không phải là một prompt “viết vài slide” chạy một lần.
Đây là workflow có con người kiểm soát dành cho học sinh, giáo viên, bài thuyết
trình kỹ thuật và bất kỳ ai muốn duyệt kế hoạch trước khi AI tạo file.

```text
Đặt các câu hỏi rõ ràng
        ↓
Đọc nguồn TXT / Markdown / HTML / DOCX / PPTX / PDF
        ↓
Tạo và hiển thị toàn bộ dàn ý slide
        ↓
Xác nhận · Chỉnh sửa · Hủy
        ↓
Ghi bộ PPTX có thể chỉnh sửa vào Downloads
```

Trước khi tạo, Yana hỏi chủ đề, người nghe, ngôn ngữ, số slide, phong cách hình
ảnh, mục tiêu, tài liệu nguồn, yêu cầu trích dẫn và speaker notes. Yana không
ghi file nào cho tới khi người dùng xác nhận dàn ý đang hiển thị.

```bash
pip install 'yana-ai[presentation]'
yana-ai presentation --provider ollama --model qwen3:14b  # chạy local hoàn toàn
yana-ai presentation --no-ai --dry-run                    # chỉ xem trước
yana-ai presentation --pdf                                # thêm PDF qua LibreOffice
```

Presentation Studio dùng cùng provider catalog và `yana-rt` turn runtime chuẩn
với chat. Ollama là provider local mặc định; cloud provider chỉ được dùng khi
người dùng chọn rõ. API key đi qua stdin thay vì argv, còn tài liệu nguồn được
đánh dấu là dữ liệu tham khảo không đáng tin cậy chứ không phải lệnh thực thi.

Mỗi lần xác nhận tạo một thư mục mới, không ghi đè, dưới
`~/Downloads/Yana-Presentations/`, gồm file `.pptx` chỉnh sửa được,
`presentation.json` lưu brief/slide/note/provider/model/chế độ sinh, và file
`.pdf` tùy chọn. Lỗi model mặc định sẽ dừng an toàn; chỉ dùng kết quả
deterministic khi chọn `--no-ai` hoặc cho phép rõ bằng `--fallback`.

Xem [hướng dẫn Presentation Studio đầy đủ](docs/operations/presentation-studio.md)
để biết yêu cầu định dạng, automation, quyền riêng tư và hỗ trợ PDF.

**Ảnh chụp hiệu năng hiện tại** (đo ngày 2026-08-26 trên MacBook Air Apple M4,
RAM 16 GB, macOS 27 beta; bản release; phương pháp và baseline lịch sử nằm trong
`BENCHMARK.md`):

| Đường chạy | `yana-rt` | Bản Python tham chiếu | Kết quả hiện tại |
|---|---:|---:|---|
| Khởi động process | **4,21 ms** | — | Gần như không đổi so với baseline tháng 7 là 4,15 ms |
| `doctor` | **255 ms** | 365 ms | Rust nhanh hơn 1,43 lần, nhưng hiện chỉ chạy 10 check so với 16 của Python |
| `ci check` | 414 ms | **40 ms** | Rust chậm hơn 10,34 lần và trả 0 finding trong khi Python trả 3 warning |
| `scan core/skills` | **4,45 giây** | 8,89 giây | Rust nhanh hơn 2,00 lần |
| `scan` toàn repo mặc định | 14,61 giây | **7,90 giây** | Python hiện nhanh hơn 1,85 lần |
| HALT hook khi không có lock | **3,80 ms** | — | Nhanh hơn baseline tháng 7 là 4,97 ms |
| Token-budget guard | **3,48 ms** | — | Giảm từ 65 ms nhờ native fast path |

Binary release khoảng 14 MiB. Peak RSS của scan skills là 15,3 MiB với Rust so
với 25,3 MiB của Python; scan toàn repo mặc định là 23,0 MiB so với 34,1 MiB.
Đây là số đo local, không phải tuyên bố đa nền tảng; Linux và Windows chưa được đo.

**Phần chuẩn bị sửa từ kết quả này:** khôi phục parity finding của `ci check`
trước khi tối ưu; đối chiếu 6 check có trong Python `doctor` nhưng chưa có ở đường
Rust; profile full-repo scanner của Rust; và giảm 140 dòng warning của release
build hiện tại. Startup, HALT enforcement và token-budget enforcement hiện chưa
cần tối ưu thêm.

---

## Kiến trúc an toàn

```
core/
├── hooks/          # 63 hook PreToolUse / PostToolUse / Stop
├── rules/          # 71 rule được thực thi (security, correctness, UI, git)
├── scripts/        # safe-run.sh, verify-core-lock.sh, secure-logger.sh
├── gates/          # truth_gate.md, action_gate.md
├── agents/         # 101 định nghĩa agent chuyên biệt
├── skills/         # 2.025 file SKILL.md
├── config/
│   ├── core-lock.json    # manifest SHA-256 — pin 280 file core
│   └── skills-lock.json  # hash nội dung skill
└── memory/
    ├── L1_atomic/  # fact vĩnh viễn — tồn tại qua các session
    └── L2_session/ # trạng thái session — tự hết hạn
```

Các thuộc tính chính, đã xác minh trên code thật, không chỉ trên tài liệu mô tả:
- **Audit log nối hash chống giả mạo** — mọi hành động được log thành một entry JSONL nối hash (mỗi entry chứa hash của entry trước — chuỗi tuyến tính, không phải Merkle tree như bản README cũ từng gọi sai); sửa một dòng đã ghi sẽ bị phát hiện khi tính lại chain (`verify-audit-chain.sh`)
- **Core-lock integrity** — manifest SHA-256 (`core-lock.json`) phát hiện drift, xóa file, và file lạ chưa qua review chèn vào `core/rules`, `core/hooks`, `core/gates`, `core/scripts`
- **Review trước khi thay đổi hạ tầng** — trước khi một thay đổi vào `core/rules/**`, `core/hooks/**`, `core/gates/**`, hay `core/agents/**`, hai agent reviewer độc lập (security-auditor cùng một reviewer đi kèm) được dispatch; một finding mức Safety từ một trong hai sẽ chặn việc ghi cho đến khi người dùng giải quyết
- **Human gate** — hành động không thể hoàn tác (force-push, publish, deploy, xóa) cần xác nhận rõ ràng từ người trong phiên hiện tại, không phải một sự chấp thuận đứng yên từ trước
- **Giám thị độc lập ("giám thị")** — opt-in, hỏi một lần khi cài đặt. Chạy trên OS scheduler thật (macOS LaunchAgent / cron), hoàn toàn ngoài mọi phiên Claude, kiểm tra core-lock integrity, audit-chain integrity, và các thay đổi gần đây vào path nhạy cảm mỗi vài tiếng. Phát hiện bất thường → ghi file lock khiến mọi tool call sau đó trong mọi phiên trên repo đó bị deny thẳng, không có flag bypass, không có đường code nào — kể cả trong chính hook này hay watcher — gỡ được. Chỉ con người, sau khi đọc lý do khoá, tự xóa file bằng tay, mới gỡ được. Sự bất đối xứng này là chủ ý: cái có thể dừng phiên không phải là cái có thể khởi động lại nó, để một agent (dù bị compromise hay chỉ đơn giản là sai) không thể tự chấm bài mình rồi tự mở khóa.

---

## Trông như thế nào trong thực tế

Cùng một output đã chạy thật với demo ở đầu README này (`core/hooks/guard-destructive.sh`, 2026-07-04) — không lặp lại ở đây để tránh nói hai lần. Xem [Giới hạn thực tế](#giới-hạn-thực-tế) bên dưới để biết guard này *chưa* bắt được gì, hoặc [docs/reference/known-limitations.md](docs/reference/known-limitations.md) để xem chi tiết kỹ thuật đầy đủ.

---

## Giới hạn thực tế

Trung thực, không quảng cáo: đã xác minh trực tiếp trên hook sống, không phải trên tài liệu mô tả chúng.

- **`guard-destructive.sh` là guard trên chuỗi lệnh, không phải bộ phân tích shell thật.** Nó tách token theo khoảng trắng và so khớp các cách viết nguy hiểm đã biết (`rm -rf`, `git push --force`, `git clean -f`, `git reset --hard`, push trực tiếp vào main/master). Tính đến 2026-07-05 (4 vòng review đối kháng trong một ngày) nó đã chuẩn hóa quote nguyên token (`"..."`, `'...'`, `$'...'`), escape backslash, ghép biến kiểu `${IFS}`, và từ chối thẳng các dạng brace-expansion cạnh lệnh git/rm — nhưng nó **chưa** xử lý được kiểu ghép quote giữa token (đoạn có quote và không quote xen kẽ trong cùng một từ, không có khoảng trắng ngăn cách, ví dụ `--forc"e"` — shell thật sẽ hiểu thành `--force`, guard này thì không). Để đóng lỗ hổng này cần parser theo trạng thái quote từng ký tự, không phải thêm một phép so khớp token nữa: đây là câu hỏi thiết kế dài hạn, không âm thầm coi là đã xong. Một lệnh cố tình soạn ra để lách vẫn có thể qua được guard này; một agent gõ lệnh bình thường sẽ bị bắt.
- **Kiểm tra SSRF đã active trên manifest Claude, Codex và Claude plugin; bảo vệ supply-chain vẫn phụ thuộc runtime surface.** `tool-validator.sh` hiện bảo vệ các bề mặt Bash/write/WebFetch được hỗ trợ. `dependency-safety-gate.sh` và `supply-chain-guard.sh` vẫn chỉ có trong plugin, nên không được tuyên bố chặn typosquat/package-install nếu chưa kiểm tra bề mặt cài đặt đang hoạt động. Evidence execution-path sinh tự động nằm tại `docs/operations/hook-execution-path-audit.md`.
- **`core/` và `.claude/` là hai bản copy cùng một nguồn theo thiết kế**, không phải trùng lặp ngoài ý muốn. `core/` là bản gốc, `.claude/` là bản Claude Code đọc lúc chạy, và `core/config/core-lock.json` pin hash SHA-256 của cả hai. Nếu thấy chúng như nội dung trùng lặp, đó là chủ ý, không phải bug cần "dọn dẹp."
- **macOS không có sẵn `timeout`/`gtimeout` kiểu GNU.** Một hook từng giả định luôn có timeout này đã âm thầm không bao giờ chạy được hook nào trên các máy bị ảnh hưởng cho đến khi phát hiện và fix (2026-07-04). Giờ nó xuống cấp một cách nhẹ nhàng (chạy không giới hạn timeout) thay vì âm thầm không làm gì cả, nhưng đáng lưu ý loại bug "giả định môi trường" này là chính xác thứ cần để ý nếu bạn fork hoặc mở rộng các hook này.

Tìm thấy lỗ hổng chưa liệt kê ở đây? [Mở issue](https://github.com/yanacuti1121/yana-ai/issues). Báo cáo thực tế là cách một guard như thế này thực sự trở nên sắc bén hơn, không phải bằng cách viết thêm tài liệu mô tả nó nên làm gì.

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

Sáu route:
- **simple** → Yana xử lý trực tiếp (chỉ đọc, không cần agent)
- **skill** → so khớp với index 2.025 skill, dispatch đúng agent skill
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

Xem [tài liệu CLI đầy đủ](docs/reference/cli-reference.md) để biết ví dụ output và chi tiết hơn, hoặc **[COMMANDS.md](COMMANDS.md)** để xem toàn bộ lệnh `yana-ai` ở một chỗ.

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

## Tích hợp MCP — Buzz

`yana-rt mcp` lộ ra kiểm tra lệnh phá hoại chuẩn cùng các thao tác repo,
Git, host, process và workspace được quản trị dưới dạng MCP tool qua stdio.
Nó là opt-in, gated sau Cargo feature `mcp`, không nằm trong binary mặc
định. Transport này không thể tự tạo quyền duyệt của con người: thao tác
workspace chỉ được phép sau approval vẫn bị MCP server từ chối.

Đối tượng dùng thật đầu tiên là [Buzz](https://github.com/block/buzz),
một workspace nhóm tự host nơi AI agent là thành viên chính thức với key
riêng. `buzz-acp` của Buzz sinh ra bất kỳ agent nào nói ACP (goose,
codex, claude-code, hoặc `buzz-agent`) và có thể gắn thêm 1 MCP server
qua `BUZZ_ACP_MCP_COMMAND` — trỏ vào Yana AI thì mọi agent Buzz điều
phối đều có cùng kiểm tra lệnh, không chỉ riêng Claude Code.

```bash
cargo build --release --features mcp
export BUZZ_ACP_MCP_COMMAND=/path/to/Yana-AI/scripts/yana-rt-mcp-wrapper.sh
```

Cần wrapper vì `buzz-acp` gọi `BUZZ_ACP_MCP_COMMAND` không kèm tham số
nào, mà `yana-rt` cần subcommand `mcp` — xem
[docs/programs/buzz-mcp-integration.md](docs/programs/buzz-mcp-integration.md)
để biết cách setup đầy đủ (sinh keypair, đăng ký với relay) và bản ghi
JSON-RPC qua stdio đã verify thật. Lưu ý: đây chỉ làm cho công cụ kiểm
tra *có sẵn* cho agent được sinh ra — agent đó có thực sự gọi nó trước
khi chạy lệnh hay không phụ thuộc vào chính sách dùng tool của agent đó,
không có gì bắt buộc.

---

## Yana AI (sản phẩm web)

**[Trải nghiệm trực tiếp →](https://yanai-production.up.railway.app)** · **[Tải Desktop →](https://yanacuti1121.github.io/Yana-AI/desktop.html)** · **[Toàn bộ lệnh →](https://yanacuti1121.github.io/Yana-AI/commands.html)** · **[Bản mới nhất →](https://github.com/yanacuti1121/Yana-AI/releases/latest)**

Yana là giao diện end-user đầu tiên được xây trên Yana AI core. Ứng dụng Electron Desktop dùng Rust runtime cục bộ cho các turn được quản trị; bản chỉ chạy trên trình duyệt vẫn là bề mặt tương thích cho tới khi được nối với một local runtime đáng tin cậy.

```text
Electron Desktop → local NDJSON adapter → yana-rt headless
                                      → Giám Thị + kiểm tra thẩm quyền Yana
                                      → TurnEngine
                                      → provider hoặc capability đã được duyệt

Web chỉ chạy trình duyệt → JavaScript gateway cũ → provider
                           (boundary tương thích rõ ràng, không phải đường chuẩn được quản trị)
```

- Không cần đăng ký: dùng API key của riêng bạn
- 🔐 **Key vault mã hóa** — key lưu bằng AES-256-GCM, master key không thể export (WebCrypto + IndexedDB), không bao giờ ở dạng plaintext
- **Rust catalog chuẩn:** 19 provider — Anthropic, OpenAI, Gemini, Groq, DeepSeek, OpenRouter, xAI, Novita, NVIDIA, MiniMax, GLM, Hugging Face, 9Router, Kimi, Ollama, LM Studio, llama.cpp, TurboFieldfare và AirLLM
- **Electron Desktop:** 17 provider đã cấu hình đi qua Rust headless; llama.cpp và AirLLM hiện là tích hợp runtime/terminal, chưa phải mục Settings của Desktop

**Một số ví dụ thiết lập provider phổ biến**, dùng key của bạn, key được mã hóa cục bộ (không bao giờ gửi về Yana AI):

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

## Cắt giảm chi phí token của chính bạn

Yana AI thực thi an toàn cho những gì agent làm — nó không giảm số token
agent đốt khi đọc output lệnh. Nếu đó mới là vấn đề thật của bạn, dùng kèm
[`rtk`](https://github.com/rtk-ai/rtk), một công cụ Apache-2.0 riêng biệt
được viết cho đúng việc đó (lọc/nén output bash trước khi agent đọc, giảm
tới 90% trên các lệnh thông dụng). Không nhúng code, không phải dependency
— xem [docs/reference/token-optimization.md](docs/reference/token-optimization.md)
để cài đặt + nối vào Claude Code/Cursor/Codex/Antigravity.

---

## Versioning

Yana AI có 3 trục version độc lập — có chủ đích, không phải lộn xộn (giống Kubernetes hay LLVM: các thành phần độc lập, chu kỳ release độc lập). Chỉ 2 trong 3 trục thực sự phát hành lên một registry; trục Product (rules/hooks/skills/agents/CLI) thì không, xem cột Registry bên dưới.

| Trục | Version | Registry |
|---|---|---|
| Product (rules/hooks/skills/agents/CLI) | **1.4.2** | Không có — không phân phối qua npm, xem [VERSIONING.md](VERSIONING.md#why-product-has-no-registry) |
| Rust runtime (`yana-rt`) | **1.4.2** | [crates.io/crates/yana-rt](https://crates.io/crates/yana-rt) |
| Python package | **1.4.2** | [pypi.org/project/yana-ai](https://pypi.org/project/yana-ai/) |

Nếu anh thấy 3 số version khác nhau trong repo này (kể cả `git tag`, các mục cũ trong `ROADMAP.md` viết trước khi tách trục ngày 2026-07-05, hay badge phía trên) — đó là bình thường, xem đầy đủ lý do tại [VERSIONING.md](VERSIONING.md).

### Có gì mới trong v1.4.0

Ba provider local-first mới, một lần hợp nhất kiến trúc runtime, và một lỗ hổng wiring hook an toàn đã nằm im không ai để ý suốt nhiều tháng, nay đã đóng:

- **Provider mới:** adapter Discord (chat read-only, worker thread riêng cách ly khỏi panic của từng turn, hàng đợi dispatch giờ có giới hạn chống flood tin nhắn); provider local AirLLM qua một bridge OpenAI-compatible mỏng, có admission control giới hạn (request đồng thời thứ 2 nhận `503` rõ ràng, không xếp hàng vô hạn), read timeout, và giới hạn độ dài context được check trước khi gọi generate tốn kém; quản lý model Ollama ngay trong terminal chat (pull/delete/status), giờ phân biệt đúng lỗi backend thật với danh sách cài đặt trống thật.
- **Kiến trúc runtime:** phần chat chuyển sang Capability Runtime chuẩn (typed error, `SessionContext`, golden end-to-end test) trên một Rust workspace vừa được hợp nhất; một Host-Native OS Program (platform contract, resource/model plane, actor identity, resident service) và nền tảng OS Service Supervisor luôn chạy.
- **An toàn, fix nổi bật nhất:** check null-byte của `tool-validator.sh` đã âm thầm collapse thành pattern rỗng luôn khớp — một lỗi bash quoting (`$'\x00'` không thể biểu diễn byte NUL thật) khiến gần như mọi lệnh Bash bị chặn. Ngoài ra: 16 hook an toàn (`deploy-gate`, `db-protect`, `api-destruct-guard`, `supply-chain-guard`, `prompt-injection-guard`, `token-scope-guard`, `code-freeze`, `code-quality-gate`, `coverage-gate`, `dependency-safety-gate`, `static-analysis-gate`, `test-runner-gate`, `multi-agent-lock`, `confidence-scorer`, `risk-scorer`, `canary-token-guard`) đã tồn tại trong `core/hooks/` nhưng chưa từng được tham chiếu trong `.claude/settings.json` — chưa cái nào từng chạy — nay đã wire, cộng 2 cái được fix vì tự tắt hết check khi thiếu `jq`. Một Giám Thị control plane hợp nhất, chính là halt watcher trong mục Safety Architecture của README này, thay thế bản triển khai tách rời trước đó.
- **Chat UX:** hỗ trợ chuột thật, gợi ý trạng thái theo ngữ cảnh, `/undo`, và custom slash command trong `yana chat`.
- **Vận hành:** image sandbox Docker giờ publish lên GHCR mỗi lần push; siết CI từ con số 0 — mọi tham chiếu GitHub Action đều pin SHA, `cargo audit`/`pip-audit`/`npm audit` wire thành required check, một bước release-manifest ghi lại commit SHA/toolchain/artifact SHA256 cho mỗi binary phát hành, bật branch protection trên `main` lần đầu tiên; đóng các CVE thật (`quinn-proto` RUSTSEC-2026-0185, lỗ hổng SSRF cho dải CGNAT và IPv4-mapped-IPv6).

Bản đầy đủ kèm số PR: [CHANGELOG.md](CHANGELOG.md) (xem mục "v1.4.0").

---

## 📚 Tài liệu

| Tài liệu | Mô tả |
| --- | --- |
| [Hành trình](JOURNEY.vi.md) | Câu chuyện đằng sau Yana AI |
| [Triết lý](PHILOSOPHY.vi.md) | Niềm tin cốt lõi và tầm nhìn dài hạn |
| [Nguyên tắc](PRINCIPLES.vi.md) | Nguyên tắc kỹ thuật định hướng mọi quyết định thiết kế |
| [Nguồn gốc](docs/history/LINEAGE.md) | Hồ sơ khởi nguồn có ngày tháng, đã kiểm chứng bằng chứng — codebase này thực sự bắt đầu từ đâu |
| [Lời tri ân](ACKNOWLEDGEMENTS.vi.md) | Ghi công và tri ân cộng đồng mã nguồn mở |

---

## Xây dựng bởi một người

Một người. Không team. Không tài trợ.

- Kiến trúc hook, safety gate, Python CLI
- Rust runtime (`yana-rt`), 100 agent, 2.025 skill, hỗ trợ đa harness
- 4 harness adapter (Claude Code, Cursor, Codex, Antigravity)

2.025 skill bao phủ: frontend, backend, AI/LLM, security, Kubernetes, WebAssembly, DevOps, database, testing, và nhiều hơn nữa. Hai agent persona phục vụ việc không phải code: học tập (`hoc-tap`) và trợ lý hàng ngày (`daily-assistant`).

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

## Liên kết dự án

| | |
|---|---|
| Toàn bộ lệnh CLI | [COMMANDS.md](COMMANDS.md) |
| Toàn bộ lệnh (CLI + slash command, web) | [yanacuti1121.github.io/Yana-AI/commands.html](https://yanacuti1121.github.io/Yana-AI/commands.html) |
| Đóng góp | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Quy tắc ứng xử | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| Chính sách bảo mật | [SECURITY.md](SECURITY.md) |
| Giấy phép | [Apache 2.0](LICENSE) |

---

## Liên hệ

**Vũ Văn Tâm** · Việt Nam · 17 tuổi

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana Desktop | [yanacuti1121.github.io/Yana-AI/desktop.html](https://yanacuti1121.github.io/Yana-AI/desktop.html) |

---

## English · 🇰🇷 한국어 · 🇨🇳 中文

Bản dịch đầy đủ của tài liệu này: **[README.md](README.md)** (English) · **[README.ko.md](README.ko.md)** (한국어) · **[README.zh.md](README.zh.md)** (中文)

---

## Nguồn gốc

Codebase này có gốc xa hơn lịch sử git của chính repo (bắt đầu 17/05/2026) — trước đó là một scaffold dưới tên "YAMTAM ENGINE". Xem [docs/history/LINEAGE.md](docs/history/LINEAGE.md) để biết hồ sơ khởi nguồn có ngày tháng — phần nào đã tự kiểm chứng (nội dung file zip, git history nhúng bên trong, checksum) và phần nào chỉ được báo lại, chưa xác nhận được.

---

## Nguồn ảnh hưởng và xuất xứ thiết kế

Yana AI được tự triển khai độc lập. Dự án nghiên cứu các pattern kiến trúc công khai và hiện thực theo contract tương tác chính thức; không đổi nhãn dự án khác hay nhận công trình của họ là của Yana.

| Nguồn | Yana học hoặc hiện thực theo điều gì | Ranh giới xuất xứ |
|---|---|---|
| [AAIF Goose](https://github.com/aaif-goose/goose) | Agent runtime không khóa provider và cách gắn kết Rust, CLI, Desktop, API | Dự án Apache-2.0 được nghiên cứu ở mức pattern kiến trúc; không sao chép hoặc vendor source Goose trong phần hợp nhất runtime này |
| [Đặc tả Model Context Protocol](https://modelcontextprotocol.io/specification/latest) | Khả năng tương tác chuẩn cho tool/resource và boundary giao thức | Đặc tả công khai chính thức; thứ bậc thẩm quyền, capability policy và runtime của Yana được thiết kế độc lập |
| [Tài liệu streaming của Anthropic](https://platform.claude.com/docs/en/build-with-claude/streaming) | Semantics của Messages streaming và event | Chỉ dùng contract đường truyền provider; không tái sử dụng UI hay product code |
| [Gemini generate-content API](https://ai.google.dev/api/generate-content) | Streaming, content part và request ảnh inline của Gemini | Chỉ dùng contract đường truyền provider; implementation được viết trong abstraction của Yana |
| [OpenAI Chat API reference](https://platform.openai.com/docs/api-reference/chat) | Chat tương thích OpenAI, SSE, usage và trường tool-call | Contract để tương tác với các endpoint tương thích, không phải nguồn UI/branding |

Phần hợp nhất runtime này không sao chép source từ Goose hoặc các dự án trong bảng. Nếu sau này tái sử dụng code trực tiếp, Yana bắt buộc phải giữ URL nguồn, giấy phép, copyright notice và attribution ở cấp file.

---

## Ghi nhận

Yana AI được xây dựng dựa trên ý tưởng, pattern, và công cụ từ cộng đồng mã nguồn mở, bao gồm các dự án cấp phép Apache 2.0, MIT, và các giấy phép permissive khác. Mọi nguồn bên thứ ba đều được sử dụng tuân thủ giấy phép tương ứng. Dự án này không có ý định sao chép, trình bày sai lệch, hay xâm phạm sở hữu trí tuệ của bất kỳ cá nhân hay tổ chức nào. Khi một dự án cụ thể ảnh hưởng trực tiếp đến quyết định thiết kế, dự án đó được ghi công trong file source và tài liệu rule liên quan.
