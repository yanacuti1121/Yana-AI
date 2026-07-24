# Program J — Universal Capability Runtime

**Status:** `Draft` — Phase 0 (Input) đầy đủ. Phase 1 (Specification) điền
được 3/4 Open Question ban đầu từ `docs/VISION-2.4.md` (còn 1 câu thật sự
mở, roadmap không đề cập). Phase 2 (Capability Inventory) bắt đầu
2026-07-24: liệt kê 6 capability, đọc code thật `core/adapters/` phát
hiện 1 câu hỏi kiến trúc MỚI — **đã trả lời cùng ngày: anh Tâm chọn MCP
Server thay thế hoàn toàn pattern translator-per-engine**, xem "Capability
List" bên dưới. Cùng ngày, thêm 1 Input mới (`yana-ai chat` + Ollama
local cần đọc được repo); anh Tâm đã trả lời câu hỏi phạm vi — Có, thuộc
Program J, M=5 (xem mục Scope). **Cả 2 câu hỏi kiến trúc từng chặn Phase 3
đã có câu trả lời — Phase 3 Architecture giờ mở khoá.**
**Nguồn:** anh Tâm's tóm tắt trực tiếp 2 video tham khảo (InsForge,
"Tại sao cần MCP trong khi đã có API?", 2026-07-23) + `docs/VISION-2.4.md`
(2026-07-24, cho 3 câu trả lời dưới đây) + anh Tâm trực tiếp trong hội
thoại 2026-07-24 (Input bổ sung).
**Template:** ADS v1 Phase 1 (19 trường).

> Ranh giới rõ: mục nào ghi **"Nguồn gốc"** là nguyên văn/paraphrase sát
> nguồn, KHÔNG sửa ý. Mục nào ghi **"Chưa quyết — cần anh"** là phần thật
> sự chưa có câu trả lời ở bất kỳ đâu, KHÔNG phải AI tự điền.

---

## Program Name

Program J — Universal Capability Runtime

## Vision

Nguồn gốc (video 2 — MCP vs API): thay hạ tầng kết nối Agent↔Dịch vụ từ
mô hình **M×N** (mỗi Agent tự hardcode kết nối tới mỗi dịch vụ, build-time)
sang mô hình **M+N** qua giao thức trung gian chuẩn hoá (MCP) — Agent
(MCP Client) và Dịch vụ (MCP Server) tách rời, agent tự khám phá công cụ
lúc runtime thay vì hardcode.

Nguồn gốc (video 1 — InsForge): mở rộng nguyên tắc đó xuống hạ tầng
backend — DB, auth/OAuth, file storage chuẩn hoá thành "tool" agent tự
dùng được (chỉ là NGUỒN CẢM HỨNG cho pattern — xem Non Goals, Yana AI
không tự làm phần backend provisioning này).

## Motivation

Nguồn gốc: 2 video cụ thể (InsForge — tool mã nguồn mở Apache 2.0 tự
động hoá backend; "Tại sao cần MCP" — MCP do Anthropic công bố cuối
2024, lớp trung gian chuẩn hoá Model↔API/Dịch vụ).

## Problem

Nguồn gốc (video 2): 2 vấn đề. (1) **Bùng nổ M×N** — 3 agent × 4 dịch vụ
= 12 kết nối bảo trì tay; thêm 1 agent → 16; API đổi version/xoay token
→ sửa code hàng loạt vị trí. (2) **Đóng cứng build-time** — công cụ
hardcode trong mã nguồn, agent chạy không tự nhận biết/kết nối công cụ
mới nếu không sửa code+build+deploy lại.

**Áp dụng cho Yana AI** (từ `VISION-2.4.md`'s nguyên tắc #2 "một
capability, nhiều AI cùng dùng — không khoá vào Claude/Cursor/Gemini" +
mục "Adapter tầng AI"): vấn đề M×N thật của Yana AI KHÔNG phải kết nối
tới dịch vụ ngoài (Slack/Jira/Postgres như ví dụ chung trong video) — mà
là mỗi capability/skill/hook mới của Yana AI phải nối tay riêng vào từng
adapter AI (Claude/Cursor/Gemini/Codex = M = 4), thay vì 1 lần expose
dùng chung cho cả 4.

## Goals

Nguồn gốc: tách rời Agent/Dịch vụ, dynamic discovery lúc runtime, giảm
M×N xuống M+N, chuẩn hoá capability thành tool.

## Non Goals

**Trả lời từ `VISION-2.4.md`** (không tìm thấy InsForge-style backend
provisioning ở đâu trong 30-capability roadmap gốc; sứ mệnh Yana AI
xuyên suốt session này là AI-agent-safety tooling, không phải backend-
as-a-service): **Yana AI KHÔNG tự triển khai lớp provisioning DB/auth/
storage kiểu InsForge cho dự án khác.** InsForge chỉ là nguồn cảm hứng
cho pattern "chuẩn hoá capability thành tool agent tự dùng được" — pattern
đó áp dụng cho capability CỦA CHÍNH Yana AI (skill/hook/command), không
mở rộng thành một sản phẩm backend-provisioning riêng.

## Scope

**Trả lời từ `VISION-2.4.md`** (mục 2, "Adapter tầng AI"): N = capability/
skill/hook hiện có của Yana AI (`core/skills/`, `core/hooks/`,
`core/commands/`), M = 4 AI tool đã nêu tên rõ trong roadmap
(Claude/Cursor/Gemini/Codex), tương ứng trực tiếp với `core/adapters/`
đã tồn tại trong repo. Không mở rộng sang dịch vụ ngoài (GitHub/Linear/
Slack) trong phạm vi Program J này.

**Cập nhật 2026-07-24 — anh Tâm xác nhận trực tiếp** ("program J đi, gộp
vào cho gọn", trả lời Open Question 2 bên dưới): **M = 5**, thêm
`yana-ai chat` (chế độ `--provider ollama`, local model) làm client thứ
5, cùng hạng với Claude/Cursor/Gemini/Codex. Khác với 4 client kia —
vốn là editor/CLI BÊN NGOÀI mà Yana AI viết adapter để nối vào — client
thứ 5 này là **binary Yana AI tự sở hữu** (`yana-rt chat`), nên khả năng
nối vào Capability Engine có thể trực tiếp hơn (gọi hàm Rust nội bộ)
thay vì qua translator script kiểu `core/adapters/cursor/`. Đây là nhận
định sơ bộ, KHÔNG phải quyết định kiến trúc — Phase 3 (còn bị chặn bởi
Open Question kiến trúc cũ: MCP Server thay thế hay mở rộng pattern
translator-per-engine) mới là nơi vẽ chi tiết chuyện này.

## Architecture

**Trả lời từ `VISION-2.4.md`** (nguyên tắc #2 + "Capability Registry +
Dynamic Discovery — agent hỏi 'what can I do?' thay vì hardcode if/else
theo provider"): Yana AI đóng vai **MCP Server** — expose capability của
chính mình (registry) cho nhiều AI client (Claude/Cursor/Gemini/Codex,
đóng vai MCP Client) cùng dùng chung, thay vì mỗi AI tool có adapter
code hardcode riêng. Đây là hướng kiến trúc cấp cao, CHƯA phải bản vẽ
chi tiết (module/interface cụ thể) — cần Phase 3 riêng để vẽ đầy đủ.

_(Sơ đồ chi tiết + quyết định "Yana AI có cần đóng thêm vai MCP Client
để tiêu thụ MCP server khác không, hay thuần Server" — chưa viết, đây là
Phase 3 thật sự, không phải điền cho đủ ở Phase 1)_

## Modules

_(TODO — Phase 3, cần vẽ kiến trúc chi tiết trước)_

## Interfaces

_(TODO — Phase 3)_

## Workflow

_(TODO — Phase 4, cần Architecture chi tiết trước)_

## Data Flow

_(TODO — Phase 4)_

## Capability List (Phase 2 — Capability Inventory)

**Phát hiện thật trước khi liệt kê** (đọc trực tiếp
`core/adapters/cursor/before-shell-execution.js`, file DUY NHẤT hiện có
trong `core/adapters/`): pattern THẬT đang chạy không phải "MCP Server
expose registry" — mà là **mỗi AI engine có 1 translator mỏng riêng cho
từng loại hook, forward vào logic gốc dùng chung** (comment trong chính
file đó: "Windsurf/Kiro/OpenCode/Codex translators planned to follow this
same pattern"). Cách này ĐÃ giải một phần M×N (logic gốc — vd
`guard-destructive.sh` — chỉ sống ở 1 nơi), nhưng vẫn còn M×N ở cấp
"số loại hook × số engine" (mỗi hook type mới × mỗi engine mới = 1
translator mới cần viết tay).

**Câu hỏi kiến trúc — ĐÃ QUYẾT 2026-07-24:** anh Tâm chọn **Thay thế hoàn
toàn** (qua `AskUserQuestion`, giữa 2 lựa chọn: mở rộng thêm lớp — được
đề xuất vì rủi ro thấp hơn — vs thay thế hoàn toàn). MCP Server sẽ thay
thế pattern translator-per-engine hiện tại (`core/adapters/cursor/
before-shell-execution.js` và tương lai các translator khác), không giữ
song song 2 cơ chế.

**Rủi ro đã nêu trước khi anh quyết, ghi lại để không mất dấu (không phải
để phản đối quyết định — đây là quyết định của anh, không phải AI tự
suy diễn):** cơ chế enforce hook thời gian thực hiện tại (guard-destructive.sh
qua Cursor) đã chạy thật, đã proven; thay thế hoàn toàn nghĩa là phải
viết lại/re-validate toàn bộ đường enforce đó qua MCP. MCP vốn là mô hình
request/response — cần xác nhận rõ trong Phase 3 rằng nó đáp ứng được
yêu cầu chặn nhanh/không được lỗi của một `PreToolUse` hook trước khi
implement, không giả định suông. Đây là mục cần kiểm chứng cụ thể trong
Phase 3 Architecture, không phải lý do trì hoãn quyết định đã chốt.

**Mở khoá Phase 3 Architecture** cho toàn bộ Program J (bao gồm cả use
case `yana-ai chat` mới) — cả 2 câu hỏi kiến trúc từng chặn Phase 3 giờ
đã có câu trả lời.

Danh sách capability (nguồn: `VISION-2.4.md` mục 2, đã gộp sẵn):

| Name | Purpose | Input | Output | Dependency | Priority | Owner | Status |
|---|---|---|---|---|---|---|---|
| AI Adapter Layer | Dịch hook event của từng AI tool sang format chung, không hardcode logic riêng | Tool-native hook payload (vd Cursor's beforeShellExecution JSON) | Tool-native permission response | `core/hooks/*.sh` (logic gốc dùng chung) | _(TODO)_ | _(TODO)_ | **Có thật, hẹp** — 1/4+ engine (chỉ Cursor), 1 hook type (destructive-command). Client thứ 5 (`yana-ai chat`, xác nhận 2026-07-24, xem mục Scope) chưa có adapter — vì là binary Yana AI tự sở hữu, có thể không cần pattern translator-script như 4 client kia, nhưng đây là giả thuyết, chưa quyết ở Phase 3 |
| Prompt Translation Engine | Dịch Prompt AST sang format riêng từng AI | _(TODO — chưa rõ input cụ thể)_ | _(TODO)_ | _(TODO)_ | _(TODO)_ | _(TODO)_ | Chưa bắt đầu |
| Capability Engine (Registry + Dynamic Discovery) | Agent hỏi "có công cụ gì" thay vì hardcode if/else theo provider | _(TODO — phụ thuộc câu hỏi kiến trúc ở trên: MCP hay mở rộng translator)_ | _(TODO)_ | _(TODO)_ | _(TODO)_ | _(TODO)_ | Chưa bắt đầu — đây là phần lõi MCP-Server hướng đã chốt |
| Model Router | Định tuyến task theo độ khó (Simple→Haiku, Medium→Sonnet, Hard→Opus) | Task description | Model tier quyết định | _(TODO)_ | _(TODO)_ | _(TODO)_ | Chưa bắt đầu |
| Marketplace (lớp phân phối) | Phân phối capability đã đóng gói | _(TODO)_ | _(TODO)_ | Capability Engine (phải có trước) | _(TODO)_ | _(TODO)_ | Chưa bắt đầu — phụ thuộc Capability Engine |
| Extension SDK (lớp phân phối) | Cho phép bên thứ 3 viết thêm capability | _(TODO)_ | _(TODO)_ | Capability Engine (phải có trước) | _(TODO)_ | _(TODO)_ | Chưa bắt đầu — phụ thuộc Capability Engine |

Nhiều ô `_(TODO)_` — đúng theo ADS v1: Priority/Owner/Input/Output cụ thể
cần anh quyết định hoặc cần Phase 3 Architecture xong trước, không suy
diễn cho đủ bảng.

## Dependencies

Đã biết thật: `core/adapters/` (đối tượng cần refactor theo hướng MCP
Server), `core/config/mcp-whitelist.json` (cơ chế whitelist MCP server
đã tồn tại — quan hệ cụ thể với Program J vẫn là Open Question 4).

## Deliverables

_(TODO — theo ADS v1 Output cuối: PROGRAM_J.md hoàn chỉnh, ADR,
Architecture Diagram, Capability Matrix, Workflow Diagram, Implementation
Roadmap, Readiness Report, Risk Register, Benchmark Plan, Documentation
Plan — chưa cái nào có, đúng vì còn ở Phase 1)_

## Definition of Done

_(TODO — cần Capability List đầy đủ (Phase 2) + Architecture chi tiết
(Phase 3) trước)_

## Risks

Governance risk (nguồn gốc, suy ra trực tiếp): MCP mở rộng bề mặt tấn
công (dynamic tool discovery từ nguồn ngoài lúc runtime) — cần đối chiếu
với `agent-tool-poisoning-guard.md`, `core/config/mcp-whitelist.json` đã
có sẵn (chi tiết = Open Question 4).

## ADR

_(TODO — chưa tới Phase 6)_

## Roadmap

_(TODO — chưa tới Phase 9)_

---

## Readiness Matrix (Phase 5 — chưa đánh giá, chưa qua Phase 1-4 đầy đủ)

- [ ] Repository
- [ ] Knowledge
- [ ] Notebook
- [ ] Memory
- [ ] Runtime
- [ ] Governance
- [ ] Security
- [ ] Benchmark
- [ ] Cost
- [ ] Context

## Input bổ sung — 2026-07-24 (trực tiếp từ anh Tâm, không phải suy diễn)

**Nguồn gốc:** anh Tâm, giữa hội thoại 2026-07-24, sau khi xác nhận
`yana-ai chat --provider ollama` đã chạy được thật (test trực tiếp,
model `qwen2.5-coder:14b`) nhưng chỉ là hội thoại thuần — không đọc
được file, không thấy repo (xem `src/chat/mod.rs`'s module doc, quyết
định phạm vi có chủ đích từ bản kế hoạch gốc `mellow-sleeping-jellyfish.md`
decision 4). Nguyên văn ý định: *"2 cái đó là ý định anh muốn từ trước,
nó giống Claude Code ấy, nó cũng có thể đọc được repo"* — chọn thẳng
hướng B (tự mở rộng `yana-ai chat`) khi được hỏi so với hướng A (dùng
`core/adapters/cursor/` đã có sẵn + Cursor trỏ vào Ollama, độ chắc chắn
thấp hơn vì không verify được Cursor Agent mode có support Ollama).

**Yêu cầu cụ thể:** `yana-ai chat` (hoặc một chế độ mới của nó) khi chạy
với `--provider ollama` cần có khả năng đọc (và có thể sau này là thao
tác) repo thật, giống Claude Code đang làm trong phiên này — không còn
là "hội thoại thuần" nữa.

**Câu hỏi phạm vi — ĐÃ QUYẾT 2026-07-24:** anh Tâm xác nhận trực tiếp
("program J đi, gộp vào cho gọn") — việc này nằm TRONG scope Program J,
chấp nhận mở rộng Scope thật sự (M = 5, không phải 4 như roadmap gốc
`VISION-2.4.md` nêu). Xem mục Scope ở trên cho nội dung đã cập nhật.
Đây là quyết định của anh Tâm, không phải AI tự suy diễn — ghi lại đúng
nguyên văn để có dấu vết.

**An toàn — đã xác định rõ trước khi bàn tới Phase 3 Architecture:** đây
KHÔNG phải một thay đổi nhỏ. Hiện tại `yana-ai chat` cố tình zero
tool-calling/zero execution — chính vì lý do đó mà nó nằm ngoài tầm với
của toàn bộ hệ hook bảo vệ (`.claude/settings.json`'s PreToolUse/
PostToolUse chỉ bắt được tool-call Claude Code tự làm, không thấy được
process độc lập). Cho nó đọc file/chạy lệnh thật nghĩa là nó cần bắt đầu
tuân theo TOÀN BỘ hàng rào repo này đã xây: `04-sandbox-isolation-law.md`,
`agent-excessive-agency-law.md` (min-permission, irreversible-action
gate), `agent-tool-poisoning-guard.md`, `execution-environment.md`'s
banned runtime functions. Không có ngoại lệ vì model chạy local — model
yếu hơn Claude không có nghĩa lệnh nó tạo ra kém nguy hiểm hơn.

## Open Questions

1 câu hỏi thật sự còn mở (câu về `yana-ai chat` đã được anh Tâm trả lời
2026-07-24 — "có", xem Scope + "Input bổ sung" ở trên):

1. Quan hệ với `44-supply-chain-vetting.md`/`agent-tool-poisoning-guard.md`
   (MCP server whitelist đã có ở `core/config/mcp-whitelist.json`) —
   Program J có mở rộng cơ chế whitelist này, hay xây riêng? **Roadmap
   không đề cập** — cần anh quyết định trực tiếp, không suy ra được từ
   tài liệu hiện có.

**Đã trả lời (2026-07-24):** ~~`yana-ai chat` + Ollama local có thuộc
Scope Program J (M=5) hay Program/sub-goal riêng?~~ → Có, thuộc Program J,
M=5. Vẫn còn chặn Phase 3 Architecture cho riêng use case này (xem mục
Scope: cần Phase 3 chung của Program J xong trước, vì câu hỏi kiến trúc
gốc — MCP Server thay thế hay mở rộng translator-per-engine — chưa có
câu trả lời).
