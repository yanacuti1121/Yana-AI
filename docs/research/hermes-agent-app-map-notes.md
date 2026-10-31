# Ghi chú thiết kế: bản đồ toàn bộ app desktop của Hermes Agent

Đây là ghi chú về **cách họ tổ chức app**, viết bằng lời của chúng ta. Không có đoạn mã nào được chép vào repo này. Bổ sung cho `hermes-agent-composer-design-notes.md` (chi tiết thanh soạn).

| Mục | Giá trị |
|---|---|
| Nguồn | https://github.com/NousResearch/hermes-agent, thư mục `apps/desktop` |
| Giấy phép | MIT (kiểm bằng GitHub API, 2026-10-31) |
| Bản đã đọc | Bản cục bộ đang chạy trên máy, commit `bf0203a794a07aac3ff764972ab9087baa4e4f4e` (2026-10-22). Chỉ đọc thư mục `apps/desktop`; không đọc `~/.hermes` ngoài kho mã (có tệp xác thực) |
| Cách đọc | Đọc tệp trên đĩa, không chạy mã, không gắn công cụ vào tiến trình đang chạy, không dùng `rea` vì mã mở |
| Đã đọc | `AGENTS.md` (từ dòng 13 đến 171), `DESIGN.md` (110 dòng đầu, mục Feedback và mục Keyboard), `src/app/routes.ts` (phần khai báo và danh sách overlay), danh sách tệp của `src/app`, `src/app/settings`, `src/app/shell`, `src/app/hud`, `src/app/starmap`, `src/app/quick-entry`, `src/app/learning` |
| Chưa đọc | Nội dung bên trong của hầu hết các màn (chỉ biết tên tệp), `ENGINEERING.md` (chỉ biết các tiêu đề), phần lớn `DESIGN.md` (token, nút, huy hiệu, chuyển động, i18n), `electron/`, `apps/bootstrap-installer`, `apps/shared`, giao diện thật (chưa xem ảnh chụp, chưa chạy app) |

Muốn dùng lại mã của họ thì phải làm bước riêng: giữ nguyên thông báo bản quyền, kèm LICENSE, ghi chỗ đã sửa, thêm vào `ACKNOWLEDGEMENTS.md`. Tên, logo, hình ảnh và nhân vật không dùng.

## 1. App này là gì

Ba bên, mỗi bên chỉ có quyền quyết định một việc:
- **Electron** giữ máy: vòng đời tiến trình, hệ thống tệp, git, cửa sổ, cài đặt và cập nhật, qua một cầu nối có kiểu hẹp.
- **Renderer** giữ trải nghiệm: điều hướng, trình bày, trạng thái tương tác ngắn hạn. Không bao giờ chạm Node hay Electron trực tiếp.
- **Backend của agent** giữ công việc: phiên, công cụ, gọi mô hình, phát luồng. Hành vi agent nằm sau cổng, không viết lại trong giao diện.

Khi một thay đổi làm mờ ranh giới ba bên, họ coi đó là dấu hiệu xấu và sửa ranh giới, không nới rộng nó.

## 2. Các màn và vùng của app

**Chat là màn chính.** Bản ghi hội thoại và thanh soạn luôn là trung tâm; công cụ, xem trước, tệp, review, terminal chỉ bổ trợ.

**Trang bền vững (nằm trong khung):** Chat, Capabilities (Skills và kết nối), Messaging, Artifacts.

**Overlay là việc ngắn** (hiện thành thẻ phủ, đóng thì quay lại màn trước, không phải ngăn xếp điều hướng): Cài đặt, Command Center, Cron, Profiles, Agents, Starmap, Webhooks, Nhập phiên (session import).

**Khung làm việc phụ (pane):** xem trước, tệp, review, terminal. Trạng thái được giữ khi ẩn tạm hoặc khi đổi hội thoại. Thanh trình đơn dưới có điều khiển trạng thái, mức dùng tài nguyên, chọn cổng kết nối.

**Cài đặt rất rộng** (81 tệp trong thư mục): giao diện, mô hình, nhà cung cấp, khóa và thông tin xác thực, endpoint tùy chỉnh, mô hình cục bộ (tải, phần cứng, runtime, quickstart), ủy quyền (delegation), cổng (gateway), phím tắt, thông báo, bộ nhớ (memory), plugin, trình duyệt thật và computer-use, tiền (billing), cập nhật có quản lý, thu nhỏ xuống khay, và các mục tùy biến giao diện khác.

**Bề mặt ngoài cửa sổ chính:**
- **HUD** nổi (kéo từ thanh soạn, kính mờ, cho xuyên chuột, chuyển giao sang cửa sổ chính).
- **Quick-entry:** cửa sổ nhập nhanh riêng.
- **Wake indicator:** chỉ báo thức dậy.
- **Pet overlay và pet generate:** nhân vật thú cưng phủ màn hình và trình tạo nhân vật.
- **Starmap:** bản đồ sao có trục thời gian, phát lại, chia sẻ bằng mã.
- **Learning:** quản lý kỹ năng đã học, có hộp xác nhận lưu trữ.

Lưu ý cho Yana: nhiều thứ trong danh sách này (thú cưng, bản đồ sao) là sắc thái riêng của họ. Nguyên tắc "xây ít hơn" của Yana nói không nên chép chúng. Giá trị nằm ở **cách họ tổ chức**, không ở danh sách tính năng.

## 3. Nguyên tắc thiết kế họ tự đặt ra (DESIGN.md)

- **Phẳng, không đóng khung.** Không thẻ trong thẻ, không đường kẻ chia bên trong một panel; nhóm bằng khoảng trắng và một đường kẻ mảnh.
- **Một thành phần cho một việc.** Một nút, một ô tìm kiếm, một vòng tải, một trạng thái lỗi. Di chuyển lên chúng, không tách nhánh.
- **Dùng token, không dùng giá trị thô.** Không màu hex hay bóng riêng lẻ trong thành phần.
- **Kiểu dáng nằm trong thành phần**, nơi gọi chỉ truyền biến thể và cỡ, không ghi đè.
- **Ý định đi trước tự động hóa.** Không tự mở panel, chuyển tiêu điểm hay điều hướng chỉ vì một công cụ vừa tạo ra thứ gì.
- **Phản hồi tức thì.** Thao tác trực tiếp cập nhật giao diện trước; lưu xuống mạng hay đĩa đối chiếu sau và hoàn lại thấy được nếu lỗi.
- **Một hành động, một nơi:** phím tắt, bảng lệnh và nút thấy được đều gọi cùng một hành động và trạng thái.
- **Điều hướng giữ ngữ cảnh.** Một phiên nền xong việc, một kết quả công cụ đến, hay một dự án làm mới có thể đổi huy hiệu và dữ liệu đệm, nhưng không được thay bản ghi hội thoại đang xem hay cướp tiêu điểm.
- **Trạng thái:** mỗi trạng thái quanh việc tải (trống, đang tải, đang kết nối lại, suy giảm hoặc cũ, hết đường phục hồi) là một trải nghiệm riêng, có lời riêng và lối thoát riêng. Không bao giờ hiện chữ "Loading...". Hộp "bạn có chắc" chỉ có một nơi duy nhất, mở sẵn tiêu điểm ở nút xác nhận (Enter xác nhận, Esc hủy), có sẵn trạng thái chờ và lỗi bên trong. Không dùng hộp xác nhận mặc định của trình duyệt.
- **Bàn phím theo tiêu điểm:** vùng đang tiêu điểm thắng phím của nó; phím tắt toàn cục không được cướp phím của terminal hay editor. **Một cử chỉ hủy chỉ làm một việc:** hủy tương tác đang diễn ra hoặc đóng lớp trên cùng, không bao giờ cả hai. Hủy là đồng bộ phía giao diện dù dọn dẹp bất đồng bộ.
- **Luồng không được thoát ra (cài đặt đầu, xác nhận hủy hoại) phải nói rõ là không thoát được.**

## 4. Nguyên tắc kỹ thuật họ tự đặt ra (AGENTS.md)

- **Quyết định trạng thái theo "ai có quyền đúng":** backend là gốc cho mọi thứ bề mặt khác cũng đổi được; Electron là gốc cho sự thật về máy; renderer chỉ giữ thứ thuần túy về trình bày của cửa sổ này. Trạng thái bền vững phải **khai báo phạm vi ngay trong khóa** (toàn cục, theo kết nối, theo hồ sơ, theo phiên, theo dự án, hay theo cửa sổ).
- **Dữ liệu từ máy chủ là bản đệm, không phải của giao diện.** Gộp chứ không đè; vẽ lạc quan và hoàn lại thấy được; kết quả bất đồng bộ cũ không bao giờ ghi đè ý định mới hơn (bộ đếm thế hệ, mã yêu cầu); chỉ bề mặt đang ở tiền cảnh mới đẩy vào trạng thái chung.
- **Đổi ngữ cảnh là dọn nhà lại, không khởi động lại.**
- **Mọi ranh giới đi qua một "thang" có thứ tự:** thứ tự ưu tiên là dữ liệu, một ứng viên chỉ được tin sau khi thử, đọc lỗi thì rơi xuống bậc kế, **ghi quyền lực lỗi thì phải hiện hoặc hoàn lại**, thiếu khả năng không phải lỗi tạm, thử lại có giới hạn và kết thúc bằng một nút phục hồi.
- **Nội dung của khách không bao giờ tự mở gì.** Iframe của artifact và webview xem trước không được tự mở trình duyệt hệ điều hành: `setWindowOpenHandler` từ chối tất cả; liên kết `_blank` chỉ đi qua một cầu nối "bấm tin cậy", chỉ giao thức http và https. Đã có thông báo bảo mật (GHSA) cho chuyện này.
- **Giữ thắt lưng hẹp, mở rộng ở rìa.** Không xây khung plugin cho một người dùng duy nhất; chỉ thiết kế hợp đồng chung khi có hơn một người dùng thật chứng minh hình dạng của nó.
- **Khả năng do agent gọi là thuộc tính của phiên (máy khách), không phải của backend.**
- **Tương thích với bản cũ:** desktop và runtime cập nhật theo đồng hồ riêng nên một thay đổi có thể gặp backend cũ. Giữ chúng hoạt động, chỉ giữ lối dự phòng hẹp gắn với bản cũ cụ thể, có test. Lối dự phòng làm hỏng im lặng chính tính năng nó bảo vệ còn tệ hơn lỗi nó thay.
- **Tôn trọng người dùng:** không bao giờ điều hướng, chuyển tiêu điểm hay mở bề mặt chỉ vì có việc xảy ra nền. **Đề nghị, không chiếm quyền.** Bề mặt đắt, có trạng thái (terminal, công cụ trực tiếp) được giữ sống khi bị ẩn: hiển thị không phải vòng đời.
- **Cảm giác tức thì là tính năng.** Chứng minh tốc độ trên nội dung thật. Nếu chuyển động đang che độ trễ thì bỏ chuyển động, đừng chỉnh nó.
- **Test để chứng minh:** kiểm hành vi sẽ làm hỏng người dùng, không chụp ảnh dữ liệu hôm nay. Ưu tiên bất biến hơn giá trị cố định.

**Bài kiểm "vị" trước khi giao:** trạng thái có nằm cạnh người có quyền đúng và ở phạm vi hẹp nhất không? Sự kiện nền có bao giờ cướp tiền cảnh hay tiêu điểm không? Mỗi bộ phân giải có một nơi, một thang đã kiểm, một kết thúc phục hồi được không? Lỗi bất đồng bộ có để lại giao diện dùng được và lối đi tiếp không? Thao tác nóng có rẻ khi tải thật không? Nếu một câu trả lời là "không chắc" thì đó là phần cần kiểm.

## 5. Điều đáng mang sang Yana

Nhiều nguyên tắc ở trên **trùng với tư tưởng sẵn có của Yana** (con người trước tự động hóa, bằng chứng trước sự tự tin, thiết kế cho thất bại). Hermes đã viết chúng thành quy tắc kiểm tra được. Điều đáng lấy là **cách phát biểu**:

1. **Ba bên, mỗi bên một quyền:** Studio (máy), giao diện (trải nghiệm), `yana-rt` (công việc). Yana đã chia gần như vậy; viết thành một đoạn ngắn trong tài liệu thiết kế để mọi màn mới đối chiếu.
2. **Trạng thái khai báo phạm vi ngay trong khóa** (toàn cục, dự án, hội thoại, cửa sổ). Dùng cho `workspaceState` của Studio và Khay tài liệu: tránh một dự án làm lẫn dữ liệu của dự án khác.
3. **Năm trạng thái quanh việc tải** (trống, đang tải, đang kết nối lại, suy giảm, hết đường phục hồi), mỗi trạng thái một lời và một lối thoát. Bản vẽ của ta có 5 trạng thái nhưng chưa tách "đang kết nối lại" và "suy giảm hoặc cũ".
4. **Một hộp xác nhận duy nhất**, mở sẵn tiêu điểm ở xác nhận, Enter xác nhận, Esc hủy. Thẻ duyệt và hộp xác nhận checkpoint của ta nên dùng chung một thành phần.
5. **"Một cử chỉ hủy chỉ làm một việc"** cho phím Esc: áp dụng cho thẻ duyệt, hộp checkpoint, lớp phủ thả của Khay.
6. **"Nội dung khách không tự mở gì"** hợp với Design Canvas (xuất HTML) và xem trước tài liệu: không cho mã sinh ra mở trình duyệt hay đường dẫn ngoài nếu chưa có hành động của người dùng.
7. **Thang có thứ tự cho mọi ranh giới** (bản runtime cũ so với mới, local so với remote): ghi quyền lực lỗi thì phải hiện hoặc hoàn lại. Hợp với việc Studio và `yana-rt` cập nhật theo đồng hồ riêng (như đã ghi ở màn Cập nhật).
8. **"Đề nghị, không chiếm quyền"** cho mọi thông báo nền.
9. **Bài kiểm trước khi giao** (mục 4): biến thành checklist cho phần ghép vào Studio.

## 6. Chưa kiểm

- Giao diện thật, bố cục, màu sắc, chuyển động của Hermes: chưa xem.
- Có bao nhiêu nguyên tắc trên được thực thi trong mã chứ không chỉ viết ra: chưa kiểm. Đây là tài liệu của họ, không phải bằng chứng hành vi.
- Mục chuyển động, token, nút, i18n trong `DESIGN.md` và toàn bộ `ENGINEERING.md`: chưa đọc.
- `electron/` (cầu nối, cập nhật, xác thực), `bootstrap-installer`: chưa đọc.
- Bản đang chạy trên máy (22/10) có thể khác bản mới nhất trên GitHub.
