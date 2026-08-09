# Program Architecture Backlog

> Tạo 2026-07-23, theo chỉ đạo trực tiếp của anh Tâm sau khi Wave 2 (Program
> H/J implementation) bị chặn vì thiếu specification gốc. Nâng cấp 2026-07-24
> lên quy trình đầy đủ **ADS v1** (xem `ADS-v1.md`) sau ~2 ngày anh Tâm
> nghiên cứu — thay cho skeleton 9-mục đơn giản ban đầu.
>
> **AI không tự suy diễn nội dung Program nào trong thư mục này.** Mọi mục
> `_(TODO)_`/`Specification Required` phải được điền bởi anh Tâm hoặc từ một
> nguồn đặc tả đã xác minh, không phải AI đoán cho xong.

## Quy trình chuẩn: ADS v1 (từ 2026-07-24)

Xem `ADS-v1.md` cho toàn văn 16 phase. Đây là bản operationalize đầy đủ
của Program D §D7 (`PROGRAM-D-ENGINEERING-EXCELLENCE.md`) — cùng triết
lý gốc (`Idea → Specification → ADR → Readiness → Implementation`),
tách thành quy trình cụ thể có template, checklist, tiêu chí đo được:

```
Phase 0  INPUT (Vision, Problem, Goals, Motivation)
Phase 1  SPECIFICATION (19-field template — không code)
Phase 2  CAPABILITY INVENTORY
Phase 3  ARCHITECTURE (sơ đồ, không code)
Phase 4  WORKFLOW (pipeline, không code)
Phase 5  READINESS (Readiness Matrix 10 mục — <80% = Block)
Phase 6  ADR
Phase 7  RESEARCH (không code)
Phase 8  DESIGN REVIEW
Phase 9  IMPLEMENTATION PLAN
Phase 10 IMPLEMENTATION (mới được code)
Phase 11 REVIEW
Phase 12 BENCHMARK
Phase 13 EVALUATION
Phase 14 DOCUMENTATION
Phase 15 CONTINUOUS IMPROVEMENT
```

Thiếu Specification (Phase 1) → **Implementation = BLOCKED**, không có
ngoại lệ, kể cả khi AI "có vẻ" suy ra được nội dung hợp lý từ ngữ cảnh.

## Trạng thái vocabulary

4 trạng thái Program-level, ánh xạ lên các cụm phase của ADS v1:

| Trạng thái | Tương ứng ADS v1 | Được phép làm gì |
|---|---|---|
| `Draft` | Phase 0 (Input) xong, Phase 1 (Specification) chưa đầy đủ | Thảo luận, phác thảo |
| `Specification Required` | Chưa qua được Phase 0 — thiếu Vision/Problem/Goals/Motivation nguồn thật | Chỉ chuẩn bị skeleton — KHÔNG code, KHÔNG viết ADR |
| `Architecture Review` | Phase 1-4 xong (Spec + Capability + Architecture + Workflow), đang Phase 8 Design Review | ADR có thể viết (Phase 6), chưa implement |
| `Ready for Implementation` | Phase 5 Readiness ≥ 80% theo Readiness Matrix (10 mục) | Phase 10 — code được phép bắt đầu |

(Ngoài 4 trạng thái Program-level này, `ROADMAP.md`'s phase markers —
Planned/done — vẫn giữ nguyên cho các mục nhỏ hơn phase; không thay thế.)

## Bảng trạng thái Program hiện tại

| Program | Tên | Trạng thái | File |
|---|---|---|---|
| D | Engineering Excellence | `Draft` — §D7 + §D8 (ADS v1) có nội dung thật, D1-D6 chưa xác định | `PROGRAM-D-ENGINEERING-EXCELLENCE.md` |
| F | (cost-aware refusal — "không đủ specification để tiếp tục") | `Specification Required` | `PROGRAM-F-SKELETON.md` |
| H | Autonomous Safety & Execution Assurance | `Specification Required` | `PROGRAM-H-SKELETON.md` |
| J | Universal Capability Runtime | `Draft` — Phase 0-9 xong. MCP Server (`yana-rt mcp`, SDK `rmcp` `2.2.0`) thay translator-per-engine cho cả 5 client. **Spike Prototype thật đã chạy 2026-07-25** (anh Tâm cho phép vượt cổng Readiness): latency đo thật p50 0.134ms (nhanh ~1500x so với baseline cũ 220ms), 3 case đúng, 183/183 test pass. **Phase 5 Readiness: 70% → 85%** (vượt ngưỡng 80% ADS v1, nhưng chỉ từ 1 spike nhỏ — anh Tâm quyết định có mở khoá Phase 10 chính thức không). ADR: `docs/adr/ADR-010-mcp-server-replaces-translator-per-engine.md` | `PROGRAM-J-SKELETON.md` |
| K | Yana OS (tên/chữ cái tạm, chưa xác nhận) — AI Agent Operating System: local-first execution + governance platform quản lý agent lifecycle/identity/capabilities/sessions/policies/sandboxing/memory/scheduling/observability, xây trên nền `yana-rt` (không thay thế). Lấy cảm hứng kiến trúc từ `cloudflare-os`, không phụ thuộc hạ tầng Cloudflare | `Draft` — Phase 0 xong (2026-08-09). Anh Tâm ban đầu khoá scope (Phase 0 chỉ định kiến trúc, không code), sau đó **tự tay huỷ khoá đó** cùng ngày ("Có, anh muốn huỷ scope lock, code ngay") sau khi được hỏi lại xác nhận. Kết quả: một slice implementation đọc-only đã tồn tại ở `src/os/` (`yana-rt os agent-list / credential-status / resource-status`) — bỏ qua Phase 1-9, KHÔNG phải Specification/Architecture/ADR thật cho 3 khu vực quản lý. Xem "Implementation" trong file skeleton | `PROGRAM-K-YANA-OS-SKELETON.md` |

Program G, I và các Program khác được nhắc trong `docs/VISION-2.4.md` hoặc
trong hội thoại trước đó nhưng chưa có file riêng — thêm khi có nhu cầu cụ
thể, không tạo trước.

## Liên quan

- `ADS-v1.md` — quy trình chuẩn đầy đủ (16 phase), bắt buộc từ 2026-07-24
- `PROGRAM-D-ENGINEERING-EXCELLENCE.md` — §D7 (triết lý gốc) + §D8 (ADS v1)
- `docs/VISION-2.4.md` — tầm nhìn dài hạn, nơi Program H/J lần đầu được đặt tên
- `docs/PLATFORM-READINESS-WAVE0.md` — audit Wave 0, mục 2 tham chiếu Program J
- `docs/adr/` — nơi ADR của từng Program sẽ được viết khi lên `Architecture Review`
