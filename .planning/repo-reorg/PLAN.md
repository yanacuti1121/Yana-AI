# Kế hoạch sắp xếp lại repo

Trạng thái: bản nháp, chưa duyệt. Lập ngày 2026-11-11 trên commit `b3e62b6`.
Số liệu đo bằng `scripts/reorg_refmap.py` (xem phần "Cách dùng công cụ").

## Quyết định của chủ repo (đã nghe trong phiên làm việc)

- Chỉ tách repo riêng cho phần web và app. Mọi thứ còn lại sắp xếp trong repo này, không tạo repo Python hay repo nào khác.
- Tách cấu trúc, không cắt liên kết: các phần vẫn kết nối như hiện tại.
- Làm lần lượt, từ phần dễ đến phần khó.
- Tài liệu cũ phải được cập nhật như một phần của việc sắp xếp.

Đề xuất chưa được xác nhận: giữ liên kết bằng git submodule đặt đúng đường dẫn cũ (`tools/yana-web`, ...). Repo đã có tiền lệ là `tools/moss-tts-nano` trong `.gitmodules`.

## Nguyên tắc

1. Mỗi bước là một PR riêng, hoàn tác được bằng `git revert`.
2. Không đổi tên các đường dẫn là quy ước cố định: `core/*`, `.yana-ai/` (91 file code nhắc đến), `.planning/` (agent `spec-*` ghi vào `.planning/<slug>/PLAN.md`), `gates/` (26 file nhắc đến).
3. Sau mỗi lần di chuyển, chạy `python3 scripts/reorg_refmap.py --target <đường dẫn cũ> --expect-zero`. Kết quả phải là exit 0, đồng thời `core/scripts/drift-check.sh` sạch và CI xanh.
4. Vùng bị ghim bởi `core/config/core-lock.json`: `core/rules`, `core/gates`, `core/hooks`, `core/scripts`, `src/guard`. Sửa trong đó phải sinh lại khóa và review từng dòng; `core/rules`, `core/hooks`, `core/gates` còn phải qua hai reviewer theo rule 54.
5. Mọi push và merge cần chủ repo duyệt trong phiên.

## Hiện trạng đã đo

| Mục | File code/CI/cấu hình nhắc đến | Ghi chú |
|---|---|---|
| 36 file `.md` ở gốc | 19 file chỉ có tài liệu nhắc | 17 file còn lại có code nhắc (README, AGENTS, CHANGELOG, ...) |
| `plans/` | 0 | 1 tài liệu nhắc |
| `.planning/` | 7 | quy ước của agent `spec-*` |
| `gates/` và `core/gates/` | 26 và 11 | hai thư mục khác nhau, tên dễ nhầm |
| `adapters/` và `core/adapters/` | 8 và 6 | khác nhau |
| `.yana-ai/` | 91 | tên thư mục cấu hình lúc chạy |
| `tools/yana-app` | 0 | |
| `tools/yana-web` | 12 | |
| `tools/yana-desktop` | 14 | Electron đóng gói server của web |
| `tools/yana-studio` | 16 | dùng chung asset ký với desktop |
| `tools/yana-ide` | 0 | 13 file của nó trỏ vào `yana-studio` |

Các số này là cận trên: đó là khớp chuỗi, nên tên chung như `README.md` bị tính cả những lần nhắc không liên quan. Công cụ bỏ qua `.claude/`, `core/skills/`, `vendor/`, file khóa và thư mục build.

## Các bước

### Bước 1: lưới an toàn và kế hoạch (PR này)

Thêm `scripts/reorg_refmap.py` và tài liệu này. Không di chuyển file nào. `scripts/` gốc nằm ngoài vùng khóa nên không phải sinh lại `core-lock`.

### Bước 2: dọn gốc

Chuyển 18 file `.md` chỉ có tài liệu nhắc đến. Giữ `CODE_OF_CONDUCT.md` ở gốc theo chuẩn GitHub.

- Sang `docs/archive/` (thư mục này đã có), 6 file: `JOURNEY.md`, `HISTORY.md`, `YANA-UNIFIED-ENGINEERING-ARCHITECTURE.md`, `YANA-UNIFIED-IMPLEMENTATION-PLAN.md`, `BMAD-YANA-GAP-ANALYSIS.md`, `ARCHITECTURE-DEBT.md`.
- Sang `docs/`, 4 file: `PRINCIPLES.md`, `VISION.md`, `DIRECTION.md`, `ACKNOWLEDGEMENTS.md`.
- Sang `docs/i18n/`, 8 file bản dịch `.ko.md` và `.vi.md` của ACKNOWLEDGEMENTS, JOURNEY, PHILOSOPHY, PRINCIPLES.

Giữ ở gốc: README (và các bản dịch của nó), AGENTS, CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, LICENSE, NOTICE, VERSIONING, COMMANDS, ARCHITECTURE, ROADMAP, TODO, CURRENT-MILESTONE, BENCHMARK, PHILOSOPHY. Các file này có code nhắc đến, nên chỉ di chuyển ở bước sau, khi đã sửa từng tham chiếu.

Tham chiếu phải sửa: các tài liệu liệt kê bởi `--target`, không có code.

### Bước 3: gộp thư mục kế hoạch

Chuyển `plans/261024-0000-yana-demo-video/` (8 file) vào `.planning/`. Không có code nhắc đến; 1 tài liệu cần sửa đường dẫn: `docs/product/IMPLEMENTATION_REVIEW_MATRIX.md`.

### Bước 4: tách `yana-app`

Không có file code nào nhắc đến `tools/yana-app` (chỉ có `NOTICE`). Việc phải kiểm tra trước: ứng dụng có tự kiểm tra bản cập nhật từ URL Releases của repo này không, vì tách repo sẽ đổi URL đó. Tạo repo mới từ một bản clone riêng bằng `git filter-repo --path tools/yana-app`, repo hiện tại không bị đụng tới.

### Bước 5: tách web và desktop

Hai thành phần đi cùng nhau vì Electron đóng gói server của web.

File code/CI/cấu hình nhắc `tools/yana-web`: `src/connector.rs`, `scanner/env-secret-checks.yml`, `scanner/shell-risk-checks.yml`, `worker.js`, `ci.yml`, `desktop.yml`, `core/lib/hermes_adapted/memory_manager_io.py`, `src/chat/openai_compat.rs`, `src/chat/headless.rs`, `src/model/circuit_breaker.rs`, và hai file của `yana-desktop`.

File nhắc `tools/yana-desktop`: `desktop.yml`, `package.json` gốc, `Cargo.toml`, `ci.yml`, `yana-studio-desktop.yml`, `src/main.rs`, `src/capability/cli.rs`, `src/bin/pty_bridge.rs`, `core/scripts/check_dangling_paths.py`, và vài file của `yana-studio` và `yana-web`.

Điểm cần lưu ý:

- `core/scripts/check_dangling_paths.py` nằm trong vùng khóa: sửa nó phải sinh lại `core-lock`.
- Các luật scanner có bản biên dịch; `compile_scanner_rules.py --check` chạy trong CI.
- Các cặp logic phải khớp giữa JS và Rust (`provider-failover.js` với `circuit_breaker.rs`, bảng `PROVIDERS` của `server.js` với `openai_compat.rs`, `terminal-context.mjs` với `headless.rs`) cần bộ test đối chiếu dùng chung dữ liệu mẫu.
- Workflow phải bật `submodules: recursive`; `dependabot.yml` phải khai báo lại cho từng repo.

Quyết định còn mở: Studio và IDE có đi cùng không (16 file nhắc `yana-studio`).

### Bước 6: bản sao `.claude/`

Có 67 file code/CI/cấu hình dựa vào đường dẫn `.claude/...` (`skills-lock.json` ghi khoảng 2.000 lần, các test và watcher `giamthi`, `run-hook-tests.sh`, `npm-install.js`, `verify-skills-lock.sh`). Đây còn là cấu hình thật của các phiên Claude Code chạy trong repo này. Chỉ làm sau khi có thiết kế riêng về cách sinh `.claude/` từ `core/`, và cần duyệt riêng.

### Bước 7: tài liệu

- `ARCHITECTURE.md` ghi 1.989 skills, thực tế 2.035: sinh từ `MANIFEST.json`.
- `AGENTS.md` ghi "Enforcement status (v1.6.1)", phiên bản hiện tại là 1.5.2: kiểm tra cách đánh số phiên bản.
- README nhắc 1.5.1 và 1.7.0: xác nhận cái nào là kế hoạch.
- Chính sách cho bản dịch (vi, en, ko, zh): chọn bản gốc và ghi tình trạng đồng bộ.
- Mở rộng `check_counts.py` hoặc `drift-check.sh` để giữ các số liệu này; việc này sửa vào vùng khóa nên cần duyệt riêng.

## Câu hỏi mở

1. "App" gồm những gì: chỉ `yana-app`, hay cả Desktop và Studio?
2. Submodule giữ đường dẫn cũ, hay phát hành thành gói rồi tải về?
3. Người dùng đã cài `yana-ai` có hook hay cấu hình trỏ vào đường dẫn trong `core/` không? Chưa có dữ liệu. Nếu có, không được đổi tên bên trong `core/`.
4. URL kiểm tra bản cập nhật của `yana-app` trỏ đâu?

## Cách dùng công cụ

```bash
python3 scripts/reorg_refmap.py                          # khảo sát toàn bộ
python3 scripts/reorg_refmap.py --target plans/          # ai nhắc đến plans/
python3 scripts/reorg_refmap.py --target plans/ --expect-zero   # exit 1 nếu còn code nhắc
```
