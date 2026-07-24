# Program D — Engineering Excellence

**Status:** `Draft` — nội dung §D7 (2026-07-23) và §D8 (2026-07-24) đều
thật, do anh Tâm cung cấp trực tiếp (không phải AI suy diễn). Các mục
D1-D6 chưa được xác định — nếu Program D có thêm nội dung khác, cần bổ
sung ở đây khi có, không đoán trước.

## Vision

Chưa xác định đầy đủ ngoài D7. Ý tưởng nền: các quy tắc kỷ luật kỹ thuật
(engineering discipline) mà Yana AI tự áp dụng cho chính quá trình phát
triển của nó, khác với các Program khác (H, J) vốn là capability hướng
người dùng.

## D7. Specification-first Development

Quy tắc, áp dụng cho MỌI Program mới (bao gồm chính D):

```
Idea
    ↓
Specification
    ↓
ADR
    ↓
Readiness
    ↓
Implementation
```

**Nếu thiếu Specification: Implementation = BLOCKED.** Không có ngoại lệ
cho "AI có vẻ suy luận được nội dung hợp lý từ ngữ cảnh" — suy luận không
phải specification.

### Áp dụng sống lần đầu — 2026-07-23

Đây chính là quy tắc vừa được áp dụng thật cho Wave 2 (Program H và
Program J) hôm nay: cả hai bị chặn ở bước Specification, chưa được viết
ADR hay code, dù đã có tên và một phần ngữ cảnh (2 video tham khảo).
Backlog skeleton (`docs/programs/PROGRAM-H-SKELETON.md`,
`PROGRAM-J-SKELETON.md`) là bước chuẩn bị hợp lệ duy nhất được phép ở
trạng thái `Specification Required` — không phải một cách lách luật để
"vẫn làm được gì đó" trong lúc thiếu spec.

## D8. Architecture Development Standard (ADS v1)

Nội dung thật, do anh Tâm tổng hợp 2026-07-24 sau ~2 ngày nghiên cứu.
Xem toàn văn ở `docs/programs/ADS-v1.md`. Đây là bản **operationalize**
đầy đủ của D7: 5 bước triết lý (`Idea → Specification → ADR → Readiness
→ Implementation`) được tách thành 16 phase cụ thể (Phase 0-15), có
template Specification 19 trường (thay cho 9 mục cũ), Readiness Matrix
10 mục (thay cho 5 mục cũ), Decision Workflow 6 bước, và hướng dẫn dùng
cho bất kỳ AI nào (Claude/Codex/Cursor/Gemini) để ra kết quả nhất quán.

**Từ 2026-07-24, ADS v1 là quy trình bắt buộc cho MỌI Program mới** —
thay cho skeleton 9-mục đơn giản đã dùng cho D/F/H/J trước đó. Các
skeleton cũ được nâng cấp dần sang template ADS v1 khi có nội dung mới
để điền (xem `PROGRAM-J-SKELETON.md` — Program đầu tiên áp dụng).

## Quan hệ với các rule hiện có

`golden-principles.md` #9 (HARD-GATE: No Coding Without Design) đã yêu cầu
`/plan` trước khi code cho thay đổi kiến trúc — D7 mở rộng nguyên tắc đó
thêm một bước TRƯỚC cả `/plan`/ADR: nếu chưa có Specification thành văn,
thậm chí ADR cũng chưa được viết, chứ không chỉ code.

## Open Questions

- D1-D6 là gì? Chưa xác định — nếu Program D có ý định trở thành một bộ
  nguyên tắc đầy đủ (không chỉ D7), cần anh Tâm xác nhận phạm vi.
- Program D áp dụng hồi tố cho các Program đã tồn tại (ví dụ ADR-008, vốn
  được viết mà không qua bước "Specification" chính thức, chỉ qua RFC)
  hay chỉ áp dụng từ nay trở đi?
