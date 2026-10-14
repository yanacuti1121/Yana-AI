# Yana Office: slides, reports, PowerPoint (phiên B)

Cập nhật 2026-10-14. File này do phiên B giữ. Phiên A không sửa.

## Trạng thái

| Mã | Việc | Trạng thái |
|---|---|---|
| Khung | Tab "Yana Office", lệnh `Yana: Open Office Tools`, dò công cụ | Xong, test `tests/office.test.cjs` đạt |
| H1 | Slide từ Markdown bằng Marp | Xong phần mã: xem trước, xuất PDF và PPTX ảnh. Test `office-slides.test.cjs` (có 1 lần xuất PDF thật). Chưa xem trong cửa sổ thật |
| H3 | File `.pptx` sửa được bằng PptxGenJS | Xong phần mã: dùng chung ô Markdown, `---` ngăn slide, `#` tiêu đề, `-` gạch đầu dòng. Test `office-pptx.test.cjs` (mở file thật). Chưa xem trong cửa sổ thật |
| H2 | PDF bằng Typst | Chưa cài. Đề xuất `brew install typst` (0.15.1, Apache-2.0). Chờ anh Tâm |
| H4 | Word và Excel | Xong phần mã (2026-10-14): ghi Word `.docx` và `.odt`, ghi Excel `.xlsx` từ bảng Markdown (mỗi bảng một sheet), đọc cả ba. Chưa xem trong cửa sổ thật |
| H5 | AI dựng cả bộ slide | Để sau |
| File đợt 1 | Mở `.md` `.txt` `.csv`, chèn ảnh PNG/JPG/GIF/WebP, xuất HTML và Markdown, bảng và ảnh trong PPTX sửa được | Xong phần mã. Test `office-files.test.cjs` 42 mục. Giao diện đã thử trong bản giả lập trình duyệt, chưa xem trong cửa sổ thật |
| File đợt 2 | Mở `.docx` `.pptx` `.xlsx` `.odt` `.odp` `.ods` `.pdf` `.rtf` thành Markdown để dựng slide | Xong phần mã bằng `officeparser`. Test `office-documents.test.cjs` 36 mục (có PDF thật từ Marp, file hỏng, file lớn, kiểm không mở kết nối mạng) |

### Kết quả rà soát bảo mật (2026-10-14, người xem độc lập, chỉ đọc)

Đã sửa hết trong cùng ngày, mỗi mục có test hồi quy (đỏ trên bản cũ, xanh trên bản mới; 165 mục Office):

| Mã | Lỗi | Cách sửa |
|---|---|---|
| S1 | Thời hạn 60 giây không có tác dụng: dùng khóa `signal`, `officeparser` chỉ nhận `abortSignal`. Một docx 60 KB với 1,8 triệu phần tử XML tốn 2,4 GB RAM | Dùng `abortSignal`; thêm `decompressionLimits` (64 MB giải nén, 200 nghìn phần tử XML, 100 nghìn ô bảng) |
| S2 | Regex ảnh bậc hai: 256 KB văn bản treo extension host 11 giây | Bộ quét tuyến tính có nhớ vị trí (hiện vài mili giây) |
| S3 | `tidy` bậc hai trên chuỗi ` {#` lặp | Giới hạn `{0,64}` và cắt đầu ra thô trước khi xử lý |
| S4 | Đường dẫn trong tài liệu (UNC `//host/x`, `\\host\x`) được đưa vào `fs.realpathSync` trước khi kiểm tra danh sách cho phép: trên Windows mở kết nối SMB tới máy lạ | Sổ đăng ký tra theo đúng chuỗi tham chiếu đã phát ra, không bao giờ đưa đường dẫn từ tài liệu vào hệ thống file |
| S5 | "Export HTML" dùng cờ `--html` của Marp (bật thẻ HTML thô), nên `<script>` trong Markdown chạy được trong file xuất | Không truyền cờ (HTML là mặc định theo đuôi file) |
| C1 đến C6, P1, P2 | Tên file có ngoặc đơn, đường dẫn ổ Windows bị coi là URL, ký tự điều khiển làm hỏng `.pptx`, tên sheet và số `007` trong Excel, `SAVE_FILTERS['constructor']`, thư mục tạm không dọn, ảnh PPTX không có trần tổng và không khử trùng lặp, data URI bỏ qua mọi giới hạn | Đã sửa từng mục |

Chưa xác định (người xem không chứng minh được rò rỉ): ảnh web kiểu tham chiếu `![a][r]` hoặc `url()` trong `style:` của front matter khi xuất PDF bằng Chrome. Preview không mở mạng (iframe `sandbox`, CSP `default-src 'none'`).

### Cách file được xử lý

- Mở file: chỉ qua hộp thoại mở của IDE. Ảnh trong Markdown chỉ được nhúng nếu chính người dùng chọn nó bằng nút "Insert image" trong phiên này; đường dẫn gõ tay không bao giờ được đọc. Ảnh từ web bị gỡ khi xem trước và xuất (không để bộ dựng tự tải).
- Ghi file: chỉ sau hộp thoại lưu của IDE (đó là bước duyệt).
- Giới hạn: văn bản 256 KB, ảnh 5 MB mỗi cái và 25 MB tổng, tài liệu 25 MB, CSV 500 dòng 20 cột, bảng PPTX 30 dòng, Excel 20 sheet 1000 dòng 50 cột, chuyển đổi tối đa 60 giây.
- Excel: ô chỉ là số khi trông đúng là số, còn lại ghi dạng chuỗi nên ô bắt đầu bằng `=` không bao giờ thành công thức. Bộ ghi tự viết bằng `jszip`, không dùng thư viện Excel nào.
- `officeparser` có OCR dùng `tesseract.js` (tải dữ liệu ngôn ngữ từ mạng). OCR luôn tắt (`ocr: false`), không trích ảnh khi đọc.
- Chưa làm: ghi PDF từ Markdown bằng engine gốc của `officeparser` (thử thấy lỗi "PDF generation failed"), nên PDF vẫn xuất bằng Marp.

## Gói đã cài (thư mục `tools/yana-ide/extensions/yana-agent/office/`)

Ghim đúng phiên bản, cài bằng `--ignore-scripts`, có `package-lock.json`.

| Gói | Phiên bản | Giấy phép | Phát hành |
|---|---|---|---|
| `@marp-team/marp-cli` | 4.5.1 | MIT | 2026-09-06 |
| `pptxgenjs` | 4.0.1 | MIT | 2025-06-26 |
| `officeparser` | 8.1.1 | MIT | 2026-10-05 |
| `jszip` | 3.10.2 | MIT or GPL-3.0-or-later (dùng theo MIT) | đã có sẵn trong cây (qua `pptxgenjs`), nay ghim trực tiếp |

Đã thử và bỏ: `mammoth` 1.13.0. `npm audit` báo thêm 3 lỗ hổng mức vừa (`argparse` → `sprintf-js`, DoS khi định dạng chuỗi), bản sửa duy nhất là hạ xuống 0.3.29. `officeparser` đã đọc và ghi được Word nên `mammoth` là thừa, đã gỡ. Trước khi gỡ, em kiểm `argparse` chỉ nằm trong `mammoth/bin` (dòng lệnh), không nằm trên đường dùng thư viện.

Kết quả `npm audit` sau khi thêm `officeparser` và ghim `jszip`: 12 mục (2 thấp, 10 cao), đúng bộ đã được chấp nhận ở bảng dưới. `officeparser` không thêm lỗ hổng nào.

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
