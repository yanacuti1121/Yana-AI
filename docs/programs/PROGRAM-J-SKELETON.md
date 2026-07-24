# Program J — Universal Capability Runtime

**Status:** `Draft` — Phase 0 (Input) đầy đủ. Phase 1 (Specification) điền
được 3/4 Open Question ban đầu bằng cách đọc lại kỹ `docs/VISION-2.4.md`
(anh Tâm chỉ ra 2026-07-24: "cái này là ở trong roadmap 2.4 có") — không
phải nội dung mới, chỉ là đọc đúng cái đã có. Còn 1 câu hỏi thật sự mở
(Open Question 4, roadmap không đề cập).
**Nguồn:** anh Tâm's tóm tắt trực tiếp 2 video tham khảo (InsForge,
"Tại sao cần MCP trong khi đã có API?", 2026-07-23) + `docs/VISION-2.4.md`
(2026-07-24, cho 3 câu trả lời dưới đây).
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

## Capability List

Ghi chú tham khảo từ `VISION-2.4.md` mục 2 (bản gộp, cần rà lại từng mục
khi vào Phase 2 thật sự): Universal AI Platform, Prompt Translation
Engine, Capability Engine (Registry + Dynamic Discovery), Model Router,
AI Marketplace, Extension SDK — Marketplace/SDK là **lớp phân phối**,
không phải capability riêng (theo chính roadmap).

_(Phase 2 đầy đủ — Name/Purpose/Input/Output/Dependency/Priority/Owner/
Status cho từng capability — chưa làm, đây mới là ghi chú tham khảo)_

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

## Open Questions

Còn lại 1/4 câu hỏi ban đầu (3 câu kia đã trả lời được từ
`VISION-2.4.md`, xem Architecture/Scope/Non Goals ở trên):

1. Quan hệ với `44-supply-chain-vetting.md`/`agent-tool-poisoning-guard.md`
   (MCP server whitelist đã có ở `core/config/mcp-whitelist.json`) —
   Program J có mở rộng cơ chế whitelist này, hay xây riêng? **Roadmap
   không đề cập** — cần anh quyết định trực tiếp, không suy ra được từ
   tài liệu hiện có.
