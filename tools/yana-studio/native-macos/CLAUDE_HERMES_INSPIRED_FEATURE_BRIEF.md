# Yana Studio — brief cải tiến từ các ảnh tham khảo Hermes

## Mục đích

Hoàn thiện các khu vực Settings, Model routing và điều hướng chat của **Yana Studio**.
Các ảnh Hermes chỉ là tham khảo về phạm vi tính năng và cách tổ chức; không sao chép
mã nguồn, icon, artwork, text, tên sản phẩm, bố cục pixel-perfect hoặc nhận diện của Hermes.
Thiết kế lại theo nhận diện Yana: tối giản, local-first, liquid glass có thể điều chỉnh,
rõ trạng thái và dễ đọc ở cả giao diện sáng/tối.

## Nguyên tắc bắt buộc

1. Audit code hiện có trước: provider, model picker, chat composer, persistence, secure
   storage, runtime, settings và i18n. Tái sử dụng state/component thay vì tạo hai nguồn
   cấu hình.
2. Không có setting giả. Chỉ hiển thị điều khiển khi đã có backend thật; nếu chưa hỗ trợ,
   hiển thị `Chưa khả dụng` kèm mô tả và không lưu giá trị như thể nó đã chạy.
3. Không lưu API key, OAuth token hay mật khẩu trong renderer hoặc file cấu hình thường.
   Dùng Keychain/secure storage hiện có; không tự cấp quyền tool hay gửi dữ liệu ra ngoài.
4. Tất cả setting chạy thật phải lưu local, khởi động lại vẫn còn, có reset về mặc định,
   validation, trạng thái loading/error và test tương ứng.
5. Hỗ trợ đầy đủ Vietnamese, English và Korean; cùng một key i18n, không để bản dịch bị
   lệch nội dung hay thiếu giao diện.
6. Kiểm tra màn hình hẹp, dark/light, giảm chuyển động, bàn phím và accessibility trước
   khi kết luận phần nào hoàn thành.

---

## A. Điều hướng chat: mũi tên lên/xuống

Thêm thanh điều hướng nổi gọn trong vùng chat:

- Nút `Lên đầu cuộc trò chuyện` và `Xuống tin mới nhất`; dùng icon có nhãn accessibility
  và tooltip.
- Nút xuống xuất hiện khi người dùng đã cuộn cách đáy khoảng 120px; bấm sẽ `smooth scroll`
  đến tin mới nhất.
- Khi đang đọc tin cũ, tin mới đến không được tự kéo màn hình xuống. Hiện badge số tin chưa đọc
  trên nút xuống; bấm nút thì đánh dấu đã đọc.
- Nút lên chỉ hiện khi đã rời đầu chat một khoảng hợp lý; hỗ trợ Home/End và reduced motion.
- Không che composer, nút stop generation, menu message hoặc nội dung code trên màn hình nhỏ.

---

## B. Appearance: theme, typography và liquid glass

Tạo trang `Giao diện` thật sự hữu dụng:

- Chọn ngôn ngữ VI/EN/KO.
- Theme Light / Dark / System, danh sách palette/theme do Yana định nghĩa; không dùng theme
  có bản quyền của bên khác.
- UI scale, chat font, terminal font, mật độ danh sách session và vị trí các app actions.
- Khối `Liquid Glass / Window translucency` có preview tức thời và các biến độc lập:
  - độ trong nền (tint/opacity), blur, saturation, brightness;
  - độ đậm lớp frost, border highlight, shadow, noise/grain;
  - vùng áp dụng: toàn app / sidebar / panel;
  - preset `Tắt`, `Nhẹ`, `Kính`, `Trong sâu`;
  - ở mức thấp nhất phải trở về giao diện đặc, dễ đọc; ở mức cao nhất là kính trong có blur
    sâu nhưng text vẫn đạt tương phản đọc được.
- Các hiệu ứng tùy chọn có thể bật/tắt: backdrop chat, intro splash, floating composer,
  reactions, tips, guided tour, hiệu ứng cảm ơn/heart. Không thêm mascot/pet nếu chưa có
  asset và behavior thật của Yana.
- Tôn trọng `Reduce Transparency` và `Reduce Motion` của macOS; không làm giảm khả năng đọc.

---

## C. Model & Routing

Tạo trang `Mô hình & Điều phối` với chức năng thực:

### 1. Mô hình mặc định

- Chọn `Auto` hoặc provider + model làm mô hình mặc định.
- Có CTA thiết lập provider khi chưa có provider hợp lệ.
- Chọn reasoning effort mà provider/model đó thực sự hỗ trợ.
- Ghi rõ thay đổi áp dụng cho chat mới; chat đang mở đổi model qua model picker trong composer.

### 2. Mô hình phụ trợ

Cho phép từng tác vụ dùng `Dùng mô hình chính` hoặc model riêng:

- Phân tích ảnh.
- Nén context.
- Tìm kiếm skills.
- Phê duyệt thông minh.
- Định tuyến MCP.
- Tạo tiêu đề chat.
- Code review.
- Triage/specification.
- Tách công việc Kanban.
- Mô tả hồ sơ.
- Curator/review mức sử dụng skill.

Có `Đặt lại tất cả về mô hình chính`. Một mục chỉ xuất hiện nếu Yana có luồng backend tương
ứng; không cấu hình routing mà không có nơi sử dụng.

### 3. Mixture of Agents

Tạo tính năng này chỉ khi routing đa model đã hoạt động thật:

- Tạo, đổi tên, bật/tắt, chọn mặc định và xóa preset có xác nhận.
- Thêm/xóa/bật/tắt reference models.
- Chọn aggregator model để tổng hợp kết quả.
- Context window: `Auto` hoặc số tùy chỉnh, validate theo model được chọn.
- Fallback models theo thứ tự. Chỉ fallback khi lỗi có thể retry; hiển thị model nào đã chạy
  và nguyên nhân fallback trong activity/log an toàn.
- Chặn preset invalid: provider chưa kết nối, model không tồn tại, aggregator trùng/không
  tương thích, context vượt giới hạn, hoặc không có reference model đang bật.

---

## D. Providers, accounts và local models

Tổ chức lại Settings theo nhóm rõ ràng:

- `Providers / Accounts`: kết nối OAuth hoặc API key bằng luồng thật, trạng thái connected,
  reconnect, disconnect và xóa credential khỏi secure storage khi người dùng xác nhận.
- `Local Models`: phát hiện cấu hình máy, runtime local, dung lượng download, model tương thích,
  import model file và trạng thái tải. Không hiển thị nút Download/Install nếu backend download
  chưa tồn tại.
- `Custom endpoints`, `Gateways`, `API keys`: validate URL/schema, che bí mật, test connection
  có timeout và thông báo lỗi không lộ secret.
- Không biến GitHub/Google login thành quyền repository hay Gmail. Phân tách rõ nhận diện hồ sơ
  và quyền connector; mọi scope phải hiện trước khi xin quyền.

---

## E. Notifications

Tạo Notification Settings chỉ gồm thông báo thực tế Yana có thể phát:

- Bật/tắt toàn bộ thông báo hệ điều hành.
- Bật/tắt riêng: cần phê duyệt, cần input, response sẵn sàng, turn lỗi, tác vụ nền hoàn tất,
  thay đổi credential/quyền quan trọng.
- Chọn âm báo hoàn tất, nút preview và test notification.
- Giải thích notification chỉ gửi khi app ở nền nếu đó là hành vi thật.
- Xin quyền macOS đúng lúc và có trạng thái khi người dùng đã từ chối.

---

## F. Memory & Context

Chỉ thêm nếu Yana có implementation tương ứng:

- Bật/tắt persistent memory và user profile local.
- Memory budget, profile budget, engine/context strategy.
- Auto-compression, threshold, compression target và số tin gần đây được bảo vệ.
- Trang xem/xóa từng memory, clear all có xác nhận, export local nếu đã hỗ trợ.
- Nêu rõ memory nằm local, dữ liệu nào được gửi provider theo từng turn và cách tắt.

---

## G. Voice

Tổ chức lựa chọn voice theo năng lực thực tế:

- Voice mode, speech-to-text, echo transcript, đọc phản hồi thành tiếng, voice và shortcut.
- Hiển thị provider cần thiết, yêu cầu quyền microphone, giới hạn ghi âm và mức chi phí nếu
  provider có tính phí.
- Không hiển thị GPT-Live/Edge TTS như đã hoạt động nếu chưa có provider/backend thật.
- Tắt voice phải dừng microphone/session đang chạy và không tiếp tục ghi âm nền.

---

## H. Advanced

Đưa các setting kỹ thuật vào nhóm `Nâng cao`, không làm người dùng thường gặp khó:

- Giữ máy thức khi runtime đang chạy.
- Số backend warm, idle timeout, command timeout, retry, giới hạn output/file/line,
  checkpoint, agent/subagent limits và parallelism.
- Execution backend local/container chỉ khi Yana có implementation; có cảnh báo rủi ro và
  validation trước khi lưu.
- Chọn mô hình subagent, provider, effort và update policy khi có routing thật.
- Mọi giá trị số phải có min/max/unit/default/reset; không nhận input tùy ý gây treo app.

---

## I. Chất lượng UX

- Settings sidebar có search, nhóm rõ ràng và deep-link tới từng phần.
- Desktop màn rộng dùng hai cột hợp lý; màn hẹp xếp một cột, không có vùng trống khổng lồ.
- Các switch, select, slider, button có label, keyboard focus, tooltip và disabled reason.
- Đừng bê UI Hermes: dùng spacing, iconography, palette và liquid glass riêng của Yana.
- Không tạo màn setting dày đặc chỉ để “trông nhiều tính năng”; ưu tiên các capability hoạt động
  thật, và tách advanced khỏi thiết lập cơ bản.

## Tiêu chí bàn giao

1. Liệt kê mapping từng mục ở trên -> file/component/backend dùng thật.
2. Nêu rõ các mục đã chạy, mục chưa có backend nên đang ẩn hoặc disabled, không tuyên bố chung chung.
3. Thêm test cho persistence, validation, reset, routing/fallback, notification permission và
   chat scroll navigation nếu có test harness phù hợp.
4. Chạy typecheck/lint/test/build đang có; đưa output thực tế và các lỗi còn lại.
5. Không reset/stage/xóa thay đổi ngoài phạm vi; không commit hay push nếu chưa có xác nhận riêng.
