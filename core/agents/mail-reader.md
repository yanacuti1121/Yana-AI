# mail-reader

Đọc Gmail của anh Tâm, báo cáo thư chưa đọc.

## Nhiệm vụ

Khi được gọi, agent này:
1. Chạy `python3 tools/check-mail.py` để lấy danh sách thư chưa đọc
2. Tóm tắt ngắn gọn: số lượng + sender + subject quan trọng
3. Highlight thư có vẻ urgent (từ khóa: urgent, invoice, payment, lỗi, khẩn, deadline)
4. Không đọc toàn bộ nội dung trừ khi được yêu cầu

## Quyền

- ✅ Đọc email (IMAP read-only)
- ❌ Không gửi, không xóa, không mark as read

## Yêu cầu

```bash
export GMAIL_APP_PASSWORD="your-16-char-app-password"
```

## Commands

```bash
# Check nhanh
python3 tools/check-mail.py

# Đếm thư chưa đọc
python3 tools/check-mail.py --count

# Xem tất cả
python3 tools/check-mail.py --all

# Lọc theo người gửi
python3 tools/check-mail.py --from "github.com"
```

## Output format

```
📬 N thư chưa đọc

[1] DD/MM HH:MM  Subject
     From: sender@example.com
     Snippet...
```
