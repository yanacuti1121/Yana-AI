# Ghi chú thiết kế: thanh soạn, chọn mô hình và mức suy luận của Hermes Agent

Đây là ghi chú về **cách họ thiết kế**, viết bằng lời của chúng ta. Không có đoạn mã nào được chép vào repo này.

| Mục | Giá trị |
|---|---|
| Nguồn | https://github.com/NousResearch/hermes-agent |
| Giấy phép | MIT (kiểm bằng GitHub API, 2026-10-31) |
| Commit đã đọc | `c841bfcd0ad2ca5535589ce1cbcb06d7ac25c7cc` |
| Cách đọc | Qua API của GitHub (nội dung thô và danh sách file), không clone, không chạy mã, không cài gói. Không dùng công cụ dịch ngược `rea` vì mã nguồn mở và công khai |
| Đã đọc | `apps/desktop/src/app/chat/composer/reasoning-pill.tsx`, `apps/desktop/src/lib/reasoning-effort.ts`, `apps/desktop/src/app/shell/reasoning-menu-panel.tsx`, `apps/desktop/src/lib/guarded-model-switch.ts`, `agent/reasoning_effort.py` (120 dòng đầu), danh sách toàn bộ file |
| Chưa đọc | `model-picker.tsx` (868 dòng, đã tải nhưng chưa đọc), `chat-bar-parts.tsx`, `attachments.tsx`, `drop-affordance.ts`, `completion-drawer.tsx`, `busy-submit-state.ts`, `discard-lost-prompt.ts`, `use-model-menu-controller`, giao diện thật (chưa chạy app, chưa xem ảnh chụp) |

Về `Hermes.app` đã cài trên máy: đó chỉ là bộ cài nhỏ (`Hermes-Setup`, bản 0.0.1, bundle id `com.nousresearch.hermes.setup`, bên trong chỉ có icon). Phần chạy thật là lệnh `hermes` và app desktop trong kho `apps/desktop`. Không đọc `~/.hermes` (có tệp xác thực).

Muốn dùng lại mã của họ thì phải làm bước riêng: giữ nguyên thông báo bản quyền, kèm LICENSE, ghi chỗ đã sửa, thêm vào `ACKNOWLEDGEMENTS.md`. Tên, logo và hình ảnh không dùng.

## 1. Thang mức suy luận

- Thang nội bộ của họ, từ thấp lên cao: tắt, tối thiểu, thấp, vừa, cao, rất cao, tối đa, và "ultra".
- **"Ultra" chỉ là bậc nội bộ của Hermes.** Không nhà cung cấp nào nhận nó: mọi tuyến đều bị ép về mức mạnh nhất tuyến đó có (thường là "tối đa").
- Thang rộng hơn bất cứ nhà cung cấp nào chấp nhận. Mỗi nhà cung cấp, thậm chí từng đời mô hình, có **tập mức riêng được khai báo** (ví dụ có mô hình không cho tắt, có mô hình không có mức "tối thiểu", có mô hình chỉ có ba mức thấp, cao, tối đa).
- Quy tắc ép mức: nếu mức được chọn nằm trong tập thì gửi nguyên; nếu không thì **hạ về mức yếu hơn gần nhất**; chỉ khi không còn mức yếu hơn mới lấy mức yếu nhất được phép.
- **Không bao giờ tự bịa mức.** Chưa đặt thì để trống; không điền mặc định ngầm. Họ ghi bài học: bảng ánh xạ viết tay cho từng đường truyền từng làm lộ mức mới ra cho đường truyền không hỗ trợ (bị từ chối) và còn từng đảo ngược thang (mức lạ rơi về mặc định yếu).
- Khi một nhà cung cấp từ chối một mức, họ **sửa tập mức đã khai báo**, không sửa điều kiện kiểm tra.

## 2. Viên chọn mức suy luận trên thanh soạn

- Một **viên nhỏ riêng** cạnh viên chọn mô hình, hiện mức hiện tại bằng nhãn ngắn (Off, Min, Low, Med, High, XHigh, Max, Ultra).
- Bấm mở **cùng các hàng** mà danh mục mô hình có cho từng mô hình (Thinking, Fast, Effort), nên không phải tìm hàng của mô hình rồi rê vào menu con.
- **Ẩn hẳn** khi danh mục nói mô hình đó không có điều khiển suy luận, hoặc khi chưa có menu sống (cổng đóng).
- **Trung thực về việc ép mức:** nếu mức chọn bị ép khi gửi, viên hiện cả hai đầu ("Ultra→Max"), còn chú giải ghi rõ "gửi ở mức Max trên tuyến này". Giao diện không bao giờ trình bày một bậc nội bộ như thể nó là mức thật của tuyến. Mức thật gửi đi do cổng báo về, không đoán phía giao diện.
- **Trạng thái chờ:** khi phiên chưa báo mức của nó, viên hiện một dấu tải nhỏ thay vì hiện mặc định được đoán (từng gây lỗi hiển thị sai).
- Một viên và danh mục dùng **cùng một bộ điều khiển**: sửa ở đâu cũng đi cùng một đường (ghi vào phiên, preset, lưu lạc quan, hoàn lại khi lỗi).
- Chi tiết bàn phím: đóng menu thì trả lại quyền gõ (nếu không, phím Enter vừa chọn mức sẽ nuốt luôn chữ gõ tiếp).

## 3. Đổi sang mô hình đắt phải xác nhận

- Cổng có một bước bắt tay: nếu việc đổi mô hình bị coi là đắt, nó **cố ý không áp dụng** và chờ gửi lại kèm cờ xác nhận.
- Mọi nơi đổi mô hình (bộ chọn chính, trình sửa bot) đi **qua một hàm xác nhận duy nhất**, không có logic xác nhận riêng mỗi nơi.
- Việc bị từ chối là **một quyết định, không phải thông báo**: hiện hộp thoại có nút từ chối thật; Esc, bấm nền, bấm X đều nghĩa là giữ mô hình cũ; hộp thoại giữ tiêu điểm trong lúc chờ.
- Từ chối **không tốn gì** vì chưa có gì được áp dụng.
- Có **chống lỗi thời**: nếu phiên hay mô hình đã đổi trong lúc hộp thoại mở thì câu trả lời không còn hiệu lực và có thông báo nói rõ, không ghi đè lựa chọn mới.
- Nếu gửi lại kèm xác nhận mà cổng **vẫn** đòi xác nhận thì coi là lỗi, không lặp lại.

## 4. Áp dụng cho Yana

- **Viên mức suy luận cạnh viên mô hình trên thanh soạn.** Nhãn ngắn, ẩn khi mô hình không hỗ trợ. Yana có 19 nhà cung cấp nên cần tập mức khai báo theo từng nhà cung cấp và mô hình, đọc từ dữ liệu, không viết cứng.
- **Trung thực về ép mức** khớp thẳng với nguyên tắc của Yana (không hứa quá mức): nếu mức chọn bị ép, hiện cả hai đầu và nói gửi mức nào. Mức thực gửi phải do `yana-rt` báo.
- **Không bịa mức mặc định**: chưa chọn thì hiện "chưa đặt".
- **Xác nhận khi đổi sang mô hình đắt** khớp với chế độ SUPERVISED và với ngân sách token. Từ chối không tốn gì, chống lỗi thời, một hàm duy nhất cho mọi nơi đổi. Cần định nghĩa thế nào là "đắt" (theo bảng giá hay theo hạn mức), việc này thuộc phía runtime.
- **Một bộ điều khiển cho nhiều nơi** (viên, danh mục, màn Mô hình và hạn mức): tránh hai đường sửa cùng một thứ.

## 5. Điều cần kiểm trước khi làm

- `yana-rt` hiện có khái niệm mức suy luận không, và truyền đến nhà cung cấp nào: chưa kiểm.
- Cách danh mục của Yana báo khả năng của từng mô hình (có suy luận, có tắt được, có chế độ nhanh): chưa kiểm.
- "Đắt" của Hermes định nghĩa thế nào ở phía cổng: chưa đọc.
- Giao diện thật: chưa chạy, chưa xem ảnh. Mọi nhận xét về hình dạng là suy ra từ mã và kiểu dữ liệu.
- Các bảng tên mô hình cụ thể trong `reasoning_effort.py` là theo commit đã đọc, đổi nhanh; không sao chép thành dữ liệu của Yana.
