# Ghi chú thiết kế: hệ thiết kế và bộ chọn mô hình của Hermes Agent

Đây là ghi chú về **cách họ thiết kế**, viết bằng lời của chúng ta. Không có đoạn mã nào được chép vào repo này. Bổ sung cho `hermes-agent-composer-design-notes.md` và `hermes-agent-app-map-notes.md`.

| Mục | Giá trị |
|---|---|
| Nguồn | https://github.com/NousResearch/hermes-agent, thư mục `apps/desktop` |
| Giấy phép | MIT (kiểm bằng GitHub API, 2026-10-31) |
| Bản đã đọc | Bản cục bộ đang chạy, commit `bf0203a794a07aac3ff764972ab9087baa4e4f4e` (2026-10-22). Chỉ đọc `apps/desktop`, không đọc `~/.hermes` ngoài kho mã |
| Cách đọc | Đọc tệp trên đĩa, không chạy mã, không gắn công cụ vào tiến trình |
| Đã đọc | `DESIGN.md` (gần như toàn bộ, trừ vài mục nhỏ), `ENGINEERING.md` (mục thang và nội dung khách), `lib/model-options.ts`, `app/shell/model-edit-submenu.tsx`, `use-model-menu-controller.ts`, `model-menu-row-decorations.tsx`, `model-menu-panel.tsx`, `reasoning-menu-panel.tsx`, đầu của `store/model-presets.ts`, `favorite-models.ts`, `model-visibility.ts`, `lib/model-status-label.ts`, ghi chú và hàm `ModelPrice` trong `model-catalog-menu.tsx` |
| Chưa đọc | `components/model-picker.tsx` (868 dòng), phần lớn `model-catalog-menu.tsx` (1488 dòng, chỉ đọc mục lục và vài đoạn), `settings/model-settings.tsx` (1637 dòng), `store/model-pricing.ts`, `model-assignment.ts`, `custom-models.ts`, `local-model-offer.ts`, phần `api/models.ts`, giao diện thật (chưa chạy, chưa xem ảnh) |

Muốn dùng lại mã của họ thì phải làm bước riêng: giữ nguyên thông báo bản quyền, kèm LICENSE, ghi chỗ đã sửa, thêm vào `ACKNOWLEDGEMENTS.md`. Tên, logo, hình ảnh không dùng.

## 1. Hợp đồng của hệ thiết kế (DESIGN.md)

**Quy tắc gốc:** một nguồn cho một việc, token thay vì giá trị thô, phẳng thay vì đóng khung. Nếu định dùng màu thô, bóng riêng, nút riêng hay `px-*` cứng trên một điều khiển thì dừng lại, vì đã có thành phần cho nó. Tài liệu có hai loại nội dung: **nguyên tắc** (bền) và **hợp đồng có tên** (token, biến thể nút, tên thành phần). Hợp đồng có tên được bảo trì cùng mã: đổi một thành phần, token hay biến thể thì cập nhật mục của nó trong cùng thay đổi, vì tên cũ còn sót lại là một lỗi như kiểu dữ liệu cũ.

**Nút, một thành phần duy nhất.** Chọn biến thể và cỡ, không truyền chiều cao, padding hay cỡ biểu tượng.
- Biến thể: chính, hủy hoại, phụ (nền nhạt, mặc định cho nút không chính), viền (trong suốt, một vòng 1px, không nền, không bóng), trong suốt, nổi (điều khiển rời khỏi mọi bề mặt, nền đặc cùng bóng, chỉ nâng biểu tượng khi rê), liên kết, chữ trần (cho "Hủy", "Xóa"), chữ đậm gạch chân (cho "Đổi", "Mở nhật ký"), tay nắm (ngăn kéo, không nền).
- Cỡ: mặc định, nhỏ, rất nhỏ, lớn, sát chữ (không hộp, dùng trong tiêu đề hay câu), vi mô (cuối bảng), và họ biểu tượng.
- Nút chữ vuông (không bo), cỡ theo padding và chiều cao dòng; chỉ nút biểu tượng mang bo 4px dùng chung.

**Chú giải (tooltip) chỉ khi rê chuột dạy thêm điều mới.** Không gắn cho nút mở menu (kebab, ⋯), nút đóng X, hay điều khiển mà nhãn đã nói rõ. Không bao giờ dùng thuộc tính `title` gốc của HTML trên nút (có test chặn). Thời gian: chờ 200ms trước lần mở đầu để cú quét chuột không để lại vệt, trong 300ms sau khi một chú giải đã mở thì cái kế tiếp mở ngay, mở ra không có hoạt ảnh, đóng mờ trong 100ms. Gợi ý phím tắt đọc từ bảng phím hiện hành, không bao giờ viết cứng.

**Huy hiệu một thành phần:** mặc định (nhạt theo màu chính), mờ, cảnh báo, hủy hoại, viền, đặc (cho số đếm ở góc biểu tượng).

**Biểu mẫu:** một hình dạng điều khiển dùng chung cho ô nhập, vùng văn bản và nút chọn. Ô tìm kiếm duy nhất, không viền hộp, gạch dưới khi tiêu điểm, danh sách rỗng thì ẩn ô tìm. **Điều khiển chọn phân đoạn** cho tập nhỏ loại trừ nhau, thay cho đống radio. Công tắc trần có nhãn truy cập, không bọc viền.

**Bố cục:** lề trang lấy từ hằng số dùng chung, không viết cứng. Overlay chia hai cột dùng thành phần chung, không dựng lại thanh tiêu đề. Cài đặt có nhãn điều hướng và nút mở nhánh tách rời nhau; cha luôn mở trang con đầu tiên theo thứ tự, không mở trang tổng quan hay trang con xem gần nhất. Hàng: phẳng, thụt lề đều, **không đường chia giữa các hàng** trừ khi thật cần (khi đó một đường mảnh duy nhất).

**Trạng thái:** không bao giờ hiện chữ "Loading...", dùng vòng tải chung (đường cong toán học). Lỗi dùng một thành phần lỗi duy nhất cho ranh giới React, lỗi trong hộp thoại và lỗi khởi động. Log luôn qua một thành phần log duy nhất. Trống thì có hai thành phần, không tự dựng cái thứ ba. **Xác nhận chỉ có một hộp**, mở sẵn tiêu điểm ở nút xác nhận, Enter xác nhận, Esc hủy, nút đường thứ ba nằm trong đúng một ô phụ.

**Chuyển động:**
- Cửa sổ nhìn thấy vẫn chuyển động khi app khác chiếm tiêu điểm; cửa sổ ẩn hoặc thu nhỏ có thể dừng.
- Chuyển tiếp nhanh và có chức năng (khoảng 100ms trên điều khiển); tôn trọng giảm chuyển động cho mọi thứ vượt quá mờ dần.
- **Rê chuột vẽ ngay lập tức, chỉ chiều quay về mới có độ trễ.** Đặt chuyển tiếp ở trạng thái nghỉ và bỏ nó khi đang rê.
- **Chuyển động đi theo trạng thái, không bao giờ làm trễ trạng thái.** Chọn, kéo, hủy, ấn phải vẽ ngay trong khung hình hiện tại.
- Không hoạt họa hình học bố cục bằng "transition-all" trên tương tác nóng. Gọi tên thuộc tính; nếu chuyển động đang che vấn đề hiệu năng thì bỏ chuyển động.
- Số đếm nguyên có hoạt họa cập nhật thẳng vào DOM, không vẽ lại React mỗi khung.

**Thao tác trực tiếp và hiệu năng:** vẽ trước, lưu sau, hoàn lại thấy được khi lỗi. Mỗi vùng thả có một chủ hình ảnh, và các mục tiêu thả dùng cùng một ngôn ngữ cho tệp, phiên, tab, khung. Vùng thả chồng nhau chọn mục tiêu đang hoạt động thay vì xếp chồng lớp phủ. Hình học bao dung tốt hơn điểm kích hoạt chính xác từng pixel.

**Bề mặt nổi:** bóng nhiều lớp theo hướng đổ xuống cộng một đường mảnh thích ứng với giao diện, không viền dày. Mọi danh sách nổi (menu, chọn, popover) dùng cùng một cách vẽ. Ô nhập có gợi ý dùng combobox, **không bao giờ** `<input list>` (trình duyệt vẽ thành cửa sổ hệ điều hành riêng).

**Xếp lớp (z-index):** một thang có tên (nền hộp thoại, hộp thoại, popover trên hộp thoại, trên cả hộp thoại cho toast và tooltip, bộ chuyển phiên, rồi chuỗi khởi động: kết nối, giới thiệu, cài đặt, sự cố). Không dùng số z tùy ý giữa các thành phần.

**Hàng đợi thẻ duyệt (rất liên quan Yana):** một ngăn xếp thẻ nhận danh sách sống có khóa, giữ thẻ hiện tại khi có thêm thẻ đến, dùng chung cho duyệt ngay trong dòng, duyệt nổi và cả hai kiểu toast. Cử chỉ **không bao giờ cấp quyền duyệt**. Thẻ rời đi lập tức vô hiệu. Một "chủ" duy nhất ở mức bản ghi hội thoại giữ các duyệt, độc lập với hàng công cụ và ranh giới tin nhắn. Duyệt có thể đến trước khi công cụ bắt đầu, và việc thực thi không được dời hay gắn lại ngăn xếp. Giảm chuyển động thì lắng ngay không để lại khoảng trống.

**Bề mặt khác đáng chú ý:**
- Tin nhắn người dùng dính trên đầu cắt phần nội dung cuộn bị che, chỉ bong bóng bo tròn mới có nền.
- Hàng công cụ **chỉ dùng đỏ cho lỗi tường minh**; đường đọc thiếu và exit 1 mơ hồ dùng thông báo trung tính, chi tiết vẫn mở được. Lỗi mô tả trong dữ liệu trả về không phải lỗi công cụ.
- Bộ cuộn lồng nhau trả cuộn dọc về luồng chính ở mép; chỉ luồng ngoài cùng chứa cuộn quá đà.
- Nhóm trạng thái trên thanh soạn thu gọn mặc định (trừ danh sách việc), lựa chọn mở được giữ qua cập nhật tiến độ; lựa chọn ẩn lưu **theo hội thoại**, không toàn cục.
- Hộp mật khẩu sudo giữ nền không mờ, hiện **đủ lệnh có thể chọn** trước ô mật khẩu; thiếu ngữ cảnh backend thì nói rõ, không suy từ hàng công cụ khác.
- Màn khởi động có trang riêng, vòng tải chung, **không bịa tiến độ**, không trễ trạng thái sẵn sàng vì chuyển động, không thay hội thoại đang tiếp tục bằng lời chào mới.
- Cỡ chữ chat là một hệ số riêng (110% mặc định) tách khỏi thu phóng cửa sổ.

**Bộ biểu tượng:** một bộ chính cho giao diện, một bộ gọn cho editor và trạng thái; không thêm bộ thứ ba, không trộn kiểu trong một nhóm điều khiển. Không dùng biểu tượng sao lấp lánh trang trí.

**i18n:** mọi chuỗi qua một hàm, không chữ cứng trong JSX. **Cập nhật mọi ngôn ngữ cùng lúc**, vì một chuỗi chỉ đổi ở tiếng Anh là lỗi hồi quy (dấu câu lệch, nhãn cũ). Ngôn ngữ đầy đủ thì thiếu khóa làm hỏng kiểm tra kiểu; ngôn ngữ thưa rơi về tiếng Anh.

**Danh sách kiểm trước khi thêm gì:** tái dùng thành phần có sẵn, chỉ dùng token, không ghi đè kích thước của thành phần, chú giải đúng chỗ, không `title` gốc, gợi ý phím qua bảng phím, bề mặt nổi dùng cặp bóng và đường mảnh, phẳng, không tự điều hướng hay chiếm tiêu điểm từ sự kiện nền, vẽ trước hoàn lại khi lỗi, tương tác nóng không đăng ký rộng, Esc làm đúng một việc, mọi ngôn ngữ cập nhật, và nếu chạm một thành phần thì cập nhật mục hợp đồng của nó.

## 2. Bộ chọn mô hình, mổ chi tiết

**Mô hình điều khiển.** Menu chọn mô hình chỉ **vẽ và điều hướng**; một **bộ điều khiển** quyết định mỗi lần sửa nghĩa là gì: ghi vào phiên đang sống, hay chỉ giữ giá trị trong hộp thoại (như ghi đè riêng cho một tác vụ). Cùng một menu con lái được cả phiên chat lẫn ghi đè tách rời. Viên chọn mô hình và viên mức suy luận dùng chung một bộ điều khiển.

**Khả năng theo từng mô hình, do danh mục báo.** Danh mục cho biết mô hình có suy luận không, có tắt được không, có chế độ nhanh không, có chế độ "cực nhanh" không. Khi danh mục chưa tải xong, **mặc định coi là có suy luận** để điều khiển không nhấp nháy rồi biến mất. Điều khiển không có khả năng thì **ẩn**, không hiện nút không làm gì.

**Lựa chọn dính.** Một cặp (nhà cung cấp, mô hình) đã chọn **không bao giờ bị dịch chuyển vì danh mục không chứa nó.** Hàng trong bộ chọn chỉ là gợi ý (danh sách được phát hiện, được tuyển chọn, bị cắt); một endpoint tùy chỉnh hay bản phát hành mới hợp lệ khi phục vụ id mà hàng không có. Tự đối chiếu lựa chọn với danh mục từng làm một id hợp lệ bị thay bằng anh em gần tên của nó. **Quyền duy nhất về tính hợp lệ là kết quả đổi mô hình của cổng.** Có đúng một ngoại lệ có chủ ý (nhà cung cấp ảo `moa`, biến mất khỏi danh mục khi không còn cấu hình nào bật), và có một trường hợp tên cũ của nhà cung cấp tùy chỉnh (tên trần so với dạng `custom:<khóa>`) bị coi là cùng một endpoint để không mất cấu hình đi kèm.

**Một cặp đầy đủ, không trộn trường.** Khi chọn cái đang là "hiện tại", luôn lấy **một cặp hoàn chỉnh** từ một nguồn (phiên hoặc danh mục), không bao giờ ghép mô hình của nguồn này với nhà cung cấp của nguồn kia.

**Preset theo từng mô hình, nhớ toàn cục.** Khóa là `nhà cung cấp::mô hình`. Chọn một mô hình thì **áp lại mức suy luận và chế độ nhanh đã nhớ** lên phiên. Sửa tùy chọn của hàng **không phải mô hình đang dùng** chỉ ghi preset, không đổi mô hình và không ghi vào phiên. Mỗi sửa đổi có một dấu thế hệ riêng, nên một lần ghi thất bại chỉ hoàn lại khi **không có lần sửa mới hơn** cho cùng chiều (mức suy luận hay tốc độ), và chỉ hoàn lại nếu giá trị hiện tại vẫn là giá trị của chính lần ghi đó.

**"Nhanh" có hai cơ chế khác nhau.** Hoặc là tham số tốc độ trong yêu cầu, hoặc là một **mô hình anh em có hậu tố `-fast`** chọn qua trường mô hình. Gia đình mô hình (bản gốc và bản nhanh) được **gộp thành một hàng**. Nếu một phiên còn mang tham số nhanh từ mô hình trước mà mô hình hiện tại không có, vẫn hiện công tắc để **tắt** nó thay vì để mắc kẹt, kèm dòng "dùng tốc độ chuẩn".

**Thinking là một công tắc, mức là radio.** Công tắc "Suy nghĩ" sở hữu trạng thái tắt; nhóm radio chỉ có các mức thật. Công tắc bị ẩn nếu mô hình không cho tắt (tuyến buộc suy luận). Mức bị ép được ghi ngay trên hàng radio ("... (gửi ở mức X trên tuyến này)").

**Yêu thích (ngôi sao).** Sắp theo thời điểm gắn sao (gắn trước hiện trước). Chỉ định hình **thứ tự trong dropdown này**, không đổi danh mục của backend. Khóa của mô hình mà danh mục hiện tại không còn **vẫn được giữ**, nó trở lại khi nhà cung cấp trở lại.

**Hiển thị và rút gọn.** Mặc định hiện tối đa 50 mô hình mỗi nhà cung cấp trước khi người dùng tùy chỉnh. Có **ảnh chụp "đã biết"**: mô hình xuất hiện sau lần tùy chỉnh cuối rơi vào quy tắc mặc định, thay vì bị ẩn. Có dấu riêng cho trường hợp người dùng chủ ý ẩn **toàn bộ** mô hình của một nhà cung cấp, để không tự thêm lại mặc định.

**Tìm kiếm.** Thu gọn thì hiện các mô hình người dùng chọn (hoặc mặc định tuyển chọn); **gõ chữ thì tìm trên mọi mô hình**, và **không giới hạn số kết quả** mỗi nhà cung cấp vì tìm đã là hành động thu hẹp. Dấu gạch ngang, chấm, gạch dưới và khoảng trắng coi như nhau; giữ nguyên chính tả gốc trong phần tô đậm; id mô hình **không qua kiểm tra chính tả**.

**Giá trên mỗi hàng, chỉ khi nhà cung cấp gửi.** Dạng gọn `giá vào/giá ra` mỗi triệu token, thêm giá đọc từ bộ nhớ đệm nếu có, "miễn phí", và nhãn giảm giá. Giá thiếu thì **không vẽ gì**, không vẽ "null/null" hay hai dấu gạch ngang thay cho số.

**Giới hạn dùng.** Nhà cung cấp bị giới hạn vẫn chọn được. Trường hợp cả tài khoản hết thì làm mờ mọi hàng, tiêu đề nhóm nói lý do; trường hợp theo mô hình thì chỉ làm mờ và gắn thời điểm mở lại cho hàng đang nguội, để hàng anh em hiện ra như lối làm tiếp. **Hàng đang chọn luôn sáng** để lựa chọn vẫn đọc được. Với gói theo cửa sổ thời gian, mục gợi ý của gói dẫn đầu ("Khuyên dùng"), phần còn lại dưới "Mô hình khác".

**Chip.** Chip **đặc** nói mô hình **là gì** (biến thể); chip **viền** nói hàng này **đang đặt thế nào** (nhanh, mức). Hai loại sự thật khác nhau nhìn khác nhau.

**Mô hình cục bộ đang tải.** Hiện sẵn, **vô hiệu hóa**, kèm tiến độ byte cùng như màn Mô hình cục bộ. Phần trăm được chọn **ngay ở từng hàng** để nhịp 700ms chỉ vẽ lại lá đó, không vẽ lại cả menu.

**Đổi sang mô hình đắt phải xác nhận** (đã ghi ở ghi chú thanh soạn).

**Tên nhà cung cấp chuẩn hóa.** Id OAuth **khác** id khóa API trực tiếp, để một phiên chạy bằng đăng nhập không bao giờ hiện như đường khóa thường; **tên tuyến nội bộ không bao giờ vào chữ người dùng thấy.**

**Mở rộng bằng plugin.** Mỗi hàng chỉ có hai khe cố định: biểu tượng dẫn đầu (hộp 1rem) và huy hiệu cuối. Plugin chỉ điền hai khe; lõi giữ hàng, tên, chip, ngôi sao, menu con và nghĩa của một cú bấm. Bộ trang trí ném lỗi hay trả giá trị rác thì **bị bỏ qua**, ranh giới lỗi riêng chỉ làm trống biểu tượng của nó, không làm hỏng hàng hay menu.

**Hiệu năng.** Thân menu con của từng hàng **không được vẽ cho tới khi hàng đó thực sự mở**, vì vẽ sẵn cho mọi hàng làm chính việc mở menu bị trễ trên danh mục lớn. Nhà cung cấp Nous: đọc lại mỗi lần mở (hiện bản nhớ đệm ngay, thay bằng bản mới khi về); khi giá còn "đang chờ" thì đọc lại vài lần, **có giới hạn khoảng 10 giây**, và không bao giờ thăm dò vô hạn.

**Định tuyến yêu cầu danh mục.** Menu của một ô không được hỏi ổ cắm chung của khung; **không bao giờ khôi phục qua REST chung** cho yêu cầu đã định tuyến theo chủ, vì tên hồ sơ không duy nhất giữa các nguồn và có thể lưu danh mục của B dưới ô của A. Chỉ yêu cầu thuộc ổ cắm chung mới được dùng đường khôi phục tương thích.

## 3. So với hệ token của Yana (bản vẽ hiện tại)

**Đã khớp:** một màu mực với các bậc độ trong suốt; bề mặt tăng dần (canvas, inset, card, menu, control); đường mảnh thay bóng dày; màu chỉ dành cho trạng thái nghĩa; tôn trọng giảm chuyển động.

**Thiếu so với họ (nên thêm vào chuẩn của Yana):**
- Thang **z-index có tên**; cặp token **bề mặt nổi** (bóng cộng đường mảnh) riêng cho overlay và menu.
- **Một thành phần nút** với tập biến thể và cỡ có tên; **một huy hiệu**; **một ô tìm kiếm**; **điều khiển phân đoạn**; **hàng danh sách**; **hộp xác nhận duy nhất**; thành phần **trống, lỗi, nhật ký** duy nhất.
- Quy tắc **chú giải** (200ms, 300ms ấm, 100ms thoát, không gắn cho nút menu và nút đóng, không `title` gốc).
- Quy tắc **chuyển động**: rê vẽ ngay, chuyển động đi theo trạng thái, không `transition-all`, tên thuộc tính.
- Quy tắc **i18n**: mọi ngôn ngữ cập nhật cùng lúc.
- Một **danh sách kiểm** và quy tắc "đổi thành phần thì cập nhật hợp đồng cùng thay đổi".

**Khác biệt có chủ ý của Yana (giữ):** Yana ghi "không dùng vòng xoay" và dùng nhịp bước rời rạc, trong khi họ dùng vòng tải hoạt họa. Hai lựa chọn đều hợp lệ; của Yana hợp với chuyển động có thể dự đoán và giảm chuyển động.

## 4. Điều quan trọng về `yana-rt` hiện tại

Trong `src/chat/gen_options.rs`, `yana-rt` **cố ý không hỗ trợ mức suy luận**, và lý do ghi ngay trong tệp: cách một mô hình nhận mức suy luận khác nhau theo nhà cung cấp và theo mô hình, gửi sai thì API trả lỗi, nên nó "chưa có" cho tới khi kiểm được theo từng mô hình. Hiện runtime chỉ nhận **giới hạn token** và **nhiệt độ** cho mỗi lượt. `ModelInfo` mới có id, độ dài ngữ cảnh, dung lượng và lượng tử hóa; **chưa có khả năng theo mô hình** (suy luận, tắt được, nhanh). Danh sách `capability` của nhà cung cấp đến từ `supports_vision` và `supports_tool_calling`.

Nghĩa là viên "High/Max" kiểu Hermes **không thể làm đúng trong Studio nếu chỉ làm giao diện**: cần phía runtime có bảng khả năng theo mô hình, thang mức, quy tắc ép về mức yếu hơn gần nhất, và mức thực gửi báo ngược lại. Đây chính là bài học Hermes đã trả giá (bảng viết tay từng làm lộ mức mới ra cho đường không hỗ trợ). Yana đã gặp đúng chỗ đó và chọn dừng, một lựa chọn đúng.

## 5. Phần "hơn thế nữa" cho Yana (Hermes không có)

Đây là suy luận của em từ nguyên tắc Yana, chưa kiểm với runtime:
- **Mỗi hàng mô hình nói rõ dữ liệu có rời máy không:** cục bộ hay đám mây, gửi tới nhà cung cấp nào. Yana có 6 runtime cục bộ nên đây là điểm khác biệt thật.
- **Đổi từ cục bộ sang đám mây là một quyết định có xác nhận,** vì dữ liệu bắt đầu rời máy. Khung xác nhận của Hermes chỉ lo chi phí; Yana thêm chiều quyền riêng tư.
- **Mô hình có được phép dùng hay không** theo lease và chính sách hiện hành, hiện rõ trạng thái "bị chặn" kèm lý do, không ẩn.
- **Ghi việc đổi mô hình vào sổ cái** (ai đổi, từ gì sang gì, lúc nào), vì đổi mô hình thay đổi nơi dữ liệu đi.
- **Cảnh báo khi mô hình không nhận ảnh** ngay trên hàng (đã có trong headless: từ chối với lỗi rõ ràng), để người dùng biết trước khi gửi.
- **Khả năng thật hay "chưa biết":** nếu `yana-rt` chưa báo khả năng của một mô hình thì hàng ghi "chưa biết", không giả vờ có hay không (cùng tinh thần với giới hạn đã công bố của Yana).

## 6. Chưa kiểm

- Giao diện thật của Hermes: chưa xem, mọi nhận xét về hình dạng là suy ra từ mã và tài liệu.
- Tài liệu của họ là điều **họ viết cho mình**; em chưa kiểm xem mã thực thi đúng mọi điều ghi (ví dụ quy tắc `-fast`, thời gian chú giải).
- Phần lớn `model-catalog-menu.tsx` và toàn bộ `model-picker.tsx`, `model-settings.tsx`: chưa đọc, nên có thể còn quy tắc khác.
- Mục 5 là đề xuất, chưa kiểm khả thi ở phía runtime.
