# Implementation Plan — Yana Ecosystem Website

14 phase theo brief anh Tâm (2026-09-10). **Không code cho tới khi anh
duyệt Phase 0+1** — đúng `golden-principles.md` #9 (HARD-GATE: No Coding
Without Design) và đúng chỉ dẫn trực tiếp của anh: *"Then show me the
findings before beginning the full implementation."*

## Trạng thái từng phase

| Phase | Nội dung | Trạng thái | File |
|---|---|---|---|
| **0** | Repository/ecosystem audit | ✅ **Xong, 2 vòng** (2026-09-09 → 2026-09-10) | `ECOSYSTEM_AUDIT.md`, `YANA-DEEP-ARCHITECTURE.md`, `YANA-ECOSYSTEM-MAP.md`, `PRODUCT_TRUTH_MATRIX.md`, `SOURCE_OF_TRUTH_GRAPH.md` |
| **1** | Information architecture | ✅ **Xong, chờ anh duyệt** | `INFORMATION_ARCHITECTURE.md`, `ROUTE_MAP.md`, `CONTENT_STRATEGY.md` |
| **2** | Design tokens + components | 🟡 Proposal xong, **1 quyết định treo** (kích thước hero — framework đã có khuyến nghị) | `DESIGN_SYSTEM.md` |
| **3** | Global navigation/footer | ⚪ Chưa làm — phụ thuộc Phase 1 được duyệt | — |
| **4** | Homepage | ⚪ Chưa làm — **chặn bởi thiếu ảnh Studio thật** (Section 6) | — |
| **5** | Studio page | ⚪ Chưa làm — **chặn bởi thiếu ảnh Studio thật** | — |
| **6** | Runtime + Governance | ⚪ Chưa làm — có đủ dữ liệu thật để bắt đầu ngay khi được duyệt (không chặn bởi media) | — |
| **7** | Wheelbot + Integrations | ⚪ Chưa làm — Wheelbot **chặn bởi chưa audit repo riêng**; Integrations có thể làm claude-code/codex/cursor/antigravity trước | — |
| **8** | Story + Principles + Security | ⚪ Chưa làm — Story **chặn bởi anh chưa duyệt bản draft cuối** | — |
| **9** | Docs + Getting Started | ⚪ Chưa làm — phụ thuộc quyết định framework (Phase 2) | — |
| **10** | Download + Releases + Changelog | ⚪ Chưa làm — phụ thuộc quyết định route `/` vs `/studio/downloads` (`ROUTE_MAP.md` mục 1) | — |
| **11** | i18n | ⚪ Chưa làm — cơ chế cũ (`data-i18n`) tái dùng được, nhưng khối lượng dịch tăng nhiều theo số trang mới | — |
| **12** | Responsive/accessibility/performance | ⚪ Chưa làm — áp dụng cuối, theo từng trang khi build | — |
| **13** | Truth audit | ⚪ Chưa làm — checklist đã có sẵn trong `PRODUCT_TRUTH_MATRIX.md`, chạy lại trước khi công khai mỗi trang | — |
| **14** | Production verification | ⚪ Chưa làm | — |

## ✅ Đã quyết (2026-09-10)

- Download route canonical = `/download` (không phải `/studio/downloads`).
- Repo `Yana-AI-Chat_Teminal` = ACTIVE COMPONENT/EXPERIMENTAL (UI incubator,
  mock data) — không vào `/products`, có thể vào `/roadmap` nếu anh muốn.
- Framework = KEEP CURRENT static, ngoại lệ `/docs` (chờ anh xác nhận ngoại lệ).
- Continuity Engine = 0 code, chỉ nhắc ở `/roadmap` nếu anh muốn công khai.
- Yana OS quan hệ với Yana AI = CHA-CON (nền tảng bên dưới), không phải
  nhánh ngang hàng Studio — xác nhận bằng lời anh trong Program K Phase 0.

## Việc treo cần anh quyết trước khi qua Phase 2 (tổng hợp từ các file trên)

1. **`ROUTE_MAP.md`** — `docs/desktop.html` giữ (redirect) hay xoá?
2. **`ROUTE_MAP.md` mục Framework** — đồng ý ngoại lệ dùng doc-site
   generator riêng cho `/docs`, hay muốn 100% tự viết để nhất quán?
3. **`DESIGN_SYSTEM.md` mục 2** — kích thước hero: theo brief gốc
   (`clamp(4rem,8vw,8rem)`) hay giữ nhịp gần site hiện tại hơn (em đề xuất
   `clamp(3.5rem,7vw,6.5rem)`)?
4. **`MEDIA_INVENTORY.md`** — ảnh Studio thật (đã hỏi 2 lần, chưa nhận).
5. **`Yana-AI-Chat_Teminal`** — có muốn công khai hướng "Terminal thế hệ
   kế tiếp" trên `/roadmap`, hay giữ hoàn toàn kín cho tới khi nối
   `yana-rt` thật?
7. **`YANA-BUILD-JOURNEY-DRAFT.md`** — duyệt bản rút gọn cuối cho `/story`
   (sau khi sửa 2 lỗi PR đã tìm ra).

## Việc KHÔNG treo — có thể bắt đầu ngay khi Phase 1 được duyệt

Theo bảng trên: **Phase 6 (Runtime + Governance)** và phần
**Integrations (trừ MCP)** trong Phase 7 không bị chặn bởi câu hỏi nào ở
trên — dữ liệu đã đủ trong `PRODUCT_TRUTH_MATRIX.md` và
`docs/YANA-DEEP-ARCHITECTURE.md`. Đây là điểm bắt đầu hợp lý nhất nếu anh
muốn thấy 1 trang thật trước khi quyết toàn bộ IA.

## Cam kết theo đúng brief anh

> "Do not attempt the entire site as one giant generated commit."

Mỗi phase từ 3 trở đi = 1 (hoặc vài) commit riêng, review được độc lập —
không dồn thành 1 lần đổi toàn site.

> "The objective is not 'make Yana's website look modern.' The objective
> is: BUILD THE PUBLIC MAP OF THE YANA ECOSYSTEM."

Ghi lại ở đây để mọi phase sau đối chiếu lại mục tiêu này trước khi merge.
