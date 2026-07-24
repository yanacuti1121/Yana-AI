# Program J — Universal Capability Runtime

**Status:** `Draft` — Phase 0 (Input) đầy đủ, có nguồn thật. Phase 1
(Specification) điền được 5/19 trường từ nguồn có sẵn; 14 trường còn lại
phụ thuộc 4 Open Question chưa được anh Tâm trả lời (xem cuối file) —
theo ADS v1 (`docs/programs/ADS-v1.md`), không được tự suy diễn để điền
cho đủ.
**Nguồn:** anh Tâm's tóm tắt trực tiếp 2 video tham khảo (InsForge,
"Tại sao cần MCP trong khi đã có API?"), nhận 2026-07-23.
**Template:** ADS v1 Phase 1 (19 trường) — nâng cấp từ skeleton 9-mục cũ.

> Ranh giới rõ: mục nào ghi **"Nguồn gốc"** là nguyên văn/paraphrase sát
> từ 2 video, KHÔNG sửa ý. Mục nào ghi **"Chưa quyết — cần anh"** là phần
> ADS v1 yêu cầu nhưng chưa có câu trả lời, KHÔNG phải AI tự điền.

---

## Program Name

Program J — Universal Capability Runtime

## Vision

Nguồn gốc (video 2 — MCP vs API): thay hạ tầng kết nối Agent↔Dịch vụ từ
mô hình **M×N** (mỗi Agent tự hardcode kết nối tới mỗi dịch vụ, build-time,
cần sửa code+build+deploy lại khi thêm dịch vụ/agent mới) sang mô hình
**M+N** qua một giao thức trung gian chuẩn hoá (MCP) — Agent (MCP Client)
và Dịch vụ (MCP Server) tách rời hoàn toàn, agent tự khám phá công cụ lúc
runtime thay vì hardcode.

Nguồn gốc (video 1 — InsForge): mở rộng nguyên tắc đó xuống tận hạ tầng
backend — database, auth/OAuth, file storage, cloud infra chuẩn hoá
thành "tool" mà agent tự kết nối và dùng được.

## Motivation

Nguồn gốc: 2 video cụ thể.
- **Video 1 — InsForge**: công cụ mã nguồn mở (Apache 2.0) tự động hoá
  triển khai backend (DB, auth/OAuth, file storage, cloud infra) thành
  tool chuẩn hoá cho agent — mục tiêu "ship faster", agent chạy full-stack.
- **Video 2 — "Tại sao cần MCP trong khi đã có API?"**: MCP (Anthropic
  công bố cuối 2024) là giao thức mở, lớp trung gian chuẩn hoá giữa Model
  và API/Dịch vụ.

## Problem

Nguồn gốc: 2 vấn đề cụ thể được nêu trong video 2.
1. **Bùng nổ độ phức tạp M×N** — ví dụ trong video: 3 agent × 4 dịch vụ =
   12 kết nối phải bảo trì tay; thêm 1 agent → 16. API đổi version/xoay
   token → sửa code ở hàng loạt vị trí.
2. **Đóng cứng lúc build-time** — công cụ hardcode trong mã nguồn, agent
   đang chạy không tự nhận biết/kết nối thêm công cụ mới được nếu không
   sửa code, build, deploy lại.

## Goals

Nguồn gốc (suy ra trực tiếp từ 2 video):
- Tách rời Agent và Dịch vụ (Client/Server), không hardcode kết nối.
- Dynamic discovery lúc runtime — agent tự hỏi "có công cụ gì" thay vì
  if/else cứng theo provider.
- Giảm số kết nối cần bảo trì từ M×N xuống M+N.
- Chuẩn hoá cả tầng hạ tầng backend (DB/auth/storage), không chỉ tầng
  API nghiệp vụ.

## Non Goals

**Chưa quyết — cần anh (Open Question 3):** InsForge tự động hoá cả hạ
tầng backend — Yana AI có ý định tự triển khai một lớp provisioning
tương tự (Non-Goal nếu KHÔNG), hay chỉ áp dụng nguyên tắc M+N/dynamic-
discovery cho lớp adapter AI đã có sẵn (Non-Goal ngược lại)? Không thể
viết Non Goals chính xác trước khi câu hỏi này được trả lời.

## Scope

**Chưa quyết — cần anh (Open Question 2):** phụ thuộc "N dịch vụ" cụ thể
nào Yana AI thật sự cần chuẩn hoá — `core/adapters/` (Claude/Cursor/
Gemini/Codex) hay một tầng khác (GitHub/Linear/Slack kiểu InsForge).

## Architecture

_(TODO — phụ thuộc Open Question 1: MCP Client / Server / cả hai)_

## Modules

_(TODO — phụ thuộc Architecture)_

## Interfaces

_(TODO — phụ thuộc Architecture)_

## Workflow

_(TODO — phụ thuộc Architecture)_

## Data Flow

_(TODO — phụ thuộc Architecture)_

## Capability List

Nguồn gốc: không có danh sách capability chi tiết trong 2 video (chúng
giải thích rationale/vấn đề-giải pháp, không phải spec kỹ thuật).

Ghi chú tham khảo từ `docs/VISION-2.4.md` mục 2 (bản gộp, cần xác nhận
lại từng mục có thật sự thuộc Program J hay không): Universal AI
Platform, Prompt Translation Engine, Capability Engine (Registry +
Dynamic Discovery — khớp trực tiếp "dynamic discovery" trong video 2),
Model Router, AI Marketplace, Extension SDK.

## Dependencies

_(TODO — cần Architecture trước; ghi chú thật đã biết: `core/config/
mcp-whitelist.json` đã tồn tại, xem Open Question 4)_

## Deliverables

_(TODO — theo ADS v1's Output cuối cùng: PROGRAM_J.md hoàn chỉnh, ADR,
Architecture Diagram, Capability Matrix, Workflow Diagram, Implementation
Roadmap, Readiness Report, Risk Register, Benchmark Plan, Documentation
Plan — chưa cái nào có, đúng vì còn ở Phase 0-1)_

## Definition of Done

_(TODO — không viết được trước khi có Architecture + Capability List đầy đủ)_

## Risks

Nguồn gốc, suy ra trực tiếp (không phải TODO): Governance risk — MCP mở
rộng bề mặt tấn công (dynamic tool discovery từ nguồn ngoài lúc runtime)
— cần đối chiếu với `agent-tool-poisoning-guard.md`,
`core/config/mcp-whitelist.json` đã có sẵn (xem Open Question 4).

## ADR

_(TODO — chưa tới Phase 6, đang ở Phase 1)_

## Roadmap

_(TODO — chưa tới Phase 9 Implementation Plan)_

---

## Readiness Matrix (Phase 5 — ADS v1, chưa đánh giá vì chưa qua Phase 1-4)

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

## Open Questions (chặn Phase 1 hoàn tất)

1. Yana AI đóng vai **MCP Client** (tiêu thụ MCP server có sẵn từ bên
   ngoài), **MCP Server** (expose capability của chính mình cho AI khác
   dùng), hay cả hai? Quyết định này định hình toàn bộ Architecture.
2. "N dịch vụ" cụ thể nào Yana AI thật sự cần chuẩn hoá — có phải chính
   `core/adapters/` (Claude/Cursor/Gemini/Codex) không, hay là một tầng
   khác (ví dụ GitHub/Linear/Slack như InsForge làm với DB/auth/storage)?
3. InsForge tự động hoá hạ tầng backend (DB/auth/storage) — Yana AI có ý
   định tự triển khai một lớp provisioning tương tự, hay chỉ áp dụng
   nguyên tắc M+N/dynamic-discovery cho lớp adapter AI đã có sẵn?
4. Quan hệ với `44-supply-chain-vetting.md`/`agent-tool-poisoning-guard.md`
   (MCP server whitelist đã có ở `core/config/mcp-whitelist.json`) — Program
   J có mở rộng cơ chế whitelist này, hay xây riêng?
