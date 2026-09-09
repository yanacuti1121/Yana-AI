# Yana Studio

**Một app mới. Không phải bản đổi giao diện của Yana Desktop cũ.**

Thiết kế gốc của **Vũ Văn Tâm**, từ `Yana Desktop - Main Workspace.dc.html`.
Đây là bản phát triển 0.1.0: xây nền làm việc thật trước, không lấp giao diện
bằng số liệu hoặc nút bấm giả.

## Chạy trên máy này

```sh
cd /Users/vutam/Desktop/Yana-AI/tools/yana-studio
npm start
```

Mở thẳng một project, không thay đổi file của project khi khởi động:

```sh
npm start -- --project /Users/vutam/Desktop/Yana-AI
```

Tên cửa sổ/menu là **Yana Studio**, có nhãn **NEW**. Không mở `tools/yana-desktop`,
không sử dụng `tools/yana-web/server.js`, không tự bật Chrome/code-server.
App đang cài trong `/Applications/Yana AI.app` không bị thay thế.

## Cài development dependencies trên máy khác

Node 24+ và bộ công cụ C++ phù hợp cho node-pty (Xcode command-line tools trên
macOS; compiler/make/Python trên Linux; Visual Studio C++/Windows SDK trên Windows).

```sh
npm ci
npm run rebuild
npm run stage:runtime -- /absolute/path/to/native/yana-rt
npm start
```

Runtime đang dùng để kiểm chứng là binary build riêng từ Yana main `31eda0bd`.
Không build từ checkout cũ rồi cho rằng đã có giao thức mới. `stage:runtime`
kiểm tra phản hồi lỗi JSON với input rỗng, chép binary theo đúng OS/architecture
và ghi SHA-256 vào manifest. Đây là phép thử giao thức tối thiểu, không thay
thế kiểm thử end-to-end. Binary và manifest sinh ra nằm trong `runtime/`, không
được commit. Có thể chọn binary bằng **Models & Runtime → Chọn yana-rt**.

## Những đường thao tác đã được triển khai

- Mở thư mục thật, lưu recent projects; không copy repository vào app storage.
- Terminal PTY thật, tab riêng, chia đôi hoặc lưới tối đa 12 phiên, resize shell, tìm kiếm, scrollback;
  tab/Settings ẩn không làm chết hoặc tạo lại shell.
- Mặc định mở vùng Terminal lớn; chọn Trò chuyện để quay về chat + dock.
  ⌘⇧D (Windows/Linux: Ctrl+Shift+D) thêm terminal vào lưới;
  ⌘⇧←/→ chuyển phiên. Mỗi ô hiển thị tên phiên và thư mục khởi tạo,
  không giả định đó là CWD hiện tại. Lưới hiện chia đều, chưa có cây split kéo thả.
- Files & Editor với CodeMirror: thư mục có phân trang, tìm file toàn project,
  file UTF-8 tối đa 8 MiB sửa trực tiếp; file lớn hơn mở theo cửa sổ 256 KiB
  chỉ đọc để không khóa renderer. Save/⌘S phát hiện thay đổi từ bên ngoài trước
  khi ghi để tránh đè file của editor khác.
- Git status, worktree list và diff staged/unstaged chỉ đọc. Các worktree
  hiện là thông tin; mở folder khác bằng nút chọn project.
- Chat qua `yana-rt chat --headless`: stream, lịch sử hội thoại, stop, sự kiện
  runtime riêng, lỗi hiện rõ. Không gọi provider trực tiếp từ renderer.
- Chọn provider/model theo catalog Rust chính thức: 13 cloud và 6 local, cộng
  endpoint OpenAI-compatible do người dùng tự cấu hình. Contract test sẽ báo lỗi
  nếu danh sách provider Studio lệch khỏi `src/model/catalog.rs`.
- Local AI Manager trong trusted host quét 9Router, Ollama, LM Studio, llama.cpp,
  TurboFieldfare và AirLLM, hiển thị endpoint/model list rồi mới cho chọn.
- API key gửi vào Rust qua stdin, không qua argv; mỗi provider có credential
  riêng được mã hóa bằng Electron safeStorage. Key không được trả lại renderer,
  không nằm trong workspace JSON/localStorage/log; Linux `basic_text` chỉ giữ
  key trong RAM của phiên chạy.
- Conversation/layout lưu riêng, temp-write → fsync → rename. State hỏng được
  giữ bản recovery, không xóa âm thầm.
- Settings có Capability registry đồng bộ bằng contract test với 10 descriptor
  hiện có trong `src/capability/registry_data.rs`; trạng thái Available đọc từ
  binary `yana-rt` đang chọn và giới hạn theo OS.
- Remote & external tools đọc feature MCP/Discord từ `yana-rt --help`, allowlist
  Discord từ project hiện tại và executable Claude/Codex/Cursor/Antigravity/
  Gemini từ PATH. Không đọc hoặc trả giá trị token về renderer.
- Command reference parse trực tiếp `COMMANDS.md`, có tìm kiếm, sao chép và mở
  terminal với lệnh được điền sẵn. Studio không tự thực thi lệnh từ trang này.
- Sidebar chỉ giữ các mặt làm việc hằng ngày: Chat, Files, Terminal, worktree và
  project gần đây. Tài khoản, model, kết nối, quyền, công cụ, lệnh và dữ liệu nằm
  trong Settings; Settings không giữ terminal/inspector bên cạnh.
- Tài khoản local-first có hai đường: email + mật khẩu cục bộ hoặc nhận diện qua
  Google Account đã kết nối. Không có Yana cloud server và không có tuyên bố sync.
  Mật khẩu không được lưu; file hồ sơ chỉ giữ salt + scrypt verifier. Hồ sơ local
  khóa lại khi mở app lần sau. Đây là khóa truy cập app, không phải mã hóa toàn bộ
  ổ đĩa; nên bật FileVault/BitLocker/LUKS cho bảo vệ dữ liệu khi máy bị truy cập.

Ollama canonical hiện dùng cố định `127.0.0.1:11434`; LM Studio mặc định
`127.0.0.1:1234/v1`; llama.cpp mặc định `127.0.0.1:8080/v1`. Muốn cổng/host khác:
chọn **OpenAI-compatible**, nhập API base đầy đủ, ví dụ
`http://127.0.0.1:1234/v1`. Chỉ loopback được dùng HTTP. App chưa tự quản lý
process local runtime, tải model hay load trực tiếp file GGUF/MLX.

## Ranh giới không được đổi

```text
Người dùng → Terminal IPC → node-pty → shell của người dùng

AI Chat → stdin/NDJSON → Yana TurnEngine
                        → RuntimeAuthority / Giám Thị
                        → capability → evidence / approval
```

Không có đường nối AI output thành terminal input. Terminal output không được
coi là canonical evidence. Renderer không có Node, filesystem hoặc mạng trực
tiếp; preload chỉ expose các IPC cụ thể, host kiểm tra đúng window/frame.

**Giới hạn approval hiện tại:** UI xử lý `awaiting_approval` và dùng
`--resume-approval` cho provider chuẩn. Runtime tại mốc kiểm tra chưa resume được
provider `custom`; UI khóa quyết định này, không giả vờ đã cấp phép, không chạy
lệnh ở terminal thay thế. Cần hoàn thiện contract này ở runtime trước khi mở.
Không tuyên bố mọi đường thực thi có tool đã được kiểm chứng trên mọi OS.

## Accounts & Connections

Trong Models & Runtime, chọn **Accounts & Connections**. Google Account chỉ
xin openid/profile/email; Connect Gmail là consent riêng với gmail.readonly.
Google client ID do anh cung cấp được xác nhận là Desktop app. Flow chạy trong
main: PKCE S256, callback loopback, state một lần, timeout và hủy. Không có token
getter trong preload. Credential OAuth nằm trong oauth-v1/*.enc, mã hóa bằng
Electron safeStorage (Keychain/DPAPI/Secret Service-backed); Linux basic_text bị
từ chối. Đây là encrypted-file storage được bảo vệ bằng OS, không phải từng
token được ghi trực tiếp thành một Keychain item.

Disconnect xóa credential local; Thu hồi tại Google có xác nhận riêng vì Google
có thể thu hồi cả các scope cùng Cloud project. Không xóa email hoặc dữ liệu.
GitHub có device flow không cần client secret: nhập client ID OAuth app trong
Accounts & Connections, bật Device flow tại GitHub Developer Settings, rồi Connect
và nhập mã xác nhận tại github.com/login/device. Hiện chỉ xin read:user, chưa có
quyền đọc/ghi repository. Slack/Notion vẫn cần cấu hình/broker/callback phù hợp.
Không nhúng client secret vào app. Chưa có Gmail inbox/resource browser và chưa
test consent tài khoản thật.
Không tuyên bố đã unify legacy Desktop: nó được giữ nguyên để tương thích.

Chi tiết audit và giới hạn: [OAUTH-AUDIT.md](OAUTH-AUDIT.md).

## Dữ liệu

`app.getPath('appData')/Yana Studio/workspace-v1.json` chứa project references,
conversation và layout; macOS là `~/Library/Application Support/Yana Studio/`.
Đây không phải memory/vector engine mới. Không đọc hoặc migrate memory/key của
Desktop cũ. Settings → Privacy & Data có thể xuất/khôi phục file portable chứa
project references, conversation, model profile, language và layout. File này
không chứa OAuth token, model API key, password verifier, runtime path hoặc tiến
trình terminal. Có thể chọn file hoặc kéo-thả vào vùng restore; host kiểm tra
định dạng/kích thước trước khi hỏi xác nhận thay thế dữ liệu.

Backup Studio không chứa nội dung repository và không thay thế memory contract
của `yana-rt`. Hệ điều hành có thể gỡ app mà không mở Studio, nên app không thể
đảm bảo cảnh báo trong mọi luồng uninstall; màn dữ liệu nhắc người dùng export
trước khi gỡ. Không có automatic backup ở mốc này.

Shell process không được hồi sinh sau quit/crash. Lần mở sau giữ conversation,
project và layout, nhưng tạo terminal mới theo yêu cầu. Raw terminal scrollback
chỉ giữ trong phiên. Bản nháp composer/editor chưa được persist qua quit; lưu
file bằng Save trước khi thoát. Chưa có tính năng backup hoặc export.

## Kiểm thử

```sh
npm run format:check
npm run build
npm test
npm run test:electron
npm run test:ui
```

Unit/integration tests dùng thư mục tạm. `test:electron` chạy node-pty thật trong
Electron. `test:ui` mở Electron trong profile tạm, dùng **Rust runtime thật +
provider HTTP giả lập local** để kiểm tra transport, history, cancellation,
editor và terminal. Nó không chứng minh chất lượng hoặc compatibility của một
model thật. Screenshot test nằm trong `artifacts/` và không được commit.

## Chưa phải bản phát hành

Đã kiểm tra development build trên macOS arm64; Linux/Windows cần CI và chạy
app thật trước khi công bố hỗ trợ. Chưa có installer/signing/update pipeline.
Cloud credentials thực, inference bằng model thật và các đường tool approval
cần kiểm tra riêng. Editor chunk hiện còn cảnh báo kích thước từ Vite, nhưng
được tải khi mở editor, không nằm trong startup chunk.

Các màn lớn tiếp theo: quản lý nhiều profile, attachments từ ngoài project,
task surface, permission leases/HALT, SSH/Docker, device control, memory
portability của runtime, localization đầy đủ và accessibility audit. Không đưa nút giả cho
các mục này. Các capability/task/provider mới trên PR runtime chưa merge chỉ
được nối sau khi contract canonical xuất hiện trên nhánh Studio đang build.

Danh sách chuyển đổi đầy đủ từ Desktop cũ sang app mới, trạng thái và thứ tự triển
khai được theo dõi tại [FEATURE-PARITY.md](FEATURE-PARITY.md). Desktop cũ chỉ là
nguồn yêu cầu/hành vi; Studio không nhập lại component hoặc kiến trúc cũ.

Nguồn tham khảo và dependencies: [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md).
