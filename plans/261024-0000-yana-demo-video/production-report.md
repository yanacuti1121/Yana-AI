# Bàn giao bản dựng đầu tiên — Yana demo

## Kết quả

Đã xuất video bằng Remotion 4.0.538, tiếng Việt, ảnh Studio trong repository và motion graphics, nhạc tổng hợp riêng. Ba file bàn giao:

- [Video 75 giây](../../tools/yana-promo/out/yana-demo-vi.mp4)
- [Teaser 25 giây](../../tools/yana-promo/out/yana-teaser-vi.mp4)
- [Poster](../../tools/yana-promo/out/yana-poster.png)

[Hướng dẫn render/chỉnh sửa](./production-guide.md), [nguồn tài sản](../../tools/yana-promo/asset-provenance.json).

## Bằng chứng kiểm tra

`npm test`: 4 tests, 4 pass, 0 fail. `npm run typecheck`: exit 0. `npm run verify`: cả hai MP4 là H.264/AAC, 1920×1080, 30fps.

| File | Duration container | Frame | Byte |
|---|---|---|---|
| yana-demo-vi.mp4 | 75.008000s | 2250 | 16,681,474 |
| yana-teaser-vi.mp4 | 25.003000s | 750 | 4,938,586 |

Duration hình chính xác 2250/30 = 75s và 750/30 = 25s; phần lẻ container do audio/codec padding.

FFmpeg giải mã toàn bộ hai file không báo lỗi. Blackdetect (`d=0.04:pix_th=0.04:pic_th=0.99`): 0 khoảng đen cho cả hai. Main có moov trước mdat, hỗ trợ phát web sớm.

Âm thanh đã encode trong MP4: main -16.5 LUFS, true peak -1.7 dBFS; teaser -16.5 LUFS, true peak -2.1 dBFS. Không vượt 0 dBFS theo phép đo. Log ở `tools/yana-promo/out/quality-main.log` và `quality-teaser.log`.

Đã xem các styleframe của tám cảnh, poster, contact sheet từ MP4, và khung cắt sau sửa. Nhãn minh họa tăng từ 24 lên 32px; bỏ opacity fade toàn scene để không có frame cắt trống. Các kiểm tra hình này là lấy mẫu, chưa thay thế việc người dùng xem/nghe duyệt toàn bộ.

## Review và quyết định

Review source độc lập không phát hiện lỗi render nghiêm trọng. Góp ý về nhạc WAV/MP3 được xử lý bằng `npm run score` và guide; provenance đã ghi trong JSON. Tester độc lập xác nhận 4/4 test và typecheck, các styleframe đầu không clipping; góp ý frame trống tại cut đã được sửa và render lại.

Không sửa app/runtime/website; không commit, push hoặc publish. Chỉ thêm project video và cập nhật kế hoạch. Không có dev server hay tiến trình render cần giữ lại.

## Phần còn mở

Đây là bản giới thiệu dùng screenshot và minh họa, **chưa phải video quay thao tác runtime thật**. Chưa xác minh một phiên chạy provider/phê duyệt/audit thực tế. Các nhãn minh họa được giữ trong video. Chưa có voice-over, bản dọc hoặc phản hồi thẩm mỹ của người dùng.

Plan tổng thể giữ in-progress vì yêu cầu footage thật và duyệt cuối còn mở. Có thể dùng ngay bộ file này để review nội dung và phong cách; thay các cảnh minh họa bằng recording khi có build cụ thể.

Kiểm tra bổ sung: tester nghi prefix “Minh họa” bị thiếu ở cảnh model. Đã xem trực tiếp `models-final.png` và frame trích từ MP4 tại giây 54 (`models-from-mp4.png`): cả hai hiện đầy đủ “Minh họa kết nối model · không phải thao tác chuyển model trực tiếp”. Không thay source theo nhận định này vì bằng chứng render không xác nhận lỗi.


## Bản sửa app thật, tốc độ 1,5× — 24/10/2026

V1 ở trên là lịch sử. Bản mới: [main 50s](../../tools/yana-promo/out/yana-real-fast.mp4), [10 giây đầu](../../tools/yana-promo/out/yana-real-fast-first-10s.mp4), [teaser](../../tools/yana-promo/out/yana-real-fast-teaser.mp4). Dùng ảnh chụp app trực tiếp, typing qua năm trạng thái ô chat thật, camera mới theo bố cục capture, chuyển mục/crossfade. Bỏ chú thích góc dưới, tắt nhạc theo yêu cầu.

Main: ffprobe H.264 1920×1080, 60/1 fps, 3000 frame, 50.000000s, không audio. Teaser: 1000 frame, 16.666667s. Preview: 600 frame, 10s (encode riêng để tránh padding B-frame khi stream-copy). Typecheck exit 0; 8/8 tests pass. Reviewer kiểm tra 20 tham chiếu/15 ảnh không thiếu; camera 9028 mẫu không NaN/Infinity, đúng endpoints. FFmpeg giải mã đủ 3000 frame, exit 0, không blackdetect interval. Đã xem contact sheet từ MP4.

App tải từ release chính thức studio-v1.7.0; bundle hiển thị 1.141.0 và extension báo 1.6.2, không suy diễn đồng nhất với source hiện tại. Không có yana-rt/model hoạt động, không gửi chat, không cấp workspace trust. Cảnh hướng dẫn là UI help, cảnh hỏi quyền là prompt của IDE; chưa phải thẻ duyệt công cụ từ phiên AI thật. Hai capture lỗi permissions/commands được loại khỏi composition. Nguồn và giới hạn ghi trong asset-provenance.json.

Subagents hỗ trợ clock 1,5×, tìm luồng UI thật, dựng stage ảnh và kiểm tra source. Không commit/publish/sửa sản phẩm. Render đã kết thúc; không còn dev server/renderer cần giữ. App vẫn mở từ volume Yana Studio để người dùng xem trực tiếp.


## Bản hoàn chỉnh theo hướng Claude đã duyệt — 24/10/2026

[Video42s](../../tools/yana-promo/out/yana-claude-full.mp4), [poster](../../tools/yana-promo/out/yana-claude-full-poster.png). Source `tools/yana-promo/src/claude-film/`, composition `YanaClaudeFilm`. Người dùng duyệt style bản10s và yêu cầu dựng đủ; chữ intro giữ112px, rời khung trướcframe110 thay vì thu nhỏ làm placeholder.

Luồng: hội thoại/typing → diff/duyệt → preview giao diện sáng→tối → dropdown model → tìm task/kéo hoàn tất → recap → CTA. UI minh họa theo quyết định người dùng; không quay app lỗi, không nhãn góc dưới, không audio. Không đưa claim phiên AI thật đã thực thi.

Bằng chứng: ffprobe H.264,1920×1080,60/1fps,2520frame,42.000000s,chỉ1streamvideo. FFmpeg giải mã đủ2520frame,exit0; blackdetect không có interval. Typecheck projectexit0;8/8 regression tests cũ qua (không dùng chúng thay cho kiểm tra film42s). Source review độc lập xác nhận cursor/dropdown/taskgeometry, headline ngoài camera, CTA trong khung. Codex dùng computer use xemframe810,1138,1700,2460 và contact sheet từMP4; Studio current error=null.

Claude process exit0,596.9s,không timeout; chỉ scopedfiletools trong cwd riêng. Source được tích hợp sau review. Serverpreview3107 đã dừng; không commit/push/publish hoặc sửa sản phẩm. Còn mở: duyệt thẩm mỹ toàn bản và lựa chọn âm thanh sau này.


## Bản mở rộng theo website, có nhạc — 25/10/2026

Đầu ra: `tools/yana-promo/out/yana-website-with-music-final.mp4`; composition `YanaWebsiteFilm`, source `tools/yana-promo/src/site-film/`. Giữ motion được duyệt, thêm phạm vi quyền, audit, kết nối riêng và tính liên tục dự án; UI minh họa theo quyết định người dùng. Claude làm base đã duyệt và hỗ trợ copy; Codex tích hợp cảnh mới, chỉnh lời, nhạc và QA.

Kiểm tra thực tế: render exit 0; ffprobe H.264 1920×1080,60fps,4200frame,70.000s; AAC70.016s. FFmpeg decode đủ4200frame exit0, không có blackdetect interval/error. Audio −16.3LUFS,truepeak−0.9dBFS. Đã xem contact sheet từ MP4 và kiểm tra GUI các cảnh quyền, connector, continuity; sửa cursor theo vị trí DOM. Preview3107 đã dừng, không còn process Remotion render/studio.

Nhạc: “Gimme that Groove!” — Michael Ramir C., Mixkit; https://mixkit.co/free-stock-music/funk/ ; giấy phép https://mixkit.co/license/#musicFree ; nguồn https://assets.mixkit.co/music/872/872.mp3 . Nhạc trim70s, fadein/out, thêm UI FX tự tạo, normalize rồi encode. File local trong `public/audio/`. Website tham chiếu https://yana.vutam.link/ và snapshot trong `out/site-research/`. Không commit/push/publish.
