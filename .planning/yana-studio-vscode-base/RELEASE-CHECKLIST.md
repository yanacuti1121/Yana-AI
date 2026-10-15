# Danh sách kiểm tra phát hành Yana Studio (soạn 2026-10-14)

Chưa công bố gì. Mọi bước công bố (crates.io, PyPI, tag, GitHub Release) là **không thu hồi được** và do anh Tâm tự chạy sau khi đọc danh sách này.

Ký hiệu: ✅ đã kiểm chứng bằng lệnh (ghi rõ lệnh), ⬜ chưa làm, ⚠ cần anh Tâm quyết.

## A. yana-rt (crates.io)

- ⬜ Tăng phiên bản trong `Cargo.toml` và `Cargo.lock`. 1.5.1 đã công bố, nên bản mới phải là 1.5.2 hoặc cao hơn.
- ✅ `cargo test --features mcp --bin yana-rt`: 1619 đạt, 0 lỗi (nhánh `feat/persistent-mcp-session`). `cargo check` với tính năng mặc định: biên dịch được.
- ✅ Bộ cài hệ thống biên dịch kèm `--features mcp` (`tools/yana-ide/setup/yana_install/toolchain.py`). Không có tính năng này thì `yana-rt` không có `mcp_call`, nên công cụ điều khiển máy tính (Cua) không dùng được. crates.io xác nhận 1.5.1 và các bản trước đều có tính năng `mcp`, 1.5.1 còn có `lsp`.
- ⚠ Có bật thêm `lsp` không (chat có công cụ `lsp_query`)? Chưa đo thời gian biên dịch thêm.
- ⬜ `cargo publish --dry-run`, rồi công bố.

## B. Gói Python (PyPI)

- ⬜ Tăng phiên bản trong `pyproject.toml` và `src/yana_ai/__init__.py` (giữ khớp nhau theo `VERSIONING.md`).
- ✅ `pyproject.toml` đã loại `core/memory` khỏi wheel và sdist (kiểm bằng `python -m build`, bỏ đúng 106 file).
- ⬜ Dựng wheel trên **checkout sạch của CI**, không dựng trên máy dev: wheel dựng ở máy dev từng lọt thêm một file `.so` của thử nghiệm Mojo.
- ⬜ Khoá băm cho `requirements` của bộ cài phải được tạo và ký ở khâu phát hành. Bản thử chỉ là "tin vào lần đầu".
- ⚠ Wheel không chứa `yana-rt` dựng sẵn, nên máy sạch phải biên dịch (khoảng 1 phút 50 giây trên máy này, kèm tải Rust nếu chưa có). Muốn nhanh hơn thì phải phát hành thêm bản dựng sẵn theo nền tảng.

## C. App IDE

- ✅ `tools/yana-ide/scripts/prepare.sh` chạy **hai lần liên tiếp** trên một checkout upstream sạch (`2a59476c`): áp các patch 0001, 0002, 0003, 0005, ghép `product.overrides.json` (24 khoá, gồm `bundledTools`), chép file overlay.
- ✅ Bước đóng gói công cụ bên thứ ba trong checkout đã chuẩn bị (`node build/lib/bundledTools.ts`): tải Cua Driver 0.35.2 (macOS universal), kiểm sha256 của gói, LICENSE và THIRD_PARTY_NOTICES, giải nén, chữ ký gốc của Cua còn hợp lệ. Test `build/lib/test/bundledTools.test.ts`: 8 đạt.
- ✅ Bước này không phụ thuộc `raw.githubusercontent.com` (lúc kiểm tra máy này không nối được máy chủ đó): LICENSE và THIRD_PARTY_NOTICES lấy qua `api.github.com` kèm sha256 ghim.
- ⬜ Linux và Windows: đã kiểm sha256 và cấu trúc từng gói, **chưa chạy bước đóng gói trên máy thật**.
- ⬜ Dựng app đầy đủ: tác vụ gulp là `vscode-darwin-arm64` (tên đọc từ `build/gulpfile.vscode.ts`, **chưa chạy**: rất nặng, phải làm trong một bản sao riêng, không làm trên cây đang chạy app).
- ⬜ Xác nhận `bundledTools/` nằm đúng trong `Contents/Resources/app/` của app và file `cua-driver` còn quyền thực thi.
- ⚠ Ký và notarize: hiện **không có chứng chỉ**. Cần quyết định cách phát hành bản không ký (macOS: người dùng phải mở bằng chuột phải, Windows: cảnh báo SmartScreen) và ghi hướng dẫn cho người dùng.
- ⬜ Quyền macOS (Accessibility, Screen Recording) khi binary của Cua chạy dưới một app không ký: **chưa biết** hộp thoại sẽ hiện tên nào. Phải thử trên bản đóng gói thật.
- ✅ Thông báo bản mới (không tự cập nhật): `features/update-check.js`, tệp thông tin có chữ ký Ed25519, 34 test đạt, đã thử đường mạng thật (xem `UPDATE-CHECK.md`).
- ⬜ Để bật: anh Tâm tạo cặp khoá offline, dán khoá công khai vào `update-public-key.js`, và quyết định nguồn phiên bản của app. Khi khoá còn trống, app không gửi yêu cầu nào.
- ⬜ Tự cập nhật thật sự (tải và cài) **không làm**: app chưa ký nên không có cách an toàn để cài tự động trên macOS.
- ⬜ `VERSIONING.md` chưa có hàng cho IDE (phiên bản, tag, workflow). Chưa có workflow GitHub cho IDE (hiện chỉ có `yana-studio-desktop.yml` của Studio cũ).

## D. Kiểm tra trên bản đóng gói, bằng mắt trên cửa sổ thật

Chỉ báo "chạy được" những mục đã xem trong cửa sổ app thật, ghi rõ mục nào chưa xem.

- ⬜ Mở app từ Dock hoặc Finder (không có biến chế độ dev): không đen. Lỗi đã gặp: `out/vs/workbench/workbench.desktop.main.css` biến mất sau khi dựng lại `out/`. Đảm bảo bản đóng gói có file này (`tools/yana-ide/scripts/ensure-out-css.sh`).
- ⬜ 17 tính năng của `yana-agent` kích hoạt, Home và Guide hiện.
- ⬜ Chat với một model local và một model cloud (chưa có key để thử cloud).
- ⬜ Duyệt ghi file có diff (cần `yana-rt` mới, máy đang cài 1.5.0).
- ⬜ Audit Chain Log, hồ sơ trợ lý, trang Third-Party Components.
- ⬜ Cua: bật theo nhu cầu, duyệt, nút dừng khẩn cấp (chưa nối vào giao diện).

## E. Rủi ro đã biết

- `out/` bị dựng lại bởi nhiều phiên cùng lúc, mỗi lần mất file CSS. Dùng `build-fast`, không dùng `compile-client`.
- Hai việc phụ thuộc vào việc anh công bố bản `yana-rt` mới: Cua, và thông báo lỗi duyệt rõ ràng.
- Bộ cài vẫn chưa cài thật vào `~/.yana`, và Giám Thị chưa dùng `~/.yana` (xem `YANA-INSTALL-MODEL.md`).

## F. Bảo mật (cổng bắt buộc trước khi phát hành)

Bản đóng gói đi tới tay người dùng nên mục này **chặn phát hành**: một mục ⬜ chưa xong thì chưa phát hành, trừ khi anh Tâm ghi rõ ngoại lệ vào đây.

### Đã kiểm chứng (2026-10-14/15)

- ✅ `cargo audit`: từ **10 lỗ hổng xuống 1** sau khi nâng `rustls` 0.23.45 lên 0.23.46 và `quinn-proto` 0.11.15 lên 0.11.19 trong `Cargo.lock` (1641 test Rust đạt sau khi nâng). Còn lại `RUSTSEC-2026-0333` (`noyalib` 0.0.5, không thực thi giới hạn tài nguyên khi đọc YAML), do `serde_yml` kéo vào.
- ✅ Phần kỹ năng (`src/skills`) **không dùng thư viện YAML**. Một phần đầu `SKILL.md` chỉ vài trăm byte gồm alias lồng nhau làm bộ đọc YAML chạy mất khoảng 2 giây; bộ đọc tối giản (`frontmatter.rs`) xử lý trong vài micro giây và có test cho ca đó.
- ✅ Kỹ năng: không theo symlink (kiểm lại lúc đọc nội dung, chống đổi file sau khi liệt kê), `SKILL.md` tối đa 256 KiB, tối đa 500 thư mục mỗi nơi, tên thư mục phải hợp lệ và khớp `name`, ký tự điều khiển bị loại khỏi mô tả. Kỹ năng của **người dùng thắng** kỹ năng của dự án khi trùng tên, để một repo lạ không chiếm được lệnh `/tên` của người dùng.
- ✅ Chỉ mục kỹ năng trong system prompt ghi rõ mô tả là dữ liệu không phải chỉ thị, giới hạn 8000 ký tự, và chỉ liệt kê kỹ năng của dự án khi thư mục đã được tin cậy. Thư mục chưa tin cậy thì `yana-rt` từ chối đọc kỹ năng.
- ✅ `yana-rt hunt run` trên phần đã viết mới (`src/skills`, `src/mcp_client`, `src/init`, bộ cài, script, overlay): 0 phát hiện. Các cờ ở phần khác đã phân loại: `exec()` là `RegExp.exec()`, `innerHTML` là chú thích và thư viện React đóng gói sẵn.
- ✅ Webview: chữ do model viết ra dựng bằng `textContent`, link Markdown vẽ thành thẻ `span` (không có `href`), iframe Canvas có `sandbox=""` (không script, không mạng).
- ✅ Quét bí mật toàn repo: 55 phát hiện (16 CRITICAL, 39 HIGH). Đã xem 16 mục CRITICAL (giá trị được che khi in): đều là dữ liệu thử, mẫu cho bộ bảo vệ, hoặc khoá giả của kỹ năng "canary". Chưa đối chiếu từng cái với nhà cung cấp. 39 mục HIGH **chưa xem**.
- ✅ Gói công cụ bên thứ ba: sha256 ghim, chữ ký gốc của Cua còn hợp lệ, không chạy `npx`, không cài gói npm chưa vetting. `SECURITY.md` và `.github/dependabot.yml` đã có.

### Việc phải làm trước khi phát hành

- ⬜ **Thay `serde_yml`** (không còn bảo trì, `RUSTSEC-2025-0068`, và kéo `noyalib` có lỗ hổng trên). Còn dùng ở `src/scanner/rules.rs`, `src/vault/note.rs`, `src/vault/store.rs`. Cần chọn thư viện thay thế và vetting theo luật chuỗi cung ứng. Cảnh báo còn lại: `anyhow` 1.0.102 (`RUSTSEC-2026-0190`), `lru` 0.18.1, `rustls-pemfile` không còn bảo trì.
- ⬜ `pip-audit` cho gói Python và `npm audit` cho `extensions/yana-agent/office` (Marp, PptxGenJS...): **chưa chạy**.
- ⬜ Xem 39 phát hiện bí mật mức HIGH. Quét lại **bản đã đóng gói** (wheel, sdist, thư mục app), không chỉ mã nguồn.
- ⬜ Cua (điều khiển máy tính): mặc định **tắt**; hành động bấm và gõ phải qua duyệt hoặc lease có thời hạn; có nút dừng khẩn cấp; ghi nhật ký. Thử với nội dung trên màn hình cố tình chứa lệnh giả (chèn lệnh qua màn hình). Chưa nối vào giao diện nên chưa kiểm được.
- ⬜ Kỹ năng do model gọi (`use_skill`): chưa có. Khi làm phải đi qua sổ đăng ký quyền, bọc kết quả như dữ liệu không tin cậy, và thử chèn lệnh qua nội dung kỹ năng. `allowed-tools` hiện chỉ được **đọc, chưa được thực thi**: giao diện không được ngụ ý rằng nó đang hạn chế quyền.
- ⬜ Plugin (giai đoạn sau): cài từ git phải ghim commit, hiện cấu hình MCP, lệnh, biến môi trường xin cấp, và yêu cầu người dùng duyệt. Không bật tự động từ repo vừa mở.
- ⬜ CSP của mọi webview: rà `style-src 'unsafe-inline'`, không `unsafe-eval`, nguồn ảnh. Hiện chỉ mới đọc lướt.
- ⬜ Bản không ký: công bố **sha256 của từng bản tải** và hướng dẫn kiểm tra. Cân nhắc ký phát hành (cosign/sigstore theo `slsa-artifact-law`); `cosign` hiện chưa cài trên máy.
- ⬜ Token công bố (crates.io, PyPI): chỉ dùng trong CI, bật 2FA, không để trên máy phát triển. Công bố từ checkout sạch của CI.
- ✅ Kênh thông báo bản mới xác thực bằng chữ ký Ed25519 và chỉ nhận link về `https://yana.vutam.link/`. ⬜ Phải có khoá thật và thử với một `latest.json` thật trước khi phát hành.
- ⬜ Quyền riêng tư: telemetry bên thứ ba tắt mặc định (K3). Xuất nhật ký kiểm toán chỉ sao chép file người dùng chọn. Chụp màn hình của Cua có thể chứa mật khẩu: cần cảnh báo rõ lúc bật.
- ⬜ Một bản mô hình mối đe doạ ngắn cho kỹ năng, MCP, Cua, bộ cài và xuất nhật ký, được **hai người xem độc lập** (`54-bft-consensus-law`).
