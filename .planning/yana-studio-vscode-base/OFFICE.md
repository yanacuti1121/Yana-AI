# Yana Office: slides, reports, PowerPoint (phiên B)

Cập nhật 2026-10-14. File này do phiên B giữ. Phiên A không sửa.

## Trạng thái

| Mã | Việc | Trạng thái |
|---|---|---|
| Khung | Tab "Yana Office", lệnh `Yana: Open Office Tools`, dò công cụ | Xong, test `tests/office.test.cjs` đạt |
| H1 | Slide từ Markdown bằng Marp | Xong phần mã: xem trước, xuất PDF và PPTX ảnh. Test `office-slides.test.cjs` (có 1 lần xuất PDF thật). Chưa xem trong cửa sổ thật |
| H3 | File `.pptx` sửa được bằng PptxGenJS | Xong phần mã: dùng chung ô Markdown, `---` ngăn slide, `#` tiêu đề, `-` gạch đầu dòng. Test `office-pptx.test.cjs` (mở file thật). Chưa xem trong cửa sổ thật |
| H2 | PDF bằng Typst | Chưa cài. Đề xuất `brew install typst` (0.15.1, Apache-2.0). Chờ anh Tâm |
| H4 | Word và Excel | Chưa tìm thư viện |
| H5 | AI dựng cả bộ slide | Để sau |

## Gói đã cài (thư mục `tools/yana-ide/extensions/yana-agent/office/`)

Ghim đúng phiên bản, cài bằng `--ignore-scripts`, có `package-lock.json`.

| Gói | Phiên bản | Giấy phép | Phát hành |
|---|---|---|---|
| `@marp-team/marp-cli` | 4.5.1 | MIT | 2026-09-06 |
| `pptxgenjs` | 4.0.1 | MIT | 2025-06-26 |

## Rủi ro đã được anh Tâm chấp nhận (2026-10-14)

`npm audit` trên cả cây phụ thuộc báo 12 lỗ hổng (2 thấp, 10 cao) sau khi chạy `npm audit fix` không `--force`. Các bản sửa còn lại đều là hạ phiên bản (`marp-cli` 0.12.1, `pptxgenjs` 4.0.0), nên không áp dụng.

| Gói có lỗi | Đi từ | Loại lỗi |
|---|---|---|
| `@xmldom/xmldom` | marp-core (qua `mathjax-full`) | ReDoS, chèn nội dung khi tạo XML |
| `basic-ftp`, `extract-zip` | `puppeteer-core` của marp-cli | DoS, ghi file ngoài thư mục qua symlink |
| `image-size` | pptxgenjs | DoS khi đọc ảnh ICNS, JXL, HEIF |
| `katex` | marp-core | ô nhiễm prototype |

Điều kiện đi kèm khi dùng tiếp (anh Tâm chọn phương án này):

1. Mọi thao tác tạo hoặc ghi file qua Marp hay PptxGenJS phải đi qua cổng duyệt của Yana.
2. Chỉ xử lý nội dung do chính người dùng viết hoặc kéo vào. Không nhận file hay ảnh từ nguồn ngoài.
3. Marp dùng Chrome có sẵn trên máy. Không để `puppeteer-core` tự tải trình duyệt (đường `basic-ftp` và `extract-zip` chỉ dùng khi tải).
4. Chạy lại `npm audit` mỗi khi nâng phiên bản và cập nhật bảng này.

Ghi chú: gói `https@1.0.0` mà pptxgenjs phụ thuộc chỉ có `package.json`, không có mã.

## Quy ước cho phiên B

- Chỉ tạo hoặc sửa file thuộc phần B. Không sửa `Settings.tsx`, `PrivacyData.tsx`, `ModelManager.tsx`, `i18n.ts`.
- Không commit, không push.
- Mỗi tính năng có test, và phần giao diện phải xem trong cửa sổ thật bằng `screencapture`.
