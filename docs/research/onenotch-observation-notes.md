# Ghi chú quan sát: app OneNotch

Đây là ghi chú về **cách app này được tổ chức và những gì nó nói công khai**, viết bằng lời của chúng ta. App này là phần mềm thương mại đóng mã; ghi chú **không** dịch ngược, không chép mã, không dùng hình ảnh hay âm thanh của họ.

| Mục | Giá trị |
|---|---|
| Đối tượng | OneNotch 2.1.0 đã cài trên máy (`/Applications/OneNotch.app`), nhà phát triển ký bằng Developer ID, địa chỉ cập nhật `releases.tryonenotch.com` |
| Giấy phép mã | Không công bố. Đây là app đóng; giấy phép sử dụng (EULA) em chưa đọc |
| Cách quan sát | (1) Siêu dữ liệu của gói app (`Info.plist`, tên các tệp trong `Resources` và `Frameworks`, chữ ký). (2) Trang chủ công khai của sản phẩm (nội dung được tóm bằng công cụ đọc trang, coi là dữ liệu bên ngoài, đã diễn đạt lại). (3) Một lần đo cửa sổ của nó trên màn hình ở phiên trước |
| Không làm | Không dịch ngược tệp thực thi, không trích chuỗi từ mã nhị phân, không gắn công cụ vào tiến trình đang chạy, không đọc dữ liệu người dùng của nó |
| Điều khoản | Đã đọc (qua công cụ đọc trang, bản tóm lược, chưa phải toàn văn): mục 5 cấm dịch ngược và dịch mã, cấm tạo sản phẩm phái sinh, trừ khi luật cho phép rõ. Vì vậy **không dịch ngược** và không dùng công cụ phân tích mã nhị phân cho app này |
| Chưa làm | Xem giao diện bên trong (chưa chụp ảnh, chưa mở các video giới thiệu) |

## 1. Những gì gói app tiết lộ (chỉ siêu dữ liệu)

- **Là app thanh trên cùng, không có biểu tượng Dock** (đặt cờ chỉ chạy nền). Yêu cầu macOS 15 trở lên. Tự cập nhật bằng một khung cập nhật chuẩn.
- **Quyền hệ thống nó xin, kèm lý do ghi trong gói:** điều khiển nhạc (qua sự kiện hệ thống), Bluetooth (hiện hoạt động của thiết bị đang kết nối), lịch (hiện và thêm sự kiện), micro (làm hình ảnh nhạy theo âm thanh đang phát), ghi màn hình (chụp ảnh màn hình).
- **Thành phần bên trong:** cơ sở dữ liệu SQLite cục bộ, thư viện phím tắt, khung đọc "đang phát" của hệ thống, **báo lỗi từ xa (Sentry)** và **số liệu sử dụng (TelemetryDeck)**.
- **Tài nguyên:** các video ngắn cho từng dòng AirPods, âm thanh cho clipboard, video giới thiệu theo bốn chủ đề (clipboard, glance, pill, tools) và video "có gì mới", danh sách dịch vụ oEmbed để hiện xem trước đường dẫn, **hơn hai mươi ngôn ngữ trong đó có tiếng Việt**.

## 2. Những gì trang công khai nói (đã diễn đạt lại, chưa kiểm chứng)

- Là một bộ công cụ quanh khung notch, không chỉ là chỗ hiện trạng thái: **lịch sử clipboard** (văn bản, ảnh, liên kết, màu, tệp, video; tìm kiếm, bộ lọc, nhiều bảng, chế độ dán nhiều mục theo thứ tự), **chụp màn hình** có chú thích, dịch, che mặt và chữ, chọn màu, cuộn chụp, cùng nhạc có lời, tóm tắt lịch, theo dõi hệ thống, giữ máy thức, nhắc nghỉ mắt, công cụ trình chiếu, hiển thị âm lượng và độ sáng.
- **Thả tệp vào notch** hiện lựa chọn nén, chuyển đổi hoặc AirDrop.
- **Tích hợp với công cụ AI cho lập trình:** nói rằng Claude Code, Cursor và Codex có thể **tìm trong lịch sử clipboard qua một kết nối MCP chạy cục bộ**, và một khung "AI" theo dõi Claude Code và Codex chạy trong terminal (không phải app desktop của chúng).
- **Quyền riêng tư theo lời họ:** có tùy chọn bỏ qua nội dung nhạy cảm và chọn app loại trừ; bảng khóa được mã hóa và agent AI không thấy được; **quyền truy cập của agent AI tắt mặc định**; tìm kiếm MCP chạy cục bộ. Trang **không nêu rõ việc thu thập số liệu**, trong khi gói có hai thành phần liên quan (xem mục 1). Em không kết luận gì về hành vi thực tế.
- **Giá:** có bản miễn phí giới hạn, bản Pro mua một lần, bản Supporter mua một lần cho nhiều máy; không thuê bao.

## 2b. Quan sát giao diện thật (một khung hình, chụp ngày 2026-10-31)

Cách làm: chụp **một dải 600x220 điểm ở giữa trên cùng màn hình** (chỗ notch) bằng công cụ chụp màn hình của hệ điều hành, khi OneNotch đang chạy và người dùng đang dùng Claude Code. Chỉ là quan sát hành vi như người dùng; không dịch ngược. Ảnh không đưa vào repo vì có lẫn nội dung cửa sổ khác của người dùng. Chỉ có **một trạng thái thu gọn**; chưa thấy trạng thái mở rộng hay chuyển động.

Tiến trình đang chạy (kiểm bằng tên tiến trình): chỉ có OneNotch; app notch của Yana không chạy. Nên khung hình này là của OneNotch, đang hiện hoạt động của phiên Claude Code.

Trong khung hình:
- Viên đen **trùm lên vùng notch phần cứng**, hai cánh trái và phải của viên chứa nội dung, phần giữa trống (trùng với cách ta đã thiết kế). Đáy bo tròn, đỉnh sát mép màn hình.
- **Trái:** nhân vật pixel nhỏ (hình người ngồi trước laptop, màu cam và xanh).
- **Giữa:** hai dòng chữ: tên agent ("Claude") đậm, trắng; dòng dưới nhỏ hơn, xám, ghi **việc đang làm bằng lời thường** ("Running Bash"). Không in lệnh.
- **Phải:** **lưới chấm 3x3** màu cam với độ sáng thay đổi theo chấm, đọc như thước đo mức hoạt động.
- Ngay bên phải viên đen là các mục menu bar của app khác (không thuộc OneNotch).

Điều này xác nhận hai điểm của bản thiết kế notch hiện tại (thỏ pixel hai cánh, lưới chấm 3x3 bên phải, vùng giữa để trống) và cho thấy **hai dòng "tên agent + việc đang làm bằng lời thường"** là một mẫu đáng cân nhắc cho trạng thái thu gọn của Yana, thay vì chỉ biểu tượng.

## 2c. Trạng thái mở rộng (quan sát bằng chụp liên tục 12 khung trong 60 giây)

Cách làm: người dùng tự rê chuột và bấm vào chỗ nhân vật pixel; công cụ chụp màn hình chụp dải notch mỗi 5 giây. Chỉ quan sát hành vi như người dùng. Các khung đã bị xóa sau khi xem, không đưa vào repo, vì có lẫn nội dung phiên làm việc của người dùng. Em chỉ xem 3 trong 12 khung (một thu gọn lúc nghỉ, một thu gọn lúc đang nén hội thoại, một mở rộng).

**Thay đổi ở trạng thái thu gọn:** nhân vật pixel **đổi hình theo trạng thái** (lúc chạy lệnh là hình người ngồi trước laptop, lúc nén hội thoại là một sinh vật pixel màu hồng khác), và dòng dưới tên agent đổi theo việc ("Running Bash", "Compacting the conversation...").

**Trạng thái mở rộng là một bảng điều khiển nhiều agent**, rộng bằng khoảng cả dải chụp, cao khoảng 180 điểm, đáy bo tròn lớn, có nút mũi tên xuống ở góc dưới phải để mở thêm:
- **Hàng đầu:** ba chấm (chỉ số trang, chấm thứ ba đang chọn, gợi ý có nhiều tab như clipboard, glance, tools), và ba biểu tượng nhỏ ở góc phải.
- **Dòng tóm tắt:** "N running" cùng tổng số phiên; bên phải là **hai ô phần trăm theo từng agent** (ví dụ 52% và 100%), đọc như mức dùng hạn mức của từng nhà cung cấp.
- **Mỗi phiên một hàng**, gồm: biểu tượng agent, **tiêu đề trạng thái** ("Compacting the conversation..." hoặc tên phiên), **thư mục làm việc và một con số** (có vẻ là số lượt hay số tin), **nhánh git** với biểu tượng nhánh, **số terminal**, **tên mô hình**, **thời gian đã chạy** (47s, 51s), và **một dòng xem trước nội dung** (nội dung lời nhắc gần nhất của phiên).
- Hàng đầu được tô sáng nền khi đang hoạt động; màu chữ phân biệt trạng thái (hồng cho đang làm, xanh lá cho tên phiên).

**Điều đáng chú ý về quyền riêng tư:** dòng xem trước **hiện nguyên văn nội dung lời nhắc** ngay trên notch. Đây là chỗ ngược với nguyên tắc của notch Yana (chỉ hiện loại hành động, không hiện lệnh thô hay nội dung hội thoại).

## 3. Áp dụng cho Yana

Chỉ lấy nguyên tắc, không lấy tài sản:

1. **Họ đã đi cùng hướng "notch làm bề mặt cho agent".** Có theo dõi Claude Code và Codex trong terminal và một kết nối MCP cục bộ cho phép agent đọc dữ liệu người dùng, tắt mặc định. Yana khác ở chỗ **có cổng duyệt và sổ cái**: notch của Yana chỉ đọc trạng thái, và nút duyệt đi qua đường resume của `yana-rt`. Điểm này đáng đối chiếu thành lời giới thiệu.
2. **Quyền agent đọc dữ liệu tắt mặc định** là hợp với Khay tài liệu (ADDENDUM-3: cho công cụ ngoài đọc Khay qua MCP, mặc định tắt).
3. **Mỗi quyền hệ thống đi kèm một câu giải thích đúng việc nó làm.** Chữ xin quyền của họ cụ thể ("hiện hoạt động của thiết bị đang kết nối"), không chung chung. Studio và notch của Yana nên làm tương tự khi xin quyền (ghi màn hình, trợ năng).
4. **Họ dùng báo lỗi và số liệu từ xa.** Yana nói rõ là cục bộ trước: nếu Yana thêm báo lỗi từ xa thì phải là một quyết định công khai và tắt được, không phải mặc định ngầm.
5. **Nhường chỗ cho app notch khác** là việc mà chính OneNotch gây ra cho notch của ta: lần đo trước cho thấy nó dùng một cửa sổ trong suốt rộng trùm lên vùng notch. Đã được xử lý bằng cơ chế nhường sang menu bar (đã làm trên nhánh notch). Không có gì mới cần lấy.
6. Phạm vi của họ rộng (clipboard, chụp màn hình, nhạc, lịch, nghỉ mắt). Theo nguyên tắc "xây ít hơn" của Yana, **không nên theo hướng này**; notch của Yana chỉ cần trạng thái, duyệt và nhật ký.

## 4. Chưa kiểm

- Mọi điều ở mục 2 là lời trên trang của họ, chưa kiểm xem app thực sự làm vậy.
- Giao diện bên trong và các chuyển động: chưa xem.
- Họ có thực sự thu thập số liệu và gửi gì: chưa biết.
- Toàn văn điều khoản: chỉ đọc bản tóm lược của công cụ đọc trang. Phần tóm lược nói mục 5 cấm dịch ngược; không có việc dịch ngược nào được làm.
- Mục 5 của phần áp dụng dựa trên số đo cửa sổ ở phiên trước (cửa sổ trong suốt, ngang khoảng 700 điểm, cao 745, nằm ở lớp 27); em không đo lại trong lượt này.
