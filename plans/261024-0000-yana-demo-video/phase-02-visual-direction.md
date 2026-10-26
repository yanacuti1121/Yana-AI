---
phase: 2
title: "Phong cách và đoạn thử chuyển động"
status: in-progress
priority: P2
effort: "6–8h"
dependencies: [1]
---

# Phase 2: Phong cách và đoạn thử chuyển động

## Overview

Giai đoạn 2 của [kế hoạch video Yana](./plan.md). Chỉ thực hiện sản xuất sau khi được duyệt phạm vi ghi file và chạy app/render tương ứng.

## Requirements
- Nền sáng, chữ xanh đậm, điểm nhấn nhiều màu và nét vẽ tay dựa trên website Yana.
- Một lợi ích mỗi cảnh; chữ ít; chuyển động dẫn mắt tới thao tác.
- Không dùng logo, nhạc, hình nền hoặc footage của OneNotch làm tài sản xuất bản.

## Architecture
- Tách design tokens, nội dung và thời lượng khỏi scene.
- Dùng UI footage làm tâm điểm; khung máy và đồ họa chỉ hỗ trợ.
- Chuyển động spring/easing có chủ đích; giảm nhịp ở cảnh phê duyệt.

## Implementation Steps
1. Trích màu/font/logo từ nguồn Yana; kiểm tra giấy phép từng tài sản, kể cả khung máy và hình nền.
2. Thiết kế ba styleframe: hero, cận cảnh phê duyệt và CTA.
3. Xác định cỡ chữ xem được khi video hiển thị ở chiều rộng 640px; kiểm tra dấu tiếng Việt.
4. Dựng đoạn thử 8–10 giây bằng các nguyên liệu đã có; ghi rõ placeholder chỉ trong bản duyệt nội bộ.
5. Chọn nhạc có quyền sử dụng; đánh dấu nhịp cảnh và sound effect dự kiến.
6. Duyệt styleframe và đoạn thử trước khi sản xuất toàn bộ timeline.

## Related Code Files
- Đầu ra dự kiến: `tools/yana-promo/src/theme.ts`, `src/components/`, `public/branding/`.
- Bản duyệt dự kiến: `tools/yana-promo/out/styleframes/`, `out/motion-test.mp4`.
- Đây là đường dẫn đề xuất, chưa được tạo trong lần lập kế hoạch.

## Success Criteria
- [x] Có ba styleframe và đoạn thử 8–10 giây.
- [ ] Chữ đọc được, logo đúng, không dùng tài sản chưa rõ quyền.
- [ ] Người dùng duyệt phong cách trước khi dựng đủ 75 giây.

## Risk Assessment
- Nếu khung máy làm UI quá nhỏ: ưu tiên crop trực tiếp cửa sổ app.
- Tránh hiệu ứng trang trí lấn át trải nghiệm và thông điệp.

## Ghi nhận thực hiện

Xem [trạng thái sản xuất](./plan.md) và [hướng dẫn](./production-guide.md). Bản đầu đang hoàn thiện render/QA; các checkbox chưa có bằng chứng hoặc cần người dùng duyệt được giữ mở.
