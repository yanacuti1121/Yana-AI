---
phase: 1
title: "Chốt nội dung và bản app"
status: in-progress
priority: P2
effort: "6–8h"
dependencies: []
---

# Phase 1: Chốt nội dung và bản app

## Overview

Giai đoạn 1 của [kế hoạch video Yana](./plan.md). Chỉ thực hiện sản xuất sau khi được duyệt phạm vi ghi file và chạy app/render tương ứng.

## Bối cảnh và nguồn kiểm tra
- Đọc [README.vi.md](../../README.vi.md), [SCREEN-STATUS.md](../../tools/yana-studio/SCREEN-STATUS.md), [website source](../../docs/index.html).
- Đối chiếu `tools/yana-studio/renderer/`, `tools/yana-studio/native-macos/` và `tools/yana-ide/` để chọn đúng bản app. Không ghép UI khác thế hệ thành một sản phẩm giả.
- Website đang gọi Studio là Code-OSS; tài liệu Studio mô tả implementation khác. Đây là quyết định phải giải quyết trước khi quay.

## Requirements
- Đối tượng mặc định: người dùng AI làm việc với code và dự án.
- Tiếng Việt, 75 giây, thông điệp “AI làm việc. Bạn giữ quyền.”
- Tập trung workspace, đọc code, phê duyệt, kết quả, model, terminal và task.
- Không quảng bá mobile, devices, agent sessions hoặc robot vật lý như tính năng đã hoạt động.

## Implementation Steps
1. Ghi lại tên bản app, phiên bản/commit, hệ điều hành và cách khởi chạy; kiểm tra tiến trình đang có trước khi mở app.
2. Tạo bảng claim → nguồn code → thao tác chạy thật → footage dự kiến → trạng thái xác nhận.
3. Kiểm tra luồng đọc file, chat, yêu cầu phê duyệt, từ chối/cho phép và kết quả; không xem README hoặc screenshot là chứng minh runtime.
4. Xác nhận audit hiển thị ở đâu. Nếu app chưa có lịch sử audit hoàn chỉnh, quay phần thực sự có và gắn nhãn minh họa cho sơ đồ bổ trợ.
5. Chọn CTA “Khám phá Yana” dẫn về website; chốt lời trên từng cảnh theo storyboard trong plan.
6. Lập shot list và danh sách tài sản; ghi rõ cảnh nào là footage thật, cảnh nào là đồ họa giải thích.

## Related Code Files
- Chỉ đọc các đường dẫn trên; không sửa app để làm cho footage trông như đã có tính năng.
- Đầu ra dự kiến khi được duyệt sản xuất: `creative-brief.md`, `script.md`, `shot-list.md`, `claim-matrix.md` trong thư mục kế hoạch này.

## Success Criteria
- [ ] Chọn chính xác bản Studio sẽ quay.
- [ ] Mỗi claim có bằng chứng và một cách thể hiện có thể quay được.
- [ ] Script đủ 75 giây; không có claim tính năng chưa hoàn thiện.

## Risk Assessment
- Nếu một luồng không chạy được: ghi lỗi, đề xuất thay cảnh bằng tính năng thật khác và xin duyệt thay đổi nội dung; không dựng kết quả giả.
- Không sửa sản phẩm trong phạm vi sản xuất video. Bugfix cần phạm vi riêng.

## Ghi nhận thực hiện

Xem [trạng thái sản xuất](./plan.md) và [hướng dẫn](./production-guide.md). Bản đầu đang hoàn thiện render/QA; các checkbox chưa có bằng chứng hoặc cần người dùng duyệt được giữ mở.
