# Bàn giao cho Claude — Yana Studio Native

## Mục tiêu hiện tại

Tiếp quản và hoàn thiện ứng dụng macOS native của Yana Studio trong thư mục này.
Ưu tiên trước mắt là làm màn đăng nhập hoạt động thật, sau đó đối chiếu tính năng
với bản Electron cũ mà không ghi đè hoặc vô tình xóa dữ liệu local hiện có.

## Trạng thái Git

- Nhánh hiện tại: `codex/studio-continuity-and-model-discovery`.
- Commit native nền gần nhất: `0f8edda4 feat(studio): add native macOS test workspace`.
- Các thay đổi native bên dưới đang nằm trong working tree, **chưa commit, chưa push**.
- Repository còn có rất nhiều thay đổi Electron, website và `.yana-ai` từ phiên khác.
  Không stage, reset, hoặc gộp các thay đổi đó chỉ để xử lý native.

## Native đã có

- Local account: file `account-v1.json` trong Application Support, thư mục `0700`,
  file `0600`; local password chỉ được lưu verifier PBKDF/HMAC, không lưu raw password.
- Project picker, file editor an toàn, syntax highlight, chat qua `yana-rt`, tasks,
  runtime approvals, terminal cơ bản, Git read-only, dark/light/system và liquid glass.
- Google OAuth mới được thêm ở working tree:
  - `Sources/YanaStudioNative/GoogleOAuth.swift`
  - chỉ dùng `openid email profile`;
  - dùng system browser + loopback `127.0.0.1` + PKCE S256 + `state`;
  - không nhúng client secret và không ghi access/refresh token xuống đĩa;
  - Google Client ID công khai nằm trong `App/Info.plist`.

## Lỗi Google đang thấy

Người dùng bấm Google, browser quay callback về native app, sau đó app hiện:

`Google không xác nhận được phiên đăng nhập này.`

Điều này xác nhận callback đã đến app; lỗi nằm tại bước token exchange hoặc cấu
hình Google Cloud. Source hiện tại đã có phiên bản thông báo chẩn đoán theo mã
OAuth trong `GoogleOAuth.swift`, nhưng người dùng phải cài ZIP mới nhất để nhìn
thấy mã cụ thể.

Không kết luận Google đã hoạt động end-to-end cho tới khi một tài khoản thật đăng
nhập thành công. Cần kiểm tra tại Google Cloud Console:

1. Client ID phải có loại **Desktop app**, không phải Web application.
2. Nếu consent screen ở chế độ Testing, email của người dùng phải được thêm vào
   danh sách Test users.
3. Không thêm `client_secret` vào app native.

Google chính thức hỗ trợ loopback callback cho desktop app và khuyến nghị PKCE:
https://developers.google.com/identity/protocols/oauth2/native-app

## Lỗi local account cần xử lý

Người dùng báo nút `Tạo hồ sơ local` không hoạt động. Chưa có reproduction hay
log đủ để kết luận nguyên nhân.

Luồng hiện tại:

- UI: `Sources/YanaStudioNative/StudioViews.swift`, `AccountEntrySurface`.
- Nút chỉ bật khi có tên, email không rỗng, password tối thiểu 10 ký tự và password
  confirmation giống nhau.
- Store: `StudioStore.createLocalAccount(...)`.
- Persistence: `LocalAccountStore.create(...)` trong `LocalAccount.swift`.

Hướng xử lý an toàn:

1. Reproduce bằng profile storage trống trong test, không xóa account thật của người dùng.
2. Hiển thị nguyên nhân validation ngay dưới từng trường hoặc khi nút bị vô hiệu hóa.
3. Nếu có hồ sơ cũ, không ghi đè: báo rõ account đang tồn tại và hướng dẫn unlock.
4. Thêm test cho trạng thái disabled/enabled hoặc tách validation thành hàm testable.

## Asset/giao diện

Người dùng muốn màn native có hình ảnh/điểm nhấn, vì nền gradient + icon chữ hiện
trông quá trống. Một lần tạo asset nguyên bản bằng image generation bị chặn bởi
usage limit; **chưa có thay đổi giao diện/asset nào từ yêu cầu này**. Có thể tạo
minh hoạ SwiftUI glass nguyên bản hoặc thêm asset do người dùng cung cấp, nhưng
không copy artwork của sản phẩm khác.

## ZIP mới nhất

`release/Yana Studio Native-arm64-google-diagnostics-test.zip`

SHA-256:

`e4b7373955764df0544475958d4a2d94c63ed8a3b7600b9f54830a08a05a75e9`

Đây là test app Apple Silicon (macOS 14+, ad-hoc signed), không notarized và
không phải release public.

## Xác minh đã chạy cho ZIP mới nhất

Ngày 2026-09-15, local pipeline đã có output:

- `swift test`: 10 tests, 0 failures.
- `zsh scripts/build-app.sh`: tạo `.app` release.
- `plutil -lint`: OK.
- `codesign --verify --deep --strict`: thành công.
- `file .../YanaStudioNative`: arm64.
- `unzip -t`: không có lỗi dữ liệu nén.
- `git diff --check -- tools/yana-studio/native-macos`: không có whitespace error.

Không có bằng chứng CI GitHub hoặc OAuth browser end-to-end trong phiên này.

## Lệnh kiểm tra trước khi giao ZIP tiếp theo

```sh
cd /Users/vutam/Desktop/Yana-AI/tools/yana-studio/native-macos
swift test
zsh scripts/build-app.sh
plutil -lint "release/Yana Studio Native.app/Contents/Info.plist"
codesign --verify --deep --strict "release/Yana Studio Native.app"
file "release/Yana Studio Native.app/Contents/MacOS/YanaStudioNative"
```

Tạo ZIP tên mới, kiểm tra `unzip -t` và SHA-256. Không xóa các ZIP test cũ trừ
khi người dùng xác nhận rõ.

## Ranh giới an toàn

- Không đọc hoặc commit `.env`, token, key, hay client secret.
- Không force push, reset, hoặc xóa Application Support của người dùng.
- Chỉ commit/push sau khi người dùng phê duyệt endpoint và nội dung thay đổi.
- Giữ rõ: Google Client ID là public; client secret không được đưa vào app desktop.
