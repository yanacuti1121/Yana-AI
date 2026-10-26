# Hướng dẫn bản dựng video Yana

## Bản dựng hiện tại — Claude 42 giây

`YanaClaudeFilm`: 42s/2520frame/60fps, 1920×1080, silent. Người dùng duyệt hình ảnh bản thử10s, yêu cầu bỏ chữ “Có ý tưởng?” thu nhỏ rồi mở rộng toàn phim. Bản này dùng UI minh họa sạch, không có chú thích góc dưới; không mô tả là ghi hình runtime thật. Nhạc để sau theo yêu cầu.

Source `tools/yana-promo/src/claude-film/`: `film.tsx` sở hữu camera/hội thoại/duyệt/endcard, `journey.tsx` sở hữu preview website/model/task, `shared.ts` giữ geometry và timing helpers, `root.tsx` khai báo composition. Bản thử10s vẫn giữ trong `src/claude-test/` để so sánh.

Từ `tools/yana-promo/`:

```sh
npm run typecheck
npx remotion render src/index.ts YanaClaudeFilm out/yana-claude-full.mp4 --codec=h264 --crf=18 --concurrency=3
npx remotion still src/index.ts YanaClaudeFilmPoster out/yana-claude-full-poster.png
```

Video `out/yana-claude-full.mp4`, poster `out/yana-claude-full-poster.png`. Preview dùng `npm run studio` ở port3107; dừng server khi kiểm tra xong. Các lệnh `npm run render/teaser/poster/verify` phía dưới vẫn trỏ bản V1, không phải bản Claude hiện tại.

Các phần dưới lưu cách tái tạo V1 và bản screenshot50s; giới hạn/nhãn của các revision cũ không áp dụng thay cho quyết định mới của người dùng.

## Cài đặt và render

Yêu cầu Node 24+, npm; FFmpeg/ffprobe cần cho tạo lại nhạc và kiểm tra metadata. Từ root repository:

```sh
cd tools/yana-promo
npm ci
npm run typecheck
npm test
npm run render
npm run teaser
npm run poster
npm run verify
```

`npm run studio` mở Remotion Studio ở port cố định 3107. Kiểm tra port trước khi chạy, tái sử dụng nếu đúng project, dừng tiến trình do mình tạo khi xong. Các lệnh render là foreground và tự kết thúc; không cần dev server thường trực.

Đầu ra:

- `tools/yana-promo/out/yana-demo-vi.mp4`
- `tools/yana-promo/out/yana-teaser-vi.mp4`
- `tools/yana-promo/out/yana-poster.png`

MP4 dùng H.264/AAC và CRF 18. Remotion và các package `@remotion/*` được ghim cùng phiên bản 4.0.538. Kiểm tra [giấy phép Remotion](https://www.remotion.dev/license) theo điều kiện tổ chức khi tái sử dụng; không có mua dịch vụ hoặc render cloud trong phiên này.

## Chỉnh sửa

- `src/content.ts`: mốc thời gian, tổng số frame, điểm cắt teaser.
- `src/theme.ts`: màu, font và shadow.
- `src/scenes/brand-scenes.tsx`: mở đầu, workspace, kết thúc.
- `src/scenes/work-scenes.tsx`: ngữ cảnh, phê duyệt, sơ đồ dấu vết, montage.
- `src/scenes/model-scene.tsx`: cloud/local.
- `src/components.tsx`: logo, screenshot, con trỏ và nhãn minh họa.

Không bỏ nhãn minh họa trừ khi thay bằng footage thật đã kiểm tra. Khi đổi asset/font hoặc nhãn, render lại các khung liên quan trước khi xuất toàn bộ.

## Nhạc nền và nguồn tài sản

`asset-provenance.json` liệt kê nguồn ảnh, logo, font, icon và nhạc. Nunito/Patrick Hand đi kèm giấy phép OFL trong `public/fonts/`. Icon từ Lucide theo ISC. Logo và ảnh lấy từ nội dung repository do người dùng cung cấp; không suy diễn giấy phép nguồn mở của code thành quyền sở hữu nhãn hiệu của bên khác.

Nhạc được tổng hợp bằng sine/overtones, bass, percussion và noise có seed cố định, không sử dụng bản ghi thương mại hoặc giọng người khác. Tạo lại toàn bộ WAV và MP3:

```sh
npm run score
```

Lệnh này chạy `generate-score.mjs` rồi `prepare-audio.mjs`. Video dùng MP3; chỉ tạo lại WAV sẽ chưa đổi nhạc trong video. MP3 được chuẩn hóa bằng FFmpeg `loudnorm=I=-16:TP=-2:LRA=8`, 44.1 kHz, 192 kbps. Các hiệu ứng chuyển cảnh/click được trộn trong score.

## Giới hạn và bước review

Chưa quay bản Studio chạy thật; chưa thử provider thật; chưa có duyệt thẩm mỹ hoặc phản hồi từ người dùng về bản dựng. Kiểm tra kỹ thuật không thay thế nghe/xem duyệt cuối. Không sửa app, chính sách runtime, website, không commit hoặc publish.

Muốn nâng thành demo thao tác thật: chọn build Studio cụ thể, quay dự án mẫu vô hại, kiểm tra phê duyệt/kết quả cùng phiên rồi thay từng cảnh minh họa. Giữ bản này để so sánh trước/sau.


## Bản sửa dùng app thật, tốc độ 1,5× — 24/10/2026

Các giới hạn phía trên mô tả V1. Composition `YanaFast` dùng ảnh chụp trực tiếp bản phát hành Studio, hiệu ứng camera, chuyển mục và năm bước soạn yêu cầu thật trong ô chat. Đây là dựng ảnh chụp, chưa phải ghi hình AI thực thi. App đang thiếu runtime/model; không dựng câu trả lời hoặc kết quả chạy lệnh. Hộp workspace trust được chụp rồi hủy.

Main 50 giây/3000 frame/60 fps; teaser 1000 frame/60 fps. Bỏ chú thích góc dưới theo yêu cầu. Tạm tắt nhạc. `src/playback.ts` giữ tốc độ 1,5× trên clock thiết kế; `src/real-app-stage.tsx` sở hữu ảnh/camera/caption thực tế.

```sh
npx remotion render src/index.ts YanaFast out/yana-real-fast.mp4 --codec=h264 --crf=18 --concurrency=3
npx remotion render src/index.ts YanaFastTeaser out/yana-real-fast-teaser.mp4 --codec=h264 --crf=18 --concurrency=3
ffmpeg -i out/yana-real-fast.mp4 -frames:v 600 -an -c:v libx264 -preset veryfast -crf 18 -movflags +faststart out/yana-real-fast-first-10s.mp4
```

Nguồn build và trạng thái capture: `tools/yana-promo/asset-provenance.json`. App được mở từ volume `/Volumes/Yana Studio`; còn mở để người dùng kiểm tra. Không có dev server của video cần giữ lại.
