---
title: "Video giới thiệu Yana bằng Remotion"
description: "Video 75 giây kết hợp app thật và motion graphics, theo thông điệp AI làm việc. Bạn giữ quyền."
status: in-progress
priority: P2
effort: "32–48h"
branch: main
tags: [docs, video, remotion]
created: 2026-10-24
blockedBy: []
blocks: []
---

# Video giới thiệu Yana bằng Remotion

## Outcome và phạm vi được duyệt

Tạo kế hoạch cho video demo Yana có nhịp dựng sinh động như tham khảo OneNotch, nhưng dùng nhận diện và tính năng thật của Yana. Người dùng đã đồng ý lưu `plan.md` và năm phase. Lần này chỉ tạo sáu tài liệu; không cài package, dựng video, quay app, sửa sản phẩm, commit hoặc publish.

Định hướng đề xuất: 75 giây, tiếng Việt, 16:9, nền sáng theo website, footage app thật kết hợp Remotion. Người xem mục tiêu mặc định là người làm việc với AI trong dự án code. CTA: “Khám phá Yana” → https://yana.vutam.link/.

**Thông điệp:** AI làm việc. Bạn giữ quyền.

## Cơ sở và giới hạn bằng chứng

- [Website Yana](https://yana.vutam.link/) được đọc qua trình duyệt ngày 24/10/2026: hero, workspace, quyền duyệt và dấu vết thực thi là trọng tâm.
- [OneNotch](https://www.tryonenotch.com/vi) và video người dùng đính kèm là tham khảo phong cách, không là tài sản để tái sử dụng. Metadata clip: 111.658667 giây, 1920×1080, 30 fps, AV1/AAC; đã xem contact sheet cách nhau khoảng 10 giây, chưa phân tích liên tục chuyển động hoặc nghe nhạc.
- [Remotion docs](https://www.remotion.dev/docs/): React, video/audio, preview và render. Việc OneNotch được làm bằng Claude/Remotion là thông tin người dùng cung cấp, chưa xác minh độc lập.
- [README tiếng Việt](../../README.vi.md), [Studio status](../../tools/yana-studio/SCREEN-STATUS.md), [website source](../../docs/index.html), `tools/yana-studio/renderer/` là nguồn khảo sát local. Chưa chạy app, chưa kiểm chứng luồng runtime.
- Website gọi Studio là Code-OSS; repo có nhiều thế hệ Electron/native/IDE. Phải chọn đúng bản trước khi quay. Không dùng `site/src/pages/index.astro` làm nguồn homepage hiện hành vì file đang là starter Astro.
- Tài liệu và số lượng tính năng có thể lệch nhau; không đưa benchmark, số provider/skill hoặc lời hứa bảo vệ tuyệt đối vào script khi chưa xác minh.

## Lựa chọn sản xuất

| Phương án | Lợi ích | Đánh đổi |
|---|---|---|
| Screen recording đơn giản | Nhanh, app thật | Khó tạo nhịp/độ sinh động như mẫu |
| Dựng lại UI hoàn toàn | Kiểm soát chuyển động | Nhiều công, nguy cơ khác sản phẩm |
| **Footage thật + Remotion** | Cân bằng trải nghiệm thật và thẩm mỹ | Cần shot list và footage tốt; phương án đề xuất |

## Storyboard 75 giây

| Giây | Frame range tại 30 fps, cuối không bao gồm | Hình ảnh | Copy đề xuất |
|---|---|---|---|
| 0–5 | 0–150 | Logo và các nhóm công việc hội tụ | AI làm việc. Bạn giữ quyền. |
| 5–12 | 150–360 | File, chat, terminal trở về một workspace | Dự án. Hội thoại. Công cụ. Cùng một nơi. |
| 12–23 | 360–690 | Mở project, đọc code, hỏi Yana | Hiểu code ngay trong ngữ cảnh. |
| 23–37 | 690–1110 | Yêu cầu quyền thật, cận hộp duyệt, quyết định của người dùng | Cần quyền? Yana chờ bạn. |
| 37–47 | 1110–1410 | Kết quả thật và dấu vết tương ứng; sơ đồ giải thích có nhãn | Biết điều gì đã xảy ra. |
| 47–57 | 1410–1710 | Model/provider picker đã kiểm chứng | Chọn model phù hợp với công việc. |
| 57–67 | 1710–2010 | Montage editor, terminal, task | Giữ công việc trong tầm quan sát. |
| 67–75 | 2010–2250 | App toàn cảnh, logo và URL | Khám phá Yana — yana.vutam.link |

Cảnh phê duyệt là điểm nhấn: nhịp chậm hơn, ít chữ và rõ quyết định. Không sử dụng thao tác phá hủy để tạo kịch tính. Chỉ quay chính sách và hành vi có thật; không diễn giải mọi thao tác đều bắt buộc xin phép.

## Phases và phụ thuộc

1. [Chốt nội dung và bản app](./phase-01-start.md) — 6–8h; phụ thuộc không.
2. [Phong cách và đoạn thử chuyển động](./phase-02-visual-direction.md) — 6–8h; phụ thuộc 1.
3. [Chuẩn bị và quay app thật](./phase-03-capture-footage.md) — 6–10h; phụ thuộc 1, 2.
4. [Dựng video bằng Remotion](./phase-04-remotion-production.md) — 10–14h; phụ thuộc 2, 3.
5. [Kiểm tra và bàn giao](./phase-05-quality-and-delivery.md) — 4–8h; phụ thuộc 4.

Thứ tự: nội dung → phong cách/đoạn thử → footage → dựng đầy đủ → QA/bàn giao. Tổng 32–48 giờ, tương đương khoảng 4–6 ngày làm việc, dự kiến hai vòng chỉnh sửa. Thời gian chờ duyệt, lỗi app, provider và quay lại chưa được bảo đảm trong dự toán.

## Kiến trúc và đầu ra dự kiến

Project riêng đề xuất `tools/yana-promo/`: `src/` chứa composition, timeline, scene và component; `public/` chứa branding, footage, font và audio; `out/` chứa sản phẩm render. Không thay dependency root/app. Chỉ tạo project khi phạm vi triển khai được duyệt.

Đầu ra: video chính MP4 H.264/AAC 1920×1080/30 fps/75 giây; teaser 20–30 giây; poster; source và lockfile; hướng dẫn render; nguồn/giấy phép tài sản. Ưu tiên chữ và nhạc để xem không tiếng vẫn hiểu. Voice-over và bản dọc 1080×1920 là tùy chọn chưa chốt, không nằm trong đầu ra mặc định.

## Acceptance criteria

- [ ] Chọn đúng bản app và xác minh các luồng sẽ quảng bá trước khi quay.
- [ ] Duyệt ba styleframe và đoạn motion test 8–10 giây trước khi dựng đầy đủ.
- [ ] Mỗi claim có nguồn và footage thật; đồ họa giải thích được phân biệt rõ.
- [ ] Video chính đúng 2250 frame; câu chữ đọc được ở chiều rộng 640px.
- [ ] Xem có tiếng/tắt tiếng đều hiểu lợi ích, quyền quyết định và CTA.
- [ ] Không lộ dữ liệu riêng; tài sản có quyền sử dụng; audio không clipping.
- [ ] Bàn giao đủ video, teaser, poster, source và hướng dẫn render.

## Non-goals và rollback

Không sửa tính năng app để phục vụ video, làm lại website, hứa tính năng đang phát triển, cài skill, tự commit/push/publish hoặc sao chép asset OneNotch. Wheelbot/devices/mobile không được mô tả là luồng hoạt động đã kiểm chứng.

Khi sản xuất, chỉ sửa project video và tài liệu theo batch đã duyệt; giữ footage gốc. Nếu bản dựng lỗi, quay lại revision/asset trước trong project video, không đổi runtime/policy. Nếu cần sửa app hoặc nhúng video lên website, đề xuất phạm vi riêng.

## Quyết định còn mở trước sản xuất

1. Bản app nào là nhân vật chính: Studio Electron, native macOS hay IDE? Khảo sát bản đang dùng trước khi hỏi người dùng nếu có thể.
2. Chốt CTA khám phá hay tải app sau khi kiểm tra bản phát hành thực tế.
3. Người dùng duyệt script/styleframe; chọn có voice-over hoặc bản dọc hay không.

## Bước tiếp theo

Khuyến nghị kiểm tra ba quyết định trên và claim matrix trong phase 1 trước khi bắt đầu render. Kế hoạch này chưa phải bằng chứng rằng các tính năng hoặc video đã được chạy/kiểm thử.


## Trạng thái sản xuất — 24/10/2026

Người dùng đã yêu cầu “bạn dựng luôn video cho tôi đi”, cho phép triển khai project video riêng và cập nhật tài liệu kế hoạch. Bản dựng đầu tiên dùng ảnh Studio Code-OSS từ repository cùng đồ họa minh họa có nhãn. Không có bản Yana đã cài trong Applications hoặc dependency/build Studio sẵn để quay trực tiếp; không cài/build hoặc sửa app chỉ để tạo footage.

Đã tạo source Remotion, score gốc, font local và source provenance; 4 kiểm tra timeline/tài sản/nhạc và typecheck qua. Ba styleframe chủ đạo, các styleframe bổ sung và đoạn thử 10 giây đã render. Video chính/teaser đang xuất bản cuối sau chỉnh sửa chuyển cảnh và cỡ nhãn minh họa.

Kế hoạch tổng thể giữ `in-progress`: các tiêu chí quay runtime thật, kiểm chứng provider và người dùng duyệt hình/âm thanh chưa đạt. Không đánh dấu hồi tố đã quay thật hoặc đã duyệt. Các phần montage hiện dùng editor/hội thoại/project từ screenshot, chưa trình bày terminal/task chạy thật.

Hướng dẫn và nguồn tài sản: [production-guide.md](./production-guide.md). Kết quả bàn giao/kiểm tra cuối sẽ nằm trong [production-report.md](./production-report.md).

Bản đầu đã xuất: main 2250 frame/75s, teaser 750 frame/25s và poster. [Báo cáo bàn giao](./production-report.md) ghi kiểm tra và những tiêu chí còn mở.


## Điều chỉnh được người dùng duyệt — app thật và nhịp 1,5×

Người dùng duyệt hướng chuyển động V2 và yêu cầu tăng tốc 1,5×, bỏ chú thích góc dưới, mở app trực tiếp để chụp và dùng subagent hỗ trợ. Bản sửa dùng ảnh native Studio tải từ release chính thức studio-v1.7.0, camera/typing/chuyển mục trong Remotion; main đổi từ 75 thành 50 giây ở 60 fps. Nhạc để sau. Không có phiên AI thực thi được xác minh vì runtime/model chưa cấu hình; cảnh quyền dùng hướng dẫn thật và hộp workspace trust. Plan vẫn in-progress cho runtime footage và duyệt cuối.


## Hướng Claude được duyệt — 24/10/2026 10:01

Người dùng xác nhận bản thử Claude tốt hơn nhiều và duyệt dựng bản hoàn chỉnh theo review. Phạm vi hiện hành: khoảng42s, 1920×1080/60fps, UI minh họa sạch theo thiết kế đã duyệt; không yêu cầu screenshot app chính xác hoặc runtime hoạt động. Giữ bản thử10s để so sánh, bỏ đoạn chữ “Có ý tưởng?” thu nhỏ thành placeholder khó đọc. Nhạc tiếp tục để sau; không có chú thích góc dưới.

Mạch hoàn chỉnh: intro/chat/typing → diff/phê duyệt/kết quả giao diện tối → dropdown model → gõ tìm task/kéo sang hoàn tất → recap → CTA. Bằng chứng nghiệm thu: đúng2520frame/42s, decode không lỗi, source typecheck, kiểm tra caption không cắt chữ/click đúng mục tiêu/không mất đoạn chuyển cảnh. Claude viết continuation trong cwd riêng, Codex điều phối computer use/render/review. Các yêu cầu footage runtime thật cũ không còn là điều kiện của revision này theo quyết định mới của người dùng; không mô tả minh họa như thao tác thật.


## Revision website và nhạc — 25/10/2026

Người dùng yêu cầu thêm tính năng từ website và lồng nhạc. Đã xuất bản70s theo phong cách Claude được duyệt; nội dung, file và kiểm tra ghi tại [production-report.md](./production-report.md). Còn chờ phản hồi thẩm mỹ của người dùng; không coi các mock UI là footage runtime thật.
