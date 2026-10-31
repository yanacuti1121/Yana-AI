# Ghi chú thiết kế: học từ OpenMausBot

Đây là ghi chú về **cách họ thiết kế**, viết bằng lời của chúng ta. Không có đoạn mã nào được chép vào repo này.

| Mục | Giá trị |
|---|---|
| Nguồn | https://github.com/milind-soni/OpenMausBot |
| Giấy phép | Apache-2.0 (kiểm bằng GitHub API, 2026-10-31) |
| Commit đã đọc | `7de00e425848d5f1a2a845cb4784851b87d8cad2` |
| Cách đọc | Qua API của GitHub, không clone, không chạy mã, không cài gói |
| Đã đọc | `server/auto-approve.ts`, `server/sse-fanout.ts`, `server/harness/http.ts`, `server/harness/engine-status-file.ts`, `src/components/ApprovalModeSelector.tsx`, `src/components/ApprovalCard.tsx` (phần đầu), danh sách toàn bộ file |
| Chưa đọc | `server/harness/bus.ts`, `registry.ts`, `electron/approval-trusted-mode.cjs`, thành phần `AskCard`, `PendingApproval`, phần `cloudflare/` |

Muốn dùng lại mã của họ thì phải làm bước riêng: giữ nguyên thông báo bản quyền, kèm LICENSE và NOTICE, ghi chỗ đã sửa, thêm vào `ACKNOWLEDGEMENTS.md`. Tên, logo, mascot và hình ảnh không dùng.

## 1. Chính sách duyệt

- **Họ không tự quyết hành động nào an toàn.** Mỗi mức duyệt là chế độ quyền của chính engine (Claude, Codex, Grok...) được chuyển nguyên lên. Họ chỉ hiển thị những yêu cầu mà engine để lại cho con người. Yana khác hẳn: chính `yana-rt` quyết định qua chuỗi ủy quyền, lease và guard, nên đây là điểm Yana có thể nói "Yana quyết định" còn họ thì không.
- **Thang chế độ**: Ask, Edits, Auto (gọi là "Approve for me"), Full, Custom. Tùy engine mà chỉ hiện các chế độ engine đó hỗ trợ. Chọn chế độ ở một nút nhỏ có menu, mỗi mục kèm một dòng mô tả.
- **Mỗi lần ứng dụng tự duyệt đều để lại một dòng nhãn** ("approved X (saved command)"), nên một hành động tự duyệt không bao giờ vô hình.
- **Mỗi quyết định ghi "theo luật nào"**: toàn quyền, lệnh đã lưu, công cụ đã lưu, tìm web, file của chính bot, duyệt gốc của engine, chặn vì mở rộng sandbox, chặn gửi ra ngoài, sàn an toàn, không có quyền.
- **Một số thứ luôn hỏi người**, kể cả ở chế độ tự duyệt: câu hỏi của agent, mọi thao tác gửi gì đó ra ngoài thay mặt người dùng, và việc nới giới hạn an toàn của sandbox (chỉ chế độ Full mới tự duyệt được).
- **Lời giải thích vì sao đang hỏi** ("Việc này gửi gì đó thay bạn nên hỏi bạn trước"). Đây gần đúng "vì sao cần" trong thẻ duyệt năm yếu tố.
- **Quyền không tự nâng.** Mức Full là quyền người dùng cấp riêng cho từng bot, không thừa kế từ người gửi. Quyền chỉ truyền xuống từ một bot điều phối, chỉ theo chiều đi lên, và bị giới hạn bởi cái engine của bot nhận hỗ trợ.
- **Yêu cầu hết hạn không bao giờ trở thành thẻ Allow/Deny mới.**
- Danh sách lệnh và công cụ cho phép được khớp **chính xác** (bot, engine, thư mục, lệnh), không khớp mẫu rộng.

## 2. Thẻ duyệt và giao diện

- Thẻ có vòng đời: chờ, đã cho phép, đã từ chối, hết hạn ("timed out"), **đã hoàn tác**. Mỗi trạng thái có dòng kết quả bằng chữ thường.
- Tên công cụ được dịch sang câu thường ("chạy một lệnh", "đọc một tệp", "sửa tệp", "lấy trang web", "xóa tệp"), có mục dự phòng cho công cụ lạ. Không hiện tên công cụ thô.
- Thẻ không chỉ cho công cụ: agent còn có thể **đề xuất thay đổi** (lịch chạy, kỹ năng, hồ sơ, mô hình, thiết lập đội), người dùng xác nhận, rồi có một dòng "đã áp dụng" nói rõ điều gì đã đổi, và với nhiều loại có nút **Hoàn tác**.
- Mọi chuỗi chữ đi qua i18n theo khóa.
- Trạng thái "đang bận" của engine được nói rõ khi đổi chế độ: đổi có hiệu lực sau lượt đang chạy.

## 3. Kênh truyền

- Họ **đúng là dùng máy chủ cục bộ với SSE** (đúng như Gemini nói về riêng dự án này). Bộ phát tới nhiều client có kiểm soát nghẽn: vượt 4 MiB đệm thì ngắt client, client tự nối lại và phát lại theo `Last-Event-ID`. Chỉ khung hình màn hình được phép bỏ khi nghẽn, sự kiện bền thì luôn ghi hoặc ngắt để phát lại.
- Có nhịp tim, giới hạn thân yêu cầu 1 MB (trả 413), chỉ giải mã JSON một lần.
- Có thành phần đám mây (`cloudflare/`) cho sự kiện ứng dụng và Composio. Vậy "chạy cục bộ" của họ không tuyệt đối.

## 4. Trạng thái engine

- Mỗi engine có một ảnh chụp: sẵn sàng hay không (kèm lý do), đã đăng nhập chưa, tài khoản (chỉ email, tổ chức, cách đăng nhập; **không bao giờ khóa**), phiên bản, có bản cập nhật không (tiêu đề, thông điệp, lệnh), kiểu tính phí (theo lượt hay thuê bao), cảnh báo.
- Dữ liệu đọc lại từ file phải qua kiểm tra từng trường; trường hỏng bị bỏ chứ không đoán.
- Ghi file tối đa một lần mỗi giây, ghi nguyên tử, quyền 0600.

## 5. Áp vào Yana

| Họ có | Yana hiện có | Gợi ý |
|---|---|---|
| Nhãn "theo luật nào" cho mỗi quyết định | Audit chỉ có `decision` (allow/deny) | Thêm trường nguồn luật vào audit và hiển thị |
| Nhãn khi tự duyệt | Chưa kiểm xem chat có nói lease nào đã trả lời không | Hiện "đã duyệt theo lease X" trong chat |
| Lời giải thích vì sao hỏi | `authority_reason` có trong bản ghi chờ duyệt | Đưa lên mặt thẻ duyệt |
| Tên công cụ thành câu thường | Hiện tên thô (`run_command`) | Bảng dịch có mục dự phòng |
| Thẻ hết hạn, đã hoàn tác | Có hạn và hết hạn; chưa có hoàn tác | Hoàn tác cần runtime hỗ trợ trước |
| Thang chế độ theo engine | "Supervised"; Auto/Plan-only chưa làm | Cần cờ chế độ trong `yana-rt` trước |
| Ảnh chụp trạng thái engine (đăng nhập, bản, cập nhật, tính phí) | `status` mới chỉ có tên engine và số tiến trình | Mở rộng nhưng chỉ khi đọc được thật |
| Phát lại SSE | Chưa có; thăm dò 2 đến 3 giây | Cân nhắc sau, vì mở cổng cục bộ có rủi ro (xem bản phân tích riêng) |

## 6. Điều cần nhớ khi dùng ghi chú này

- Đây là mô tả từ việc đọc sáu file ở một commit. Chưa chạy được ứng dụng nên chưa biết giao diện trông ra sao khi dùng thật.
- Họ có nhiều tầng mà Yana không cần (đám mây, Composio, điện thoại, giọng nói).
- Chỗ khác biệt lớn nhất không nên xóa: họ chuyển tiếp quyết định của engine, Yana tự quyết định và ghi bằng chứng.
