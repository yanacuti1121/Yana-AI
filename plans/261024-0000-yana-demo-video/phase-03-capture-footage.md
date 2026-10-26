---
phase: 3
title: "Chuẩn bị và quay app thật"
status: pending
priority: P2
effort: "6–10h"
dependencies: [1, 2]
---

# Phase 3: Chuẩn bị và quay app thật

## Overview

Giai đoạn 3 của [kế hoạch video Yana](./plan.md). Chỉ thực hiện sản xuất sau khi được duyệt phạm vi ghi file và chạy app/render tương ứng.

## Requirements
- Dùng dự án demo biệt lập, dữ liệu vô hại; không tài khoản khách hàng, API key, thông báo riêng hoặc lịch sử cá nhân.
- Quay đúng bản app đã chốt; nguồn ưu tiên 1920×1080 trở lên, 30 hoặc 60 fps ổn định.
- Giữ vài giây đầu/cuối mỗi take để dựng; không tăng tốc đoạn cần đọc.

## Implementation Steps
1. Chuẩn bị project demo và một nhiệm vụ nhỏ có đầu vào/kết quả rõ ràng.
2. Kiểm tra cửa sổ, theme, font editor và vị trí con trỏ; chọn thiết lập bằng phạm vi đã được duyệt.
3. Quay từng take: mở project, đọc file, hỏi code, phê duyệt, kết quả, model picker, terminal và task.
4. Với phê duyệt: ưu tiên ghi một file demo hoặc chạy kiểm tra vô hại có thật sự yêu cầu duyệt theo policy. Không nới policy để tạo cảnh.
5. Chỉ quay việc đổi model như thao tác hoạt động nếu đã kiểm tra bằng provider thật; không ngụ ý mọi provider đã thử.
6. Kiểm tra footage theo claim matrix; ghi take, timecode và nguồn cho từng cảnh.
7. Làm sạch hình trong bản dựng khi cần; nếu cắt thời gian chờ, đánh dấu tua nhanh khi thay đổi có thể gây hiểu sai.

## Related Code Files
- Đầu ra dự kiến: `tools/yana-promo/public/footage/`, `public/stills/`.
- Bảng take và kiểm chứng bổ sung vào shot list trong thư mục kế hoạch.

## Success Criteria
- [ ] Có footage thật cho toàn bộ cảnh tính năng.
- [ ] Phê duyệt và kết quả thuộc cùng một thao tác, không ghép gây hiểu sai.
- [ ] Không lộ bí mật hoặc dữ liệu riêng; mọi đoạn được kiểm tra ở độ phân giải đầy đủ.

## Risk Assessment
- Nếu provider chậm: ghi take khác hoặc cắt khoảng chờ trung thực; không dựng giả phản hồi.
- Mọi tiến trình khởi chạy phải có PID/port/thư mục và được dừng khi xong; không đóng app/tiến trình của người dùng.

## Ghi nhận thực hiện

Chưa thực hiện screen recording. Bản đầu dùng screenshot có sẵn và đồ họa có nhãn minh họa; không đánh dấu các tiêu chí footage thật hoàn thành.
