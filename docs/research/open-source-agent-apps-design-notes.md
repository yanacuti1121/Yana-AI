# Ghi chú thiết kế: học từ Cline, Vibe Kanban và Emdash

Đây là ghi chú về **cách họ thiết kế**, viết bằng lời của chúng ta. Không có đoạn mã nào được chép vào repo này.

| Mục | Cline | Vibe Kanban | Emdash |
|---|---|---|---|
| Nguồn | https://github.com/cline/cline | https://github.com/BloopAI/vibe-kanban | https://github.com/generalaction/emdash |
| Giấy phép | Apache-2.0 | Apache-2.0 | Apache-2.0 |
| Commit đã đọc | `a6507a62a147db4a35e27f4294589742ccac5060` | `7c3807084daad0d9d315064f60fa869de254f027` | `ab766e8fbb436584dcf0f299740e79d559b8ed31` |
| Đã đọc | `docs/core-workflows/checkpoints.mdx`, `apps/vscode/src/shared/AutoApprovalSettings.ts`, `apps/vscode/src/core/controller/checkpoints/checkpointRestore.ts`, `apps/cli/src/tui/components/dialogs/checkpoint-confirm.tsx`, đầu `sdk/packages/core/src/session/checkpoint-diff.ts`, danh sách file | `crates/utils/src/approvals.rs`, `crates/services/src/services/approvals.rs` (140 dòng đầu), `crates/db/src/models/task.rs`, danh sách file | `README.md`, `apps/emdash-desktop/src/core/features/conversations/api/contract.ts` (120 dòng đầu), danh sách file |

Giấy phép và thống kê lấy bằng `gh api` ngày 2026-10-31. Cách đọc: chỉ qua API của GitHub (nội dung thô và danh sách file), không clone, không chạy mã, không cài gói, theo `58-dependency-sandbox-law`.

**Chưa đọc cả ba repo:** mã giao diện (các component webview của Cline, giao diện của Vibe Kanban và Emdash), ảnh chụp màn hình, và phần lớn logic phía sau các hợp đồng nêu trên. Mọi nhận xét về hình dạng giao diện trong ghi chú này là suy ra từ tài liệu và kiểu dữ liệu, chưa nhìn thấy giao diện thật.

Muốn dùng lại mã của họ thì phải làm bước riêng: giữ nguyên thông báo bản quyền, kèm LICENSE và NOTICE, ghi chỗ đã sửa, thêm vào `ACKNOWLEDGEMENTS.md`. Tên, logo và hình ảnh không dùng.

## 1. Cline: checkpoint và duyệt

### Cách Cline làm checkpoint

- **Kho Git ẩn riêng**, tách khỏi lịch sử Git của dự án. Sau mỗi lần dùng công cụ (sửa file, chạy lệnh), Cline commit trạng thái file hiện tại vào kho ẩn đó. Lịch sử Git của người dùng không bị đụng tới.
- **Chụp cả file Git không theo dõi.** Checkpoint tồn tại qua các phiên làm việc của editor. Mặc định bật, có công tắc trong cài đặt.
- **Mỗi bước có hai nút: Compare và Restore.** Compare mở trình diff của editor, hiện thay đổi tại đúng checkpoint đó.
- **Restore có ba lựa chọn**, mỗi lựa chọn đi kèm một câu nói khi nào nên dùng:
  - chỉ file: hoàn tác mã, giữ hội thoại;
  - chỉ tác vụ: xóa các tin nhắn sau điểm đó, giữ file;
  - cả hai: về lại hẳn điểm đó.
- **Sửa tin nhắn cũ gắn với checkpoint.** Khi sửa một tin nhắn trước đó và chọn khôi phục tất cả, file được trả về điểm tương ứng rồi tin nhắn đã sửa mới được gửi lại.
- **Lập luận của họ**: checkpoint làm cho tự duyệt dùng được. Không có checkpoint thì tự duyệt đáng sợ vì agent sửa nhiều thứ trước khi người dùng kịp nhận ra. Có checkpoint thì người dùng để agent chạy nhanh rồi lùi lại nếu sai.
- **Giới hạn họ nêu**: kho lớn thì tốn dung lượng và chậm.
- **Bản terminal của họ chỉ có hai lựa chọn** (chỉ chat, hoặc chat và workspace) và cảnh báo trước rằng khôi phục workspace chạy `git reset --hard` và `git clean -fd`. Cảnh báo ghi trên màn xác nhận, màu vàng, hiện ngay khi người dùng chọn lựa chọn đó.

### Cài đặt tự duyệt của Cline

- Mỗi loại hành động là một công tắc riêng: đọc file, sửa file, chạy lệnh, dùng trình duyệt, dùng MCP, cộng một công tắc thông báo.
- Có số phiên bản tăng sau mỗi lần đổi, để chống xung đột khi hai nơi cùng ghi cài đặt.
- Nhiều trường cũ được giữ lại để tương thích ngược (bật/tắt chung, danh sách yêu thích, giới hạn số yêu cầu). Mặc định của họ cho phép khá nhiều: đọc, sửa file, trình duyệt và MCP đều bật sẵn.

### Áp dụng cho Yana

- **Màn Checkpoints** (màn còn thiếu trong brief): dùng ba kiểu quay lại giống Cline và Claude Code (mã, hội thoại, cả hai). Mỗi kiểu có một câu "khi nào dùng".
- **Compare** mở diff của IDE, không tự vẽ trình diff mới.
- **Cảnh báo trước khi khôi phục** ghi rõ việc sẽ xảy ra. Yana không được dùng `git reset --hard` hay `git clean -f` để khôi phục (luật của chính repo này cấm agent chạy các lệnh đó), nên cần cơ chế khôi phục từng file từ một kho snapshot riêng. Đây là yêu cầu cho phía `yana-rt`, chưa có sẵn.
- **Checkpoint là lớp đệm cho cổng duyệt, không thay thế nó.** Cline dùng checkpoint để cho phép tự duyệt nhiều hơn. Yana giữ chế độ SUPERVISED làm mặc định, nên không lấy lập luận này làm lý do nới quyền.
- **Công tắc tách theo loại hành động** là một mô hình quen thuộc cho màn Cài đặt (đọc, sửa, chạy lệnh, MCP). Mặc định của Yana phải chặt hơn Cline.
- **Chống ghi chồng cài đặt** bằng số phiên bản: đáng xem lại cho các nơi Studio ghi cài đặt từ nhiều view.

### Không lấy

- Mặc định rộng quyền.
- Việc để cả danh sách trường cũ trong kiểu dữ liệu: nợ tương thích của họ, không phải thiết kế để học.

### Suy luận cần kiểm

Theo tài liệu, checkpoint chụp trạng thái file sau cả lệnh chạy. Vậy thay đổi file do lệnh gây ra được lưu lại. Em suy ra (chưa kiểm) rằng những tác dụng ngoài file, như gọi mạng hay sửa dữ liệu ngoài dự án, thì không khôi phục được. Màn Checkpoints của Yana nên nói điều này thẳng.

## 2. Vibe Kanban: bảng việc và duyệt

### Mô hình việc

- Trạng thái việc có năm giá trị: Todo, InProgress, InReview, Done, Cancelled.
- Một việc có dự án, tiêu đề, mô tả tùy chọn, và một liên kết tùy chọn tới workspace cha.

### Mô hình yêu cầu duyệt

- Một yêu cầu có: mã, tên công cụ, mã tiến trình thực thi, thời điểm tạo, thời điểm hết hạn. Hạn mặc định là 10 giờ.
- Trạng thái của một yêu cầu duyệt có bốn giá trị: chờ, đã duyệt, đã từ chối (kèm lý do tùy chọn), hết hạn.
- **Câu hỏi của agent là loại riêng**, không gộp với xin quyền. Câu hỏi có trạng thái đã trả lời (kèm các cặp hỏi-đáp, mỗi câu trả lời có thể chọn nhiều nhãn) hoặc hết hạn.
- **Kiểm tra chéo loại**: gửi Approve/Deny cho một câu hỏi, hoặc gửi câu trả lời cho một yêu cầu xin quyền, đều bị từ chối.
- **Đẩy xuống giao diện theo luồng**: khi có yêu cầu mới, backend phát một bản vá (JSON patch) qua kênh broadcast cho giao diện. Có một bộ theo dõi hết hạn chạy riêng cho từng yêu cầu. Yêu cầu đã hoàn tất được giữ trong một bảng riêng.
- Các lỗi được đặt tên: không tìm thấy, đã hoàn tất, không có phiên executor, trạng thái không hợp lệ.

### Áp dụng cho Yana

- **Màn Việc (màn 4):** thêm cột hoặc trạng thái "chờ xem lại" giữa "đang làm" và "xong". Mô hình của ta (mở, đang làm, bị chặn, xong) không có chỗ cho việc đã làm xong nhưng chờ người xác nhận. Việc này ăn khớp với nguyên tắc "bằng chứng trước sự tự tin". Cần thêm trạng thái "hủy" nếu runtime phân biệt được hủy với xong.
- **Phân biệt "xin quyền" và "hỏi người"** trong thẻ duyệt và Trung tâm duyệt. Hai loại này có hành động khác nhau: một bên Allow/Deny, một bên trả lời. Runtime Yana hiện chỉ có sự kiện xin quyền (`HumanApprovalRequired`), chưa có loại câu hỏi, nên đây là ghi nhận cho tương lai, không phải việc phải làm ngay.
- **Lý do từ chối có thể để trống**: `ToolDenied` của ta đã có trường lý do tùy chọn, giao diện nên cho người dùng nhập lý do nhưng không bắt buộc.
- **Yêu cầu hết hạn là một trạng thái cuối**, không tạo thẻ mới. Điều này trùng với quy tắc đã ghi từ ghi chú OpenMausBot.
- Hợp đồng của họ cho một yêu cầu chỉ có tên công cụ, không có mô tả bằng lời thường. Thẻ duyệt năm câu hỏi của Yana (hành động bằng lời thường, lý do, tài nguyên, phạm vi, hệ quả) là phong phú hơn ở phần dữ liệu. Em chưa xem giao diện của họ nên không biết họ bù ở phía giao diện hay không.

### Không lấy

- Hạn 10 giờ: quá dài cho một thẻ chờ người, trái với tinh thần "không giữ quyền chờ lâu". Hạn của Yana do `yana-rt` quyết định, không sao chép con số này.

## 3. Emdash: nhiều phiên song song

### Cách Emdash tổ chức

- Mỗi tác vụ chạy trong **một Git worktree và một nhánh riêng**. Nhiều agent chạy cùng lúc không đụng nhau.
- Chạy được nhiều CLI agent có sẵn (Claude Code, Codex, OpenCode, Amp và các loại khác). Tự phát hiện CLI đã cài.
- Chạy được trên máy từ xa qua SSH/SFTP. Thông tin đăng nhập nằm trong kho khóa của hệ điều hành.
- Trạng thái ứng dụng nằm trong SQLite cục bộ. Họ nói không gửi mã hay hội thoại tới máy chủ của họ. Thu thập số liệu là tùy chọn, tắt được.
- **Với agent có hỗ trợ hook vòng đời, Emdash ghi các mục có gắn nhãn vào cấu hình cấp người dùng của agent đó**, để theo dõi trạng thái, thông báo và phiên có thể tiếp tục. Các hook không làm gì khi agent chạy ngoài phiên Emdash.
- Từ một vé của Linear, GitHub, Jira, GitLab và các hệ khác, có thể đẩy sang một agent. Xem diff, tạo pull request, xem CI và gộp ngay trong app.
- **Có bản cho macOS, Windows (MSI, EXE portable) và Linux (AppImage, DEB, RPM)**, cả x64 và ARM64.

### Hợp đồng hội thoại (đã đọc 120 dòng đầu)

- Có hai loại phiên cùng tồn tại: phiên kiểu ACP và phiên kiểu terminal (TUI).
- Có tệp đính kèm cho hội thoại, và **hàng đợi lời nhắc có thể sửa** (`editQueuedPrompt`): người dùng gửi tiếp khi agent đang bận và sửa được lời nhắc còn chờ.
- Danh sách phiên là mô hình sống: giao diện nhận cập nhật theo luồng, không phải lấy lại.
- Trong module chat có các nhà cung cấp @mention (file trong workspace, lệnh được quảng bá) và một mục để **nhắc tới bình luận trên diff** trong chat.

### Áp dụng cho Yana

- **Hàng đợi lời nhắc có thể sửa** là chi tiết nhỏ đáng học cho màn Chat: người dùng nhắn tiếp khi agent còn đang chạy, và thấy lời nhắn đang xếp hàng.
- **Một phiên một worktree** là cách cô lập tốt. Yana đã dùng quy tắc "mỗi phiên một worktree" cho chính việc phát triển. Việc đưa nó vào sản phẩm cho người dùng cuối là quyết định riêng, chưa đề xuất ở đây.
- **Hook ghi vào cấu hình cấp người dùng của agent** là đúng kiểu mà adapters của Yana làm. Điểm cần học là cách họ **gắn nhãn các mục của mình** và **không làm gì khi chạy ngoài phiên của mình**. Mục này chưa kiểm xem adapters của Yana đã làm hai điều đó chưa.
- **Bình luận trên diff được nhắc trong chat** nối thẳng với thẻ đề xuất sửa file: người dùng bình luận một đoạn rồi nhờ agent sửa tiếp.
- Bản Windows và Linux của Emdash cho thấy một app desktop Electron kiểu này chạy được trên ba hệ. Brief của ta cần một đoạn nói rõ phần nào là riêng macOS (notch, menu bar) và phần nào dùng chung.

### Không lấy

- Tích hợp vé từ hơn mười hệ: ngoài phạm vi, trái nguyên tắc "xây ít hơn".
- Trạng thái "chạy" tính theo tiến trình sống: Yana ghi rõ "đang chạy" nghĩa là tiến trình còn sống, không phải đang bận.

## 4. Thứ tự ưu tiên rút ra

1. **Màn Checkpoints** với ba kiểu quay lại, Compare qua diff của IDE, và cảnh báo rõ việc sẽ xảy ra. Cần `yana-rt` có kho snapshot riêng khôi phục theo file.
2. **Trạng thái "chờ xem lại"** trên bảng việc.
3. **Hàng đợi lời nhắc có thể sửa** trong Chat.
4. **Bình luận trên diff** gắn vào chat.
5. **Đoạn mô tả khác biệt Windows/Linux** trong brief, đối chiếu từ cách Emdash phát hành ba hệ.

## 5. Chưa kiểm

- Giao diện thật của cả ba: chưa xem ảnh chụp nào, chưa chạy app nào.
- Cline có cho khôi phục từng hunk không: tài liệu chỉ nói theo checkpoint.
- Hạn mặc định thực tế của yêu cầu duyệt trong Yana so với 10 giờ của Vibe Kanban.
- Adapters của Yana có gắn nhãn mục hook và tự vô hiệu ngoài phiên Yana hay không.
- Giao diện của Vibe Kanban hiển thị yêu cầu duyệt thế nào, bù thế nào cho việc yêu cầu chỉ có tên công cụ.
