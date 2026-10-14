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
- ⬜ Tự cập nhật: `product.json` chưa có `updateUrl`, nên app hiện không tự cập nhật.
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
