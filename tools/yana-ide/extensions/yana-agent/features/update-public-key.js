'use strict';
// Khoá công khai Ed25519 dùng để xác minh tệp thông tin phiên bản mới (https://yana.vutam.link/latest.json).
// Để trống = bản build này chưa bật kiểm tra bản mới: app không gửi yêu cầu nào ra ngoài.
// Tạo cặp khoá bằng `node tools/yana-ide/scripts/sign-update-manifest.mjs generate --out <thư mục ngoài repo>`,
// dán nội dung update-public-key.pem vào đây, và giữ update-private-key.pem OFFLINE, không bao giờ commit.

module.exports = { UPDATE_PUBLIC_KEY_PEM: '' };
