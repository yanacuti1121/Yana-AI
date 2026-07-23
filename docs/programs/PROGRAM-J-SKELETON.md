# Program J — Universal Capability Runtime

**Status:** Draft — real source content received 2026-07-23 (anh Tâm's
own summary of the two reference videos), transcribed faithfully below.
Not yet a complete Specification: Architecture, full Capability List,
and several Open Questions still need anh's decisions before this can
move to Architecture Review per Program D §D7.
**Created:** 2026-07-23

> Sections below are split into **nguồn gốc (nguồn thật, không sửa ý)**
> and **áp dụng cho Yana AI (chưa quyết, cần anh)** — giữ ranh giới rõ để
> không lẫn giữa "video nói gì" và "Yana AI nên làm gì", đúng tinh thần
> D7 (không tự suy diễn phần thứ hai).

## Vision

Nguồn gốc (video 2 — MCP vs API): thay hạ tầng kết nối Agent↔Dịch vụ từ
mô hình **M×N** (mỗi Agent tự hardcode kết nối tới mỗi dịch vụ, build-time,
cần sửa code+build+deploy lại khi thêm dịch vụ/agent mới) sang mô hình
**M+N** qua một giao thức trung gian chuẩn hoá (MCP) — Agent (MCP Client)
và Dịch vụ (MCP Server) tách rời hoàn toàn, agent tự khám phá công cụ lúc
runtime ("Anh có những công cụ gì?") thay vì hardcode.

Nguồn gốc (video 1 — InsForge): mở rộng nguyên tắc đó xuống tận hạ tầng
backend — database, auth/OAuth, file storage, cloud infra được chuẩn hoá
thành "tool" mà agent tự kết nối và dùng được, thay vì kỹ sư phải cấu
hình tay từng phần.

## Problem Statement

Nguồn gốc: 2 vấn đề cụ thể được nêu.
1. **Bùng nổ độ phức tạp M×N** — ví dụ cụ thể trong video: 3 agent × 4
   dịch vụ = 12 kết nối phải bảo trì tay; thêm 1 agent → 16. Một API đổi
   version hay xoay token → phải sửa code ở hàng loạt vị trí.
2. **Đóng cứng lúc build-time** — công cụ hardcode trong mã nguồn, agent
   đang chạy không tự nhận biết/kết nối thêm công cụ mới được nếu không
   sửa code, build, deploy lại.

Áp dụng cho Yana AI (chưa quyết, cần anh xác nhận): VISION-2.4.md's mục
2 (gộp "universal abstraction") đã liệt Model Router, adapter Claude/
Cursor/Gemini/Codex là các mảnh liên quan trong roadmap gốc — nhưng chưa
xác nhận liệu Yana AI HIỆN TẠI có đang gặp đúng vấn đề M×N này không (ví
dụ: `core/adapters/` hiện đang hardcode theo từng AI provider như thế
nào, có bao nhiêu "N dịch vụ" thật sự đang cần tích hợp) — cần audit thực
tế trước khi khẳng định MCP là giải pháp đúng cho Yana AI, không chỉ vì
nó đúng cho InsForge/case chung.

## Design Goals

Nguồn gốc (suy ra trực tiếp từ 2 video, không thêm):
- Tách rời Agent và Dịch vụ (Client/Server), không hardcode kết nối.
- Dynamic discovery lúc runtime — agent tự hỏi "có công cụ gì" thay vì
  if/else cứng theo provider.
- Giảm số kết nối cần bảo trì từ M×N xuống M+N.
- Chuẩn hoá cả tầng hạ tầng backend (DB/auth/storage), không chỉ tầng
  API nghiệp vụ.

## Non-Goals

_(TODO — chưa được nói tới trong nguồn, cần anh xác nhận: Yana AI có tự
implement MCP server cho các dịch vụ nội bộ của mình không, hay chỉ đóng
vai MCP Client tiêu thụ MCP server có sẵn? Đây là quyết định phạm vi lớn,
ảnh hưởng toàn bộ Architecture bên dưới.)_

## Capability List

Nguồn gốc: không có danh sách capability chi tiết trong 2 video (chúng
giải thích RATIONALE/vấn đề-giải pháp, không phải spec kỹ thuật).

Ghi chú tham khảo từ VISION-2.4.md's mục 2 (bản gộp, không phải spec gốc
— cần xác nhận lại từng mục có thật sự thuộc Program J hay không):
Universal AI Platform, Prompt Translation Engine, Capability Engine
(Registry + Dynamic Discovery — khớp trực tiếp với "dynamic discovery"
trong video 2), Model Router, AI Marketplace, Extension SDK.

## Architecture

_(TODO — chưa quyết. Câu hỏi kiến trúc cụ thể ở mục Open Questions bên
dưới cần trả lời trước khi phần này viết được.)_

## ADR References

_(TODO — chưa viết ADR, đang ở Draft không phải Architecture Review)_

## Readiness Checklist

Theo `docs/VISION-2.4.md`'s "Readiness Assessment" — Readiness < 80% →
chỉ Research/ADR/Design, không được code.

- [ ] Repository Readiness — chưa audit `core/adapters/` hiện tại để biết
      mức độ hardcode thật sự (xem Problem Statement)
- [ ] Memory Readiness
- [ ] Runtime Readiness
- [ ] Governance Readiness — MCP đưa thêm bề mặt tấn công (dynamic tool
      discovery từ nguồn ngoài) — cần đối chiếu với
      `agent-tool-poisoning-guard.md`, `mcp-whitelist.json` đã có
- [ ] Cost Readiness

## Open Questions

Từ nguồn gốc (chưa trả lời trong 2 video):
1. Yana AI đóng vai **MCP Client** (tiêu thụ MCP server có sẵn từ bên
   ngoài), **MCP Server** (expose capability của chính mình cho AI khác
   dùng), hay cả hai? Quyết định này định hình toàn bộ Architecture.
2. "N dịch vụ" cụ thể nào Yana AI thật sự cần chuẩn hoá — có phải chính
   `core/adapters/` (Claude/Cursor/Gemini/Codex) không, hay là một tầng
   khác (ví dụ kết nối tới GitHub/Linear/Slack như InsForge làm với DB/
   auth/storage)?
3. InsForge tự động hoá hạ tầng backend (DB/auth/storage) — Yana AI có ý
   định tự triển khai một lớp provisioning tương tự, hay chỉ áp dụng
   nguyên tắc M+N/dynamic-discovery cho lớp adapter AI đã có sẵn?
4. Quan hệ với `44-supply-chain-vetting.md`/`agent-tool-poisoning-guard.md`
   (MCP server whitelist đã có ở `core/config/mcp-whitelist.json`) — Program
   J có mở rộng cơ chế whitelist này, hay xây riêng?
