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

## 2d. Ba trang của notch mở rộng (từ một bản ghi màn hình 20 giây do người dùng đưa)

Cách làm: người dùng tự ghi màn hình khi rê chuột và bấm qua các trang của notch; em cắt riêng vùng notch, lấy mỗi 2 giây một khung (10 khung, xem 8). Các khung đã xóa, bản ghi không đưa vào repo. Chỉ quan sát như người dùng. Chưa thấy các biểu tượng nhỏ ở góc phải làm gì.

**Ba trang, chuyển bằng ba chấm ở góc trên bên trái:**
1. **Lịch sử clipboard:** thanh trên có ô tìm kiếm, các tab "Tất cả", "Ghim" và dấu cộng (thêm bảng); mỗi mục là một thẻ có đoạn trích nội dung, biểu tượng app nguồn, "bao lâu trước" và dung lượng; có nút sắp xếp và nút đổi kiểu hiển thị.
2. **Đang phát nhạc:** ảnh bìa có huy hiệu nguồn phát, tên bài, nghệ sĩ, nút xáo trộn, lùi, phát, tới, lời bài hát, thanh tiến độ có thời gian đã qua và còn lại.
3. **Bảng agent:** dòng tóm tắt đổi theo trạng thái ("1 running" khi có phiên đang chạy, "All caught up" khi xong hết) kèm tổng số phiên và hai ô phần trăm theo nhà cung cấp; mỗi phiên một hàng.

**Trong trang agent, khi một phiên bắt đầu làm việc:** tiêu đề hàng đổi sang màu khác với biểu tượng lấp lánh và chữ **"Prompt: ..."** (nội dung lời nhắn), kèm **bộ đếm giây chạy** ở góc phải; hàng bắt đầu sáng nền. Khi phiên rảnh, tiêu đề là tên phiên với biểu tượng thư mục màu xanh. Trạng thái thu gọn cũng đổi theo: "Prompt: ...", rồi "Running Bash", "Ran Bash" (khi vừa chạy xong), "Compacting the conversation...". Nhân vật pixel đổi hình theo từng trạng thái. **Suy luận (chưa kiểm):** các trạng thái này khớp với các sự kiện của Claude Code (nhận lời nhắn, bắt đầu và kết thúc dùng công cụ, nén hội thoại), tức là nó đọc luồng sự kiện của agent. Em chưa biết nó lấy bằng cách nào.

Trang agent hiện **nguyên văn lời nhắn gần nhất** của phiên (xem mục 2c về quyền riêng tư), và các thông tin của phiên như thư mục, nhánh, số terminal, mô hình, thời gian.

## 2e. Hai bản ghi khác trong thư mục docs

- **Bản ghi màn hình 13,8 giây của một notch Yana** chạy trong cửa sổ trình duyệt (xem mục 2f).
- **Một video giới thiệu Yana, dài 42 giây (24/10, 1920x1080):** các cảnh theo thứ tự: "Bắt đầu cùng Yana." (màn trò chuyện, thanh bên Trò chuyện, Mô hình, Công việc, Lịch sử), "Xem thay đổi. Bạn quyết định." (một so sánh diff của `theme.css`, 11 dòng thêm và 1 dòng bớt, cạnh khung chat), "Chọn model bạn muốn." (màn chọn nhà cung cấp, "Đã lưu lựa chọn cho dự án"), "Tất cả trong một nơi." (diff, bản xem trước trang, nút "Đã áp dụng"), cảnh cuối "Yana. Làm việc cùng AI." Thông điệp **"Bạn quyết định"** khớp với nguyên tắc con người trước tự động hóa. Em không biết ai làm video này; giao diện trong đó (bốn mục thanh bên) **khác** với Yana Studio hiện tại (Start, Conversations, Models & Runtime, Project, Tasks, Governance, Tools, System), nên đây là hình dung cho trang giới thiệu, không phải ảnh chụp app thật.

## 2f. Notch Yana trong bản ghi (nguồn chưa rõ)

Quan sát 6 khung: các trạng thái "Đang nghỉ" (nhân vật có chữ z z), "Đang chạy · edit src/ap...", "Chờ bạn duyệt" kèm thẻ hiện loại hành động và **lệnh thô** cùng hai nút **Cho phép (Enter)** và **Từ chối (esc)**, "Chặn theo chính sách" với bảng chấm đỏ; mở rộng hiện bốn dòng nhật ký (có chip "ASK -> ALLOW"). Hai điểm cần xem lại nếu đây là thiết kế định dùng: thẻ duyệt in lệnh thô, và **Enter là phím Cho phép** (trái nguyên tắc không có phím một phím cho Allow).

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
