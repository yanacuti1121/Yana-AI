---
phase: 5
title: "Kiểm tra và bàn giao"
status: in-progress
priority: P2
effort: "4–8h"
dependencies: [4]
---

# Phase 5: Kiểm tra và bàn giao

## Overview

Giai đoạn 5 của [kế hoạch video Yana](./plan.md). Chỉ thực hiện sản xuất sau khi được duyệt phạm vi ghi file và chạy app/render tương ứng.

## Requirements
- Bản chính MP4 H.264 1920×1080/30 fps, âm thanh AAC, thời lượng 75 giây; hỗ trợ phát web bằng faststart.
- Teaser 20–30 giây, poster, source và hướng dẫn render.
- Ngân sách dự kiến hai vòng sửa; thay concept hoặc thêm voice-over cần đánh giá lại lịch.

## Implementation Steps
1. Chạy typecheck và lệnh build/render phù hợp của project video; không chạy toàn bộ test sản phẩm cho thay đổi video độc lập.
2. Dùng ffprobe kiểm tra codec, kích thước, fps, duration và audio stream.
3. Xem toàn bộ video có tiếng và tắt tiếng; kiểm tra khung bắt đầu/kết thúc, chuyển cảnh, dấu tiếng Việt và độ đọc ở 640px.
4. Kiểm tra âm thanh không clipping; mục tiêu tham khảo khoảng -14 LUFS và true peak không quá -1 dBTP.
5. Đối chiếu từng claim với bản app/footage đã ghi; nhãn minh họa phải rõ; không có tuyên bố bảo vệ tuyệt đối.
6. Kiểm tra CTA, giấy phép logo/font/nhạc/khung máy và quyền sử dụng asset.
7. Nhận phản hồi, sửa hai vòng dự kiến rồi xuất lại các bản liên quan.
8. Bàn giao file, cấu hình render, asset provenance và giới hạn đã biết; không tự publish, deploy hoặc sửa website.

## Related Code Files
- `tools/yana-promo/out/`: video và poster.
- `tools/yana-promo/README.md`: cài đặt, preview, render, cấu hình và giấy phép tài sản; chỉ tạo khi sản xuất được duyệt.
- Ghi kết quả thực tế và lệnh kiểm tra vào báo cáo bàn giao thuộc thư mục kế hoạch, theo phạm vi duyệt lúc đó.

## Success Criteria
- [ ] Bản chính, teaser và poster mở được trên trình phát phổ biến.
- [x] Metadata phù hợp, không frame đen ngoài chủ ý hoặc âm thanh clipping.
- [ ] Người xem hiểu Yana giúp gì và quyền duyệt nằm ở đâu.
- [x] Có source, lockfile, hướng dẫn render và nguồn tài sản.
- [x] Không publish/deploy khi chưa được yêu cầu.

## Risk Assessment
- Nếu tính năng app thay đổi trước xuất cuối: quay lại cảnh bị ảnh hưởng, không giữ footage quảng bá sai phiên bản.
- Nếu bản nhạc không có quyền dùng thương mại: thay bằng tài sản hợp lệ trước bàn giao.

## Ghi nhận thực hiện

Xem [trạng thái sản xuất](./plan.md) và [hướng dẫn](./production-guide.md). Bản đầu đang hoàn thiện render/QA; các checkbox chưa có bằng chứng hoặc cần người dùng duyệt được giữ mở.

Bản dựng đã xuất; xem [production-report.md](./production-report.md) cho metadata, audio và giới hạn xác minh.
