# Kiểm tra bản mới của Yana Studio (soạn 2026-10-15)

App hỏi `https://yana.vutam.link/latest.json` mỗi ngày một lần và hiện thông báo nếu có bản mới. Nó **chỉ thông báo**: không tự tải,
không tự cài, không chạy gì. Mã: `tools/yana-ide/extensions/yana-agent/features/update-check.js`. Test: `tools/yana-ide/tests/update-check.test.cjs`
(34 đạt).

## Vì sao phải ký

App chưa ký nên hệ điều hành không giúp người dùng biết một "bản mới" có thật hay không. Trang `yana.vutam.link` là trang tĩnh trên GitHub
Pages (thư mục `docs/` của repo `Yana-AI`): ai ghi được vào repo thì sửa được trang. Vì vậy `latest.json` kèm chữ ký Ed25519 (`latest.json.sig`)
và khoá công khai nằm trong app. Khoá riêng nằm ngoài repo, ngoài mạng. Không có khoá riêng thì không đẩy được "bản mới" giả.

## Dữ liệu app gửi đi (để viết đúng vào trang quyền riêng tư)

Một yêu cầu GET tới `https://yana.vutam.link/latest.json` và `latest.json.sig`, chỉ kèm `User-Agent: YanaStudio/<phiên bản>`. Không định danh máy, không
thư mục dự án, không cookie, không theo chuyển hướng, tối đa 10 giây và 16 KiB. GitHub (máy chủ trang) thấy địa chỉ IP như với mọi trang web.
Tắt bằng cài đặt `yana.updates.check` (mặc định bật; có nút "Don't Check Again" trong thông báo).

## Việc anh Tâm phải làm một lần

1. Tạo cặp khoá **ở ngoài repo**: `node tools/yana-ide/scripts/sign-update-manifest.mjs generate --out ~/yana-keys`.
   Giữ `update-private-key.pem` offline (ổ đĩa rời hoặc trình quản lý mật khẩu), không commit, không gửi qua chat.
2. Dán `update-public-key.pem` vào `extensions/yana-agent/features/update-public-key.js`. Khi file đó còn trống, app **không gửi yêu cầu nào**.
3. Quyết định nguồn phiên bản của app: hiện lấy từ `package.json` của tiện ích `yana-agent` (0.1.0). Nên có một trường phiên bản riêng của sản phẩm
   (ví dụ `yanaVersion` trong `product.overrides.json`) và ghi vào `VERSIONING.md`.

## Mỗi lần phát hành

1. Soạn `docs/latest.json`:
   ```json
   { "schema": 1, "channel": "stable", "version": "1.6.0", "released": "2026-10-20",
     "notes": "Improvements and fixes.", "downloadUrl": "https://yana.vutam.link/download", "security": false }
   ```
   `security: true` làm thông báo thêm câu "We recommend updating." (không nêu chi tiết lỗi).
2. Ký: `node tools/yana-ide/scripts/sign-update-manifest.mjs sign --key ~/yana-keys/update-private-key.pem --manifest docs/latest.json`. Script từ chối ký
   tệp mà chính app sẽ từ chối, và tự xác minh lại chữ ký trước khi ghi `docs/latest.json.sig`.
3. Commit cả hai tệp. Chỉ đẩy `latest.json` **sau khi** bản tải đã sẵn sàng ở `/download`, vì ngay khi đẩy, người dùng sẽ thấy thông báo.

## Giới hạn đã biết

- Chữ ký không chống được việc phát lại một `latest.json` cũ (chỉ che việc có bản mới, không đẩy người dùng tới bản nguy hiểm): chấp nhận.
- Thông báo chỉ mở trang tải. Việc người dùng tải đúng tệp và kiểm sha256 là ở trang `/download` (xem `RELEASE-CHECKLIST.md`, mục F).
- Kiểm tra chưa gặp một khoá thật hay một `latest.json` thật, vì chưa có. Đã thử đường mạng thật tới trang: thiếu `latest.json` cho lỗi 404 rõ ràng.
