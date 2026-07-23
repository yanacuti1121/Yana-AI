# Program Architecture Backlog

> Tạo 2026-07-23, theo chỉ đạo trực tiếp của anh Tâm sau khi Wave 2 (Program
> H/J implementation) bị chặn vì thiếu specification gốc. Đây KHÔNG phải
> Wave 2 implementation — đây là bước chuẩn bị cấu trúc để phiên sau điền
> nội dung thật từ đặc tả gốc (video tham khảo / conversation gốc), theo
> đúng nguyên tắc Program D §D7 dưới đây.
>
> **AI không tự suy diễn nội dung Program nào trong thư mục này.** Mọi mục
> `_(TODO)_` trong các file skeleton phải được điền bởi anh Tâm hoặc từ một
> nguồn đặc tả đã xác minh, không phải AI đoán cho xong.

## Nguyên tắc nền: Program D §D7 — Specification-first Development

Xem `PROGRAM-D-ENGINEERING-EXCELLENCE.md` cho nội dung đầy đủ. Tóm tắt:

```
Idea → Specification → ADR → Readiness → Implementation
```

Thiếu Specification ở bất kỳ Program nào → **Implementation = BLOCKED** cho
Program đó, không có ngoại lệ, kể cả khi AI "có vẻ" suy ra được nội dung
hợp lý từ ngữ cảnh xung quanh.

## Trạng thái vocabulary (mới, bổ sung 2026-07-23)

Roadmap trước đây (`ROADMAP.md`) chỉ có phase-level markers (done/planned).
Bổ sung 4 trạng thái Program-level, xếp theo thứ tự của pipeline Program D
ở trên — mỗi trạng thái tương ứng với Program đang ở bước nào trong chuỗi
Idea → Specification → ADR → Readiness → Implementation:

| Trạng thái | Ý nghĩa | Được phép làm gì |
|---|---|---|
| `Draft` | Có ý tưởng (Idea), chưa có specification đầy đủ | Thảo luận, phác thảo |
| `Specification Required` | Ý tưởng đã có tên/khung, nhưng nội dung chi tiết (vision, capability list, architecture...) chưa được viết ra ở đâu có thể xác minh | Chỉ chuẩn bị skeleton (file này) — KHÔNG code, KHÔNG viết ADR |
| `Architecture Review` | Specification đã đầy đủ, đang review (per `54-bft-consensus-law.md` nếu chạm infra) | ADR có thể viết, chưa implement |
| `Ready for Implementation` | Readiness Assessment ≥ 80% theo 5 tiêu chí VISION-2.4.md (Repository/Memory/Runtime/Governance/Cost) | Code được phép bắt đầu |

(Ngoài 4 trạng thái Program-level này, `ROADMAP.md`'s phase markers —
Planned/done — vẫn giữ nguyên cho các mục nhỏ hơn phase; không thay thế.)

## Bảng trạng thái Program hiện tại

| Program | Tên | Trạng thái | File |
|---|---|---|---|
| D | Engineering Excellence | `Draft` — chỉ §D7 có nội dung thật, các mục khác (D1-D6?) chưa xác định | `PROGRAM-D-ENGINEERING-EXCELLENCE.md` |
| F | (cost-aware refusal — "không đủ specification để tiếp tục") | `Specification Required` — tên và ý tưởng đến từ chỉ đạo hôm nay, chưa có nội dung đầy đủ | `PROGRAM-F-SKELETON.md` |
| H | Autonomous Safety & Execution Assurance | `Specification Required` | `PROGRAM-H-SKELETON.md` |
| J | Universal Capability Runtime | `Specification Required` | `PROGRAM-J-SKELETON.md` |

Program G, I và các Program khác được nhắc trong `docs/VISION-2.4.md` hoặc
trong hội thoại trước đó nhưng chưa có file riêng — thêm khi có nhu cầu cụ
thể, không tạo trước.

## Liên quan

- `docs/VISION-2.4.md` — tầm nhìn dài hạn, nơi Program H/J lần đầu được đặt tên
- `docs/PLATFORM-READINESS-WAVE0.md` — audit Wave 0, mục 2 tham chiếu Program J
- `docs/adr/` — nơi ADR của từng Program sẽ được viết khi lên `Architecture Review`
