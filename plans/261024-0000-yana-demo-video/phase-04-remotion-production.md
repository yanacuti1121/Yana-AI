---
phase: 4
title: "Dựng video bằng Remotion"
status: in-progress
priority: P2
effort: "10–14h"
dependencies: [2, 3]
---

# Phase 4: Dựng video bằng Remotion

## Overview

Giai đoạn 4 của [kế hoạch video Yana](./plan.md). Chỉ thực hiện sản xuất sau khi được duyệt phạm vi ghi file và chạy app/render tương ứng.

## Requirements
- Project Remotion riêng với npm; không thêm dependency vào app hoặc root repository.
- Main composition 1920×1080, 30 fps, 2250 frame = 75 giây.
- Footage, font và âm thanh dùng file local để render lặp lại được.
- Không cài thêm skill hoặc package trong giai đoạn chỉ lập kế hoạch.

## Architecture
- `src/root.tsx`: đăng ký composition; `src/video.tsx`: timeline tổng.
- `src/content.ts`: copy và mốc thời gian; `src/theme.ts`: design tokens.
- `src/scenes/`: hero, workspace, code-context, approval, evidence, models, montage, outro.
- `src/components/`: app-frame, caption, cursor, focus-highlight dùng chung khi có lặp thực tế.
- Animation theo frame bằng API Remotion hiện hành; không dựa trên timer hoặc trạng thái mạng lúc render.

## Implementation Steps
1. Kiểm tra Node và tài liệu Remotion/giấy phép hiện hành trước khi scaffold; cố định dependency bằng lockfile.
2. Thiết lập script preview, typecheck và render có output path rõ ràng.
3. Ghép footage theo storyboard; lưu thời lượng và frame range trong cấu hình chung.
4. Thêm typography, chuyển cảnh, zoom và focus highlight; không che nội dung cần chứng minh.
5. Ghép nhạc, click và transition sound; thêm fade và khoảng yên ở cảnh quyết định.
6. Xuất bản nháp đầy đủ và teaser 20–30 giây bằng composition riêng tái dùng scene.
7. Thiết kế poster từ khung hình mạnh nhất. Bản dọc 1080×1920 là tùy chọn cần xác nhận phạm vi, bố cục được dựng lại.

## Related Code Files
- Tạo dự kiến: `tools/yana-promo/package.json`, lockfile, cấu hình TypeScript/Remotion, `src/`, `public/`, hướng dẫn render.
- Render dự kiến: `tools/yana-promo/out/yana-demo-vi.mp4`, `yana-teaser-vi.mp4`, `yana-poster.png`.
- Không sửa website để nhúng video trong kế hoạch này.

## Success Criteria
- [ ] Preview và render chạy theo hướng dẫn từ project video riêng.
- [x] Bản nháp đủ 2250 frame, không thiếu asset/font.
- [x] Xem không tiếng vẫn hiểu vấn đề, lợi ích và CTA.

## Risk Assessment
- Nếu clip nguồn lệch fps: chuẩn hóa clip trong project video, giữ nguyên bản gốc.
- Kiểm tra bản render thật, không chỉ preview trình duyệt.
- Render thử một đoạn trước khi render toàn bộ; quản lý tiến trình theo quy định repo.

## Ghi nhận thực hiện

Xem [trạng thái sản xuất](./plan.md) và [hướng dẫn](./production-guide.md). Bản đầu đang hoàn thiện render/QA; các checkbox chưa có bằng chứng hoặc cần người dùng duyệt được giữ mở.

Bản dựng đã xuất; xem [production-report.md](./production-report.md) cho metadata, audio và giới hạn xác minh.
