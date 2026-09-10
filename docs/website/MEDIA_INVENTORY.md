# Media Inventory

Kiểm trực tiếp bằng `find`/`ls` (2026-09-10), không suy đoán có gì.

## Có sẵn, dùng được ngay

| Asset | Vị trí | Dùng cho |
|---|---|---|
| `yana-logo.png`, `logo.svg` | `docs/` | Logo mọi trang |
| `yana-banner-light.svg`, `yana-banner-dark.svg` | `docs/` | README banner — tái dùng cho hero nếu hợp |
| `demo.gif` | `docs/assets/` | CLI demo thật — `/runtime` hoặc `/developers/quickstart` |
| `demo.cast` + `demo.sh` + asciinema player | `docs/`, `docs/assets/` | Terminal demo tương tác thật — mạnh hơn ảnh tĩnh, đúng tinh thần "real product media" |

## KHÔNG phải asset website — cần dọn trước khi build

| File | Vấn đề |
|---|---|
| 7 file `docs/Ảnh màn hình 2026-09-09 lúc *.png` | Ảnh chụp trang OpenAI Codex anh gửi làm tài liệu tham khảo thiết kế — nằm nhầm trong `docs/` (thư mục web thật). Cần di chuyển ra khỏi `docs/` (ví dụ vào scratchpad hoặc xoá sau khi dùng xong) trước khi build, không để lẫn vào asset thật. |
| `docs/844493675462692.jpeg` | Không rõ nguồn gốc/nội dung — cần anh xác nhận trước khi quyết giữ hay bỏ |

## CHƯA CÓ — chặn các trang tương ứng

| Thiếu | Chặn trang | Đã hỏi anh chưa |
|---|---|---|
| Ảnh chụp Yana Studio thật (chạy app thật, không phải mockup CSS) | `/studio`, hero ecosystem (Section 6 brief) | Đã hỏi 2 lần trong phiên trước ("anh gửi lại giúp em ảnh chụp Yana Studio đang chạy thật"), **chưa nhận được** |
| Ảnh/render Yana Wheelbot (board, chassis, ToF sensor, TFT face) | `/wheelbot` | Chưa hỏi — cần hỏi khi bắt đầu audit repo `yana-wheelbot` riêng |
| Screenshot Terminal/Desktop app mới nhất (nếu khác bản mockup CSS hiện có) | `/runtime`, `/integrations` | Chưa hỏi |
| Social preview image chuẩn 1200×630 | mọi trang (`og:image`) | `docs/index.html` hiện dùng tạm `yana-logo.png` 240×240 — README từng tự nhận "not a purpose-built social card" |

## Nguyên tắc bắt buộc (theo brief anh)

> "Do not create fake UI screenshots if current real screenshots exist."
> "If photos/renderings exist, use them. Do not fake completed hardware if
> only CAD/prototype material exists."

Mockup CSS hand-built hiện tại trong `docs/index.html` (hero screenshot-
wrap) là **tạm**, không phải "fake" theo nghĩa xấu (không giả vờ là ảnh
chụp thật, tự nhận là mockup) — nhưng khi có ảnh Studio thật, ưu tiên thay
bằng ảnh thật ngay, đúng yêu cầu anh đã nói từ trước ("Đổi ngay — chụp ảnh
Yana Studio thật để thay vào").
