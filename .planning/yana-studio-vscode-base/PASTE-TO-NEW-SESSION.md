# Đoạn dán vào phiên mới

Mở phiên mới trong thư mục `/Users/vutam/Desktop/Yana-AI`, rồi dán nguyên khối dưới đây.

---

Bạn tiếp quản công việc Yana Studio IDE (Code-OSS có lớp phủ của Yana) và tích hợp toàn bộ Yana AI vào đó. Nhánh hiện tại: `feat/yana-ide-vscode-base`, có 7 commit mới **chưa push** (từ `ec7dcccb` đến `f8a57bb6`). Trả lời tiếng Việt, ngắn, nói thẳng, có bằng chứng.

**Đọc trước khi làm bất cứ gì, theo thứ tự:**
1. `.planning/yana-studio-vscode-base/HANDOFF-2026-10-14-A.md`: đã xong gì, đang dở gì, lệnh chạy test.
2. `.planning/yana-studio-vscode-base/YANA-COVERAGE.md`: nguyên tắc của anh Tâm và bảng phủ sóng bằng số đo thật.
3. `.planning/yana-studio-vscode-base/YANA-INSTALL-MODEL.md`: mô hình cài kiểu Hermes, quyết định đã chốt, kết quả test thật, phát hiện về Giám Thị.
4. `.planning/yana-studio-vscode-base/SPLIT-2026-10-14.md`: chia việc giữa các phiên (phiên B lo Office/PPT).

**Nguyên tắc anh Tâm đã chốt (không được hỏi lại):**
- Yana AI là nhiều phần nối nhau, phải phủ toàn bộ, không nhét vài cái rồi báo xong. Thành phần mặc định chạy, một số có công tắc trong Cài đặt. Agent và skill tích hợp sẵn.
- Số liệu trong tài liệu kiến trúc đã cũ: đo trực tiếp bằng `tools/yana-ide/scripts/inventory.py` và `ide-coverage.py`.
- Nguồn tải hệ thống: cả PyPI (`yana-ai`, Python) và crates.io (`yana-rt`, Rust), tự chạy khi cài app. Thư mục nhà `~/.yana`. Giám Thị tự cài.
- Không báo "xong" khi chưa có màn hình, test và ảnh chụp **cửa sổ thật** (`screencapture`), không chỉ test.
- Luật của repo vẫn áp dụng: không `rm -rf`, không push khi chưa được phép, không cài gói khi chưa báo cáo, viết commit và tài liệu không dùng dấu gạch dài (em dash).

**Việc đầu tiên: làm Giám Thị an toàn hơn (anh đã duyệt, "làm đi em"). Chưa sửa file nào trong `core/`.**
1. `core/scripts/giamthi-watch.sh` (dòng 31-32): hiện suy ra dự án từ vị trí script. Thêm biến `YANA_WATCH_TARGET` (phải là thư mục thật, không phải symlink; không có biến thì giữ hành vi cũ). Khi chạy từ nhà tin cậy, `AUDIT_VERIFY` ưu tiên `$SCRIPT_DIR/verify-audit-chain.sh`.
2. `core/scripts/giamthi_service.py`: ưu tiên script ở `~/.yana/pack/core/scripts/giamthi-watch.sh` (file thường, không symlink), truyền `YANA_WATCH_TARGET` qua plist (`EnvironmentVariables`), systemd (`Environment=`) và Windows; `validate_target`, `status`, `run_once` dùng đúng script được chọn.
3. Thêm `.claude/scripts` vào `SENSITIVE_PATHS` của watcher.
4. Test: `tests/test_giamthi_service.py` (18 test đang đạt) cộng test mới.
Lý do: dự án đã cài nhận bản chép đầy đủ `giamthi-watch.sh` vào `.claude/scripts/` (`install_project.py` dòng 164), nằm trong cây mà tác tử ghi được và không có core-lock canh. Đây là suy ra từ đọc mã, chưa thử khai thác.
**Quy trình bắt buộc** (`54-bft-consensus-law`, `67-core-integrity-lock-law`): sửa xong thì dispatch **hai người xem độc lập** (`security-auditor` và `code-auditor`, chỉ đọc), xử lý phát hiện, rồi mới chạy `bash core/scripts/update-core-lock.sh` và `bash core/scripts/verify-core-lock.sh`. Đây là mã Tier 1: không tạo lại khóa trước khi xem xét xong.

**Còn mở sau đó (theo thứ tự):**
- `tools/yana-ide/setup/yana_install/stages.py` dài 438 dòng, vượt giới hạn 300 dòng của `agent-code-constraints`: tách phần toolchain ra file riêng. `tests/test_system_install.py` cũng dài 570 dòng.
- Xem bằng mắt các màn mới trong cửa sổ thật: Control Center, Yana IDE, sách hướng dẫn, và các trang cũ (Tasks, Permissions, Canvas, Settings). Chỉ một cửa sổ, tắt đúng tiến trình tên `Yana Studio`, dùng `--user-data-dir` mới. Lệnh mở nằm trong bộ nhớ `project_yana_ide_vscode_base.md`.
- Cài thật vào `~/.yana` (chưa làm, hỏi anh trước), màn "Cài hệ thống Yana" trong IDE, Control Center đọc `--status` của bộ cài.
- Bảng công tắc trong Cài đặt, áp gói vào dự án (`yana.pack.apply`), agent và skill tích hợp sẵn, 24 nhóm lệnh yana-rt chưa nối, sửa đường dẫn sandbox (yana-rt tìm ở `<dự án>/core/scripts/`).
- Phát hành bản PyPI mới với `pyproject.toml` đã sửa (bản 1.5.1 đang công bố còn chứa dữ liệu `core/memory`): việc của anh.

**Không được commit:** `turbo-fieldfare/` (14 GB, repo git lồng nhau của dự án khác), `.yana-ai/project-memory.md` và `untitled.yana-canvas.json` (mẫu rỗng IDE tự sinh khi thử).

Tên phiên: bạn có thể là `yana-ai-a8`. Phiên B (`yana-ai-80`, mã ad7b9e) làm Office/PPT. Dùng `ListAgents` rồi `SendMessage` nếu cần phối hợp, và đừng sửa file thuộc phần của phiên kia (xem `SPLIT-2026-10-14.md`).
