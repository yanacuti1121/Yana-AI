# Sách hướng dẫn sử dụng Yana Studio

Dành cho người mới, đọc từ trên xuống là dùng được. Trang này nằm ngay trong app: mở lại bất cứ lúc nào bằng **Cmd+Shift+P**, gõ **Yana: Open Guide**, hoặc bấm thẻ **User guide** ở trang chủ Yana.

> **Ba điều cần nhớ trước khi làm gì khác:**
> 1. Yana **không tự ghi file hay chạy lệnh**. Mỗi lần nó muốn làm, nó dừng lại và hỏi anh. Anh bấm **Approve** thì nó làm, bấm **Deny** thì không.
> 2. Anh cần **một model để Yana suy nghĩ**: hoặc model chạy trên máy (Ollama, miễn phí), hoặc model đám mây có **API key** (tính tiền theo lượt dùng).
> 3. Gặp màn hình lạ hay không biết làm gì: quay về mục **Xử lý sự cố** ở cuối trang này.

## 1. Bản đồ màn hình

```
Từ trái sang phải:

[1] Thanh icon  ->  [2] Cột Yana  ->  [3] Vùng giữa  ->  [4] Khung chat

Dưới cùng, chạy suốt chiều ngang:  [5] Thanh trạng thái
```

1. **Thanh icon**: dải biểu tượng nhỏ sát mép trái. Biểu tượng con thỏ mở cột Yana.
2. **Cột Yana**: mọi thứ của Yana, xếp thành từng nhóm.
3. **Vùng giữa**: nơi các tab mở ra (Trang chủ, Canvas, Tasks, Settings, file code).
4. **Khung chat "Yana AI"**: bên phải, nơi anh nói chuyện và giao việc.
5. **Thanh trạng thái**: dải dưới cùng, cho biết Yana có sẵn sàng không.

| Chỗ nào | Có gì | Dùng để |
|---|---|---|
| **Khung chat bên phải** (tên "Yana AI") | Ô nhập, nút gửi, chọn model, nút Key, các cuộc trò chuyện | Nói chuyện và giao việc cho Yana |
| **Cột Yana bên trái** (bấm biểu tượng con thỏ trên thanh icon) | Start, Conversations, Models & Runtime, Project, Tasks, Governance, Tools, System | Mọi thứ của Yana, xếp thành từng nhóm |
| **Vùng giữa** | Các tab: Yana Home, Design Canvas, Tasks, Permissions, Settings, và file code | Màn hình làm việc lớn |
| **Thanh trên của khung chat** | Biểu tượng nhà (Trang chủ), dấu cộng (cuộc trò chuyện mới), bánh răng (Cài đặt), đồng hồ (lịch sử) | Đi nhanh |
| **Thanh trạng thái dưới cùng** | Phiên bản yana-rt, chính sách (SUPERVISED = có giám sát), số mục kiểm toán | Xem Yana có sẵn sàng không |

> **Mẹo:** Không tìm thấy gì thì mở **Trang chủ** (biểu tượng nhà ở khung chat, hoặc Cmd+Shift+P rồi gõ **Open Yana Home**). Trang chủ có nút dẫn tới hầu hết mọi thứ.

## 2. Lần đầu sử dụng: 5 bước

1. **Mở một thư mục dự án.** Trang chủ có nút **Open Folder**. Yana làm việc trong thư mục anh mở và không đụng tới chỗ khác.
2. **Tin cậy thư mục (nếu app hỏi).** Khi thấy thanh vàng "Restricted Mode", bấm **Manage** rồi **Trust**. Chưa tin cậy thì Yana từ chối làm việc, vì yana-rt có thể chạy lệnh trong thư mục này.
3. **Chọn model.** Ở khung chat bấm vào ô tên model (hiện dạng `ollama · default`), hoặc Cmd+Shift+P rồi gõ **Yana: Choose Provider and Model**. Danh sách có 19 nhà cung cấp, chia hai loại: chạy trên máy (ghi "On-device") và đám mây (ghi "No key" hoặc "key saved").
4. **Cho Yana một "bộ não":**
   - **Cách miễn phí, chạy trên máy:** cài và bật Ollama, chọn nhà cung cấp **Ollama**. Không cần key.
   - **Cách đám mây:** chọn nhà cung cấp (ví dụ Claude hoặc OpenAI), bấm nút **Key** ở khung chat, dán API key. Key được cất trong **Keychain** của máy, không hiện lại và không nằm trong file nào.
5. **Thử một câu.** Gõ "Xin chào, dự án này làm gì?" rồi Enter. Thấy chữ trả lời hiện dần là chạy được.

> **Quan trọng:** Nếu ở đầu khung chat thấy **No runtime** hoặc lỗi "yana-rt not found", thì chưa có phần chạy Yana. Xem mục 11.

## 3. Nói chuyện với Yana

| Việc | Cách làm |
|---|---|
| Gửi tin | Gõ vào ô rồi nhấn **Enter** (xuống dòng: **Shift+Enter**) |
| Dừng khi nó đang trả lời | Nút **Stop** thay cho nút gửi |
| Cuộc trò chuyện mới | Dấu **+** ở thanh trên khung chat, hoặc **Yana: New Conversation** |
| Xem và mở lại cuộc cũ | Biểu tượng đồng hồ, hoặc nhóm **Conversations** ở cột Yana, hoặc **Yana: Open Conversation…** |
| Đổi tên, xoá cuộc trò chuyện | Rê chuột vào cuộc trò chuyện ở cột Conversations rồi bấm biểu tượng bút hoặc thùng rác |
| Mở nhanh khung chat | **Cmd+L** (Windows và Linux: Ctrl+L) |
| Nhắc tên file | Gõ **@** rồi vài chữ của tên file, chọn trong danh sách gợi ý |
| Gửi ảnh | Bấm nút đính kèm hoặc kéo ảnh vào khung chat (chỉ dùng được nếu model hỗ trợ ảnh) |
| Làm slide trình chiếu | Gõ `/deck chủ đề của bài` rồi Enter: Yana nhờ model viết bài trình chiếu và khung chat hiển thị |

**Lịch sử được lưu theo từng thư mục dự án.** Mở dự án khác thì thấy danh sách khác. Tắt rồi mở lại app, các cuộc trò chuyện vẫn còn.

**Chế độ Plan và Act** (nút ở dưới ô nhập):
- **Act** là bình thường: Yana có thể xin sửa file hoặc chạy lệnh (vẫn phải chờ anh duyệt).
- **Plan** chỉ thêm một câu dặn model: "chỉ lập kế hoạch, đừng sửa file". Đây là lời dặn, **không phải khoá cứng**. Dù ở chế độ nào, Yana vẫn không thể ghi hay chạy lệnh nếu anh không duyệt.

**Trợ lý** (ô chọn trợ lý ở dưới ô nhập): có sẵn hai trợ lý mẫu là *Careful Reviewer* và *Fast Coder*. Chọn một trợ lý thì app **đổi nhà cung cấp và model** theo trợ lý đó. Các thiết lập khác trong trợ lý (hướng dẫn riêng, chế độ, công cụ cho phép) hiện **chưa có tác dụng**. Hai model mẫu có thể không còn khớp với tài khoản của anh, nếu báo lỗi thì chọn lại model ở ô model.

## 4. Duyệt hành động: phần quan trọng nhất

Khi Yana muốn **ghi file hoặc chạy lệnh**, nó dừng và hiện một thẻ **⚠ Approval needed** trong khung chat. Có đồng hồ đếm ngược: thẻ **hết hạn sau 30 phút** nếu anh không trả lời.

**Cách đọc thẻ:**

| Dòng trên thẻ | Nghĩa là gì |
|---|---|
| **Yana wants to use** `write_file` | Nó muốn tạo hoặc ghi đè một file |
| `patch_file` | Nó muốn sửa một chỗ trong file có sẵn (không ghi lại cả file) |
| `run_command` | Nó muốn chạy một lệnh |
| Dòng **Writing:** hay **Editing:** kèm đường dẫn | File nào sẽ bị đổi |
| Khối đỏ và xanh (nếu có) | Dòng đỏ có dấu **−** sẽ bị xoá, dòng xanh có dấu **+** sẽ được thêm. Dòng xám là ngữ cảnh. Chữ `exact` nghĩa là đoạn cần sửa khớp chính xác |
| **This write cannot be applied** | Yêu cầu không thể thực hiện (đường dẫn sai, file đã tồn tại...). Bấm **Deny** |

**Hai nút:**
- **Approve:** cho phép đúng một việc này. Việc sau phải duyệt lại, sự cho phép không "nhớ".
- **Deny:** từ chối, Yana được báo là bị từ chối và đổi cách làm.

**Trước khi bấm Approve, anh tự hỏi ba điều:** Đúng file chưa? Các dòng đỏ xanh có đúng ý mình không? Có chỗ nào lạ không (ví dụ nó đụng vào file cấu hình mình không nhờ)?

> **Quan trọng:** Phần hiện **đường dẫn và các dòng thay đổi** chỉ có khi dùng **yana-rt từ phiên bản 1.5.1 trở lên**. Với bản 1.5.0, thẻ chỉ ghi tên công cụ, không cho thấy file nào sẽ đổi, nên anh không nên duyệt "mù". Xem phiên bản yana-rt ở thanh trạng thái dưới cùng (dạng *Yana Runtime v1.5.1*).

**Sau khi anh duyệt ghi file, Yana tự giữ sẵn:**
- **Bản sao lưu** của file cũ, trong thư mục `.yana-ai/file-mutation-backups/` của dự án.
- **Biên nhận** ai đã cho phép việc gì: các tệp `authority-receipts.jsonl` và `execution-receipts.jsonl` trong thư mục `.yana-ai/`.
- **Kiểm tra lại** nội dung sau khi ghi, và báo trong dòng kết quả (ví dụ *wrote notes.txt (20 bytes, sha256 …), backup at …*).

**Muốn quay lại bản cũ:** hiện **chưa có nút hoàn tác**. Hãy mở thư mục `.yana-ai/file-mutation-backups/`, tìm file có tên và ngày giờ tương ứng, rồi chép đè lại. Với dự án dùng git, dùng **Source Control** của app để xem và hoàn tác thay đổi cũng được.

**Những file Yana không bao giờ được sửa:** file bí mật (`.env`, khoá `.pem`, `.key`), `.git`, và các tệp cấu hình quản trị của Yana. Nếu nó thử, yêu cầu bị từ chối ngay.

## 5. Design Canvas: để AI vẽ màn hình cho anh xem

Canvas là nơi anh **mô tả một màn hình bằng lời** và xem AI vẽ ra ngay trước mắt.

1. **Tạo mới:** Cmd+Shift+P rồi **Yana: New Design Canvas** (hoặc thẻ **Design Canvas** ở trang chủ). Một tab mới mở ra, lưu thành file `*.yana-canvas.json` trong dự án.
2. **Chọn model:** ô **Design model** ở bên trái. Cần một model có key, hoặc Ollama. Nếu thấy nhãn **Needs key**, bấm **Key** để dán key.
3. **Chọn khung hình:** **Desktop** hoặc **Phone**.
4. **Mô tả màn hình** ở ô dưới cùng, ví dụ *"Trang đăng nhập có ô email, ô mật khẩu và nút Đăng nhập"*, rồi bấm **Generate**.
5. **Xem AI vẽ:** màn hình hiện dần ở bên phải khi AI viết. Nhờ chỉnh bằng cách gõ yêu cầu mới (ví dụ *"đổi nút sang màu xanh"*), hoặc tạo **biến thể** để so sánh nhiều bản.
6. **Xuất ra file:** chỉ khi anh chọn nơi lưu trong hộp thoại thì mới có file mới. Canvas **không tự ghi** vào dự án.

> **An toàn:** AI vẽ trong một thư mục trống riêng ("Isolated design sandbox"), nên nó **không đọc và không sửa được file dự án** khi đang vẽ.

**Giao thiết kế cho Yana làm thành code:** có nút **Build this screen** gửi mô tả màn hình vào khung chat như một tin nhắn thường. Từ đó Yana đề xuất file, và mọi bước ghi file vẫn phải qua duyệt như mục 4.

**Studio Canvas (Component Editor):** lệnh **Yana: Studio Canvas (Component Editor)** mở trình chỉnh bằng tay kiểu kéo thả các thành phần (nút, ô nhập, thẻ...). Dùng khi muốn tự chỉnh từng chi tiết.

## 6. Công việc, quyền hạn và trí nhớ dự án

**Tasks (bảng việc):** **Yana: Open Tasks Board**, hoặc nhóm **Tasks** ở cột Yana.
- Tạo việc bằng nút **+** hoặc **Yana: New Task**.
- Đánh dấu xong: **bắt buộc ghi bằng chứng** (ví dụ "cargo test: 42 passed"). Không có bằng chứng thì không đóng được việc. Đây là chủ ý để khỏi báo "xong" suông.
- Một việc có thể **phụ thuộc** vào việc khác: việc bị chặn sẽ tự hiện trạng thái *blocked*.

**Permissions (quyền hạn):** **Yana: Open Permissions**.
- **Pending approvals:** các lệnh đang chờ anh duyệt mà chưa trả lời.
- **Leases (giấy phép có thời hạn):** cho Yana làm một loại việc cụ thể trong một khoảng thời gian ngắn mà không cần hỏi từng lần. Có ghi rõ hết hạn lúc nào. Anh có thể **thu hồi** bất cứ lúc nào.
- **Cẩn thận với lease:** nó bỏ qua bước hỏi từng lần cho loại việc đó. Chỉ cấp khi hiểu rõ, và để thời gian ngắn.

**Governance** (cột Yana): tổng hợp lệnh chờ duyệt, các lease đang có, và nhật ký kiểm toán gần đây. Mọi hành động của Yana đều được ghi vào **nhật ký kiểm toán có chuỗi băm**: ai sửa hay xoá một dòng thì chuỗi vỡ và bị phát hiện.

**Project Memory (trí nhớ dự án):** **Yana: Open Project Memory** mở một file ghi chú của dự án (`.yana-ai/project-memory.md`). Anh viết vào đó những điều Yana cần luôn nhớ về dự án này (quy ước, điều cấm kỵ, cách chạy thử). Nội dung được gửi kèm **mỗi cuộc trò chuyện mới**. Sửa file thì áp dụng cho cuộc trò chuyện **mới**, không đổi cuộc đang chạy.

**Lệnh ghim (Pinned commands):** nhóm **Project** ở cột Yana. **Pin Command** để lưu một lệnh hay dùng (ví dụ `cargo test`), sau đó **Run Pinned Command…** chạy bằng một lần bấm trong terminal.

## 7. Công cụ kiểm tra

Cmd+Shift+P rồi gõ **Yana: Run Tool…**, hoặc nhóm **Tools** ở cột Yana. Mỗi công cụ chạy trong terminal của app.

| Công cụ | Dùng để |
|---|---|
| **Doctor** | Kiểm tra máy có đủ thứ cần thiết không (Python, thư viện...). Có cảnh báo là bình thường, đọc dòng *Install:* để biết cách cài |
| **Scan Agent Setup** | Quét cấu hình AI của dự án tìm rủi ro bảo mật |
| **Hunt Vulnerabilities** | Tìm bí mật bị lộ, lỗi bảo mật, thư viện rủi ro. **Chạy nặng**, đừng bấm khi máy đang nóng |
| **Audit Score** | Chấm điểm an toàn của dự án |
| **Blast Radius Map** | Cho biết AI có thể chạm tới những gì |
| **CI Health** | Kiểm tra quy trình CI có sơ hở không |
| **Cost** | Xem số token đã dùng |

> **Không cần hoảng:** nhiều công cụ thoát với mã khác 0 khi **có phát hiện** (đó là kết quả, không phải lỗi). Điểm số thấp cũng thường do repo lớn, không có nghĩa app hỏng.

## 8. Cài đặt (bánh răng)

Mở bằng bánh răng ở khung chat, hoặc **Yana: Yana Settings**. Có các tab:

| Tab | Dùng để |
|---|---|
| **Models & Orchestration** | Chọn nhà cung cấp và model, lưu key, xem model chạy trên máy, chọn đường dẫn yana-rt |
| **Usage** | Số token đã dùng (do nhà cung cấp báo, không phải hoá đơn) |
| **Permissions** | Như mục 6 |
| **External Tools** | Các công cụ ngoài đã cài trên máy |
| **Yana Commands** | Danh sách lệnh của yana-rt, bấm để điền sẵn vào terminal (**không tự chạy**) |
| **Privacy & Data** | Dung lượng dữ liệu Yana lưu |

Các công tắc riêng của IDE nằm ở một màn khác: **Yana: Yana IDE Settings** (hoặc thẻ **Yana IDE settings** ở trang chủ). Ở đó anh chỉnh được:

- Có tự mở sách này ở lần đầu hay không, và nút **Show again at next start** để nó mở lại.
- Có tự mở Trang chủ khi khởi động hay không.
- Duyệt hành động của dự án đang mở: bật hay tắt, và nút **Turn on approvals in this project**.
- Trợ lý mặc định (hiện chỉ đổi nhà cung cấp và model).
- Độ dài trả lời tối đa (token) và nhiệt độ của model. Để trống là dùng mặc định của nhà cung cấp. Cần bản yana-rt mới biết các giá trị này; bản cũ sẽ bỏ qua và có cảnh báo.

**Chế độ Plan** (chuyển ở khung chat): với yana-rt mới, model chỉ được xem và mô tả kế hoạch, không chạy lệnh và không sửa file. Với yana-rt cũ, Plan chỉ là lời nhờ model, không có gì chặn thật.

Để xem **tình trạng thật** của các phần Yana trong thư mục đang mở, mở **Yana: Yana Control Center** (hoặc thẻ cùng tên ở trang chủ). Màn này chỉ đọc, gồm: Giám Thị (có khóa HALT không, đã cài chưa), runtime và các capability, bài tự kiểm cổng chặn lệnh nguy hiểm, sandbox (Docker có chạy không, đang ở chế độ cách ly nào), gói hook, skill, agent, luật của dự án, khóa lõi và chuỗi audit. Hai nút **Verify core lock** và **Verify audit chain** chạy kiểm tra đầy đủ khi anh bấm.

Những thứ chưa chạy được (giọng nói, chế độ Plan thật, độ dài trả lời, Discord) được liệt kê ở cuối màn đó với chữ **Not available yet**, và không có công tắc giả.

Màn cài đặt tự cập nhật khi anh đổi model hoặc key ở nơi khác.

## 9. Model và API key

- **19 nhà cung cấp**, chia hai loại: **Local** (Ollama, LM Studio, llama.cpp... chạy trên máy anh, riêng tư, miễn phí, nhưng nặng máy) và **Cloud** (Claude, OpenAI, Gemini, Groq... cần key, tính tiền, nhanh và thông minh hơn).
- **Key được lưu trong Keychain** của máy, không nằm trong file nào, không hiện lại, và **chỉ gửi tới đúng nhà cung cấp** của nó.
- **Xoá key:** trong nhóm **Models & Runtime** ở cột Yana, rê chuột vào nhà cung cấp rồi bấm biểu tượng thùng rác.
- **Tự đăng nhập bằng tài khoản ChatGPT hay Claude thuê bao:** **không làm được**. Nhà cung cấp chặn hoặc có rủi ro khoá tài khoản. Chỉ dùng API key.
- Dữ liệu anh gõ trong chat **đi tới nhà cung cấp anh chọn** (nếu là đám mây). Nội dung nhạy cảm thì chọn model chạy trên máy.
- **Auto model** và **Mixture of Agents** có trong cài đặt nhưng **chưa dùng được cho khung chat**.

## 10. An toàn và riêng tư

| Việc | Cách Yana xử lý |
|---|---|
| Ghi file, chạy lệnh | **Luôn hỏi anh trước**, từng lần một |
| Đọc file trong dự án | Được đọc, không cần hỏi (chỉ trong thư mục dự án, không ra ngoài) |
| Thư mục chưa tin cậy | Yana từ chối làm việc cho đến khi anh bấm Trust |
| File bí mật (`.env`, khoá, `.git`) | Không bao giờ được sửa |
| Lệnh nguy hiểm (`rm -rf`, force-push...) | Bị chặn, không cho duyệt |
| Ghi lại | Nhật ký kiểm toán có chuỗi băm, biên nhận từng quyết định |
| Dữ liệu | Hội thoại, trợ lý, cài đặt lưu **trên máy anh**. Chỉ nội dung chat (và ảnh anh đính kèm) đi tới model anh chọn |

**Mẹo an toàn:** khi một thẻ duyệt hiện ra mà anh **không nhờ việc đó**, bấm **Deny**. Sau đó nhìn lại tin nhắn cuối của mình xem có gì khiến Yana hiểu nhầm.

## 11. Xử lý sự cố

| Anh thấy | Nghĩa là | Cách xử lý |
|---|---|---|
| **yana-rt not found** hoặc **No runtime** | Chưa tìm thấy phần chạy Yana | Mở Settings, tab **Models & Orchestration**, chọn đường dẫn yana-rt; hoặc đặt cài đặt `yana.runtimePath` |
| **Open a folder before giving Yana a task** | Chưa mở thư mục | Bấm **Open Folder** ở trang chủ |
| **This folder is in Restricted Mode** | Thư mục chưa được tin cậy | Thanh vàng ở trên, bấm **Manage** rồi **Trust** |
| **No API key for …** | Nhà cung cấp cần key mà chưa có | Bấm nút **Key** ở khung chat, hoặc **Yana: Set Provider API Key** |
| **Provider … is not in the yana-rt catalog** | Tên nhà cung cấp lạ | **Yana: Choose Provider and Model** và chọn lại |
| Chữ **fetch failed** khi lấy danh sách model | Nhà cung cấp chạy trên máy (Ollama...) đang tắt, hoặc key sai | Bật Ollama; hoặc kiểm tra key |
| Hộp thoại "**Turn on approvals in this project**" | Dự án chưa có chỗ lưu lệnh chờ duyệt | Bấm nút, app tạo đúng một file nhỏ. Rồi gửi lại tin |
| Lỗi **cannot persist pending approval** | Như dòng trên | Làm như dòng trên |
| Thẻ duyệt không hiện đường dẫn, chỉ hiện tên công cụ | yana-rt cũ (1.5.0) | Dùng yana-rt 1.5.1 trở lên; **chưa nên duyệt** khi chưa thấy rõ file nào |
| Trang vừa sửa mà vẫn hiện cái cũ | Cửa sổ chưa nạp lại | Cmd+Shift+P, gõ **Developer: Reload Window** |
| Máy nóng, quạt chạy mạnh | Có thứ nặng đang chạy (model chạy trên máy, Hunt, Chrome nhiều tab) | Tắt Ollama khi không dùng; đóng bớt tab Chrome; đừng chạy **Hunt** lúc máy nóng |
| Canvas báo **Needs key** | Model chọn cho Canvas cần key | Bấm **Key** trong Canvas, hoặc chọn model chạy trên máy |
| Bấm micro ra "**Voice runtime not configured**" | Giọng nói **chưa có phần chạy** | Chưa dùng được, xem mục 12 |

> **Vẫn kẹt?** Mở **View → Output**, chọn **Yana** ở danh sách: đó là nhật ký của Yana, có dòng báo lỗi cụ thể để gửi cho người hỗ trợ.

## 12. Chưa có hoặc đang làm

Để anh khỏi mất công thử những thứ chưa chạy:

| Tính năng | Tình trạng |
|---|---|
| **Giọng nói** (nói với Yana, nghe Yana đọc) | **Chưa có.** Nút micro hiện ra nhưng chưa nối phần chạy |
| **Khoá cứng chế độ Plan** | Chế độ Plan mới là lời dặn model, chưa khoá |
| **Cài đặt riêng của trợ lý** (hướng dẫn, công cụ cho phép, mức suy luận, nhiệt độ) | Chưa có tác dụng. Chỉ đổi được nhà cung cấp và model |
| **Nút hoàn tác sau khi ghi file** | Chưa có; dùng bản sao lưu hoặc git (mục 4) |
| **Yana tự xem cấu trúc dự án và tìm trong mã mà không xin duyệt** | Chưa có: hiện nó phải chạy lệnh và chờ anh duyệt |
| **Số token trả lời của Claude** | Đang cố định ở mức 4.096, có thể ngắn với file lớn |
| **Auto model, Mixture of Agents trong chat** | Chưa dùng được |
| **Đăng nhập tài khoản, kết nối bên ngoài (OAuth), sao lưu và khôi phục dữ liệu** | Chưa có |
| **Làm Word, Excel** | Chưa có |

## 13. Phím tắt và lệnh

**Phím tắt:** **Cmd+L** mở khung chat (Windows và Linux: Ctrl+L). **Cmd+Shift+P** mở bảng lệnh: gõ **Yana** để thấy mọi lệnh của Yana.

**Mọi lệnh trong bảng lệnh** (gõ chữ đầu để lọc):

| Lệnh | Việc làm |
|---|---|
| Yana: Open Yana Home | Trang chủ |
| Yana: Open Guide | Sách hướng dẫn này |
| Yana: Yana Settings | Cài đặt |
| Yana: Open Agent Panel | Mở khung chat |
| Yana: New Conversation | Cuộc trò chuyện mới |
| Yana: Open Conversation… | Mở lại cuộc cũ |
| Yana: Rename Conversation, Delete Conversation | Đổi tên, xoá cuộc trò chuyện |
| Yana: Choose Provider and Model, Choose Model | Chọn nhà cung cấp, model |
| Yana: Set Provider API Key | Lưu API key |
| Yana: Models & Runtime, Refresh Models | Xem và làm mới danh sách model |
| Yana: New Design Canvas, Open Design Canvas… | Tạo, mở Canvas |
| Yana: Studio Canvas (Component Editor) | Trình chỉnh thành phần kéo thả |
| Yana: Open Tasks Board, New Task, Refresh Tasks | Bảng việc |
| Yana: Open Permissions, Refresh Governance | Quyền hạn, quản trị |
| Yana: Open Project Memory | Trí nhớ dự án |
| Yana: Pin Command, Run Pinned Command… | Lệnh ghim |
| Yana: Run Tool… | Chọn công cụ kiểm tra |
| Yana: Doctor, Scan Agent Setup, Hunt Vulnerabilities, Audit Score, Blast Radius Map, CI Health, Cost | Từng công cụ kiểm tra |
| Yana: Refresh System, Command Reference (COMMANDS.md) | Làm mới hệ thống; xem bảng lệnh yana-rt |

## 14. Từ điển

| Từ | Nghĩa dễ hiểu |
|---|---|
| **Model** | "Bộ não" AI (ví dụ Claude, GPT, Llama). Chọn model là chọn ai suy nghĩ cho anh |
| **Nhà cung cấp (provider)** | Nơi cung cấp model: Anthropic, OpenAI, hay máy của anh (Ollama) |
| **API key** | "Chìa khoá" để dùng model đám mây, giống mật khẩu. Tuyệt đối không gửi cho ai |
| **Local / Cloud** | Chạy trên máy anh / chạy trên máy chủ của nhà cung cấp |
| **yana-rt** | Phần chạy của Yana ở bên dưới, lo việc nói chuyện với model và giữ luật an toàn |
| **Approve / Deny** | Cho phép / từ chối một việc Yana muốn làm |
| **Lease** | Giấy phép làm một loại việc trong thời gian ngắn mà không cần hỏi từng lần |
| **Sandbox (thư mục cách ly)** | Khu vực riêng, trống, để AI vẽ mà không chạm tới dự án |
| **Sao lưu (backup)** | Bản copy của file cũ Yana tự giữ trước khi ghi đè |
| **Biên nhận (receipt)** | Bản ghi "việc gì đã được cho phép và thực hiện" |
| **Nhật ký kiểm toán** | Sổ ghi mọi hành động, có chuỗi băm để không ai sửa lén được |
| **Token** | Đơn vị đo lượng chữ gửi và nhận với model. Dùng model đám mây thì tính tiền theo token |
| **Project Memory** | Ghi chú của dự án mà Yana đọc mỗi khi bắt đầu cuộc trò chuyện mới |
| **Diff** | Bảng so sánh "trước và sau": dòng đỏ bị bỏ, dòng xanh được thêm |

## 15. Lời khuyên cho người mới

1. **Bắt đầu nhỏ:** nhờ Yana đọc và giải thích một file trước khi nhờ sửa.
2. **Yêu cầu cụ thể:** "Đổi tên hàm `tinhTong` thành `tinhTongGia` trong `cart.js`" tốt hơn "sửa lại code cho đẹp".
3. **Đọc thẻ duyệt thật kỹ**, nhất là lần đầu. Đừng bấm Approve theo thói quen.
4. **Dùng git:** commit trước khi nhờ Yana sửa nhiều file, để quay lại được nếu không ưng.
5. **Viết Project Memory:** vài dòng về dự án giúp Yana khỏi hỏi lại và đỡ làm sai.
6. **Model chạy trên máy** thì tắt khi không dùng; máy sẽ mát hơn nhiều.
7. **Gặp lạ thì dừng lại:** bấm Deny, quay về mục 11 của sách này.
