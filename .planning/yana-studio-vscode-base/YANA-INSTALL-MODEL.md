# Mô hình cài đặt học từ Hermes (đã đọc mã thật trong máy, 2026-10-14)

Nguồn: bản Hermes anh Tâm tải về nhưng chưa dùng: `/Applications/Hermes.app` (bộ cài, 12 MB) và `~/.hermes/hermes-agent` (hệ thống đầy đủ, tổng
`~/.hermes` là 6,9 GB). Em chỉ đọc cấu trúc và mã, không mở `.env`, `auth.json`, `config.yaml`. Mọi điều dưới đây trích từ file thật, có ghi tên file.

## Cách Hermes làm

1. **App cài là một bộ cài nhỏ, hệ thống nặng cài sau.** `Hermes.app` thực chất là `Hermes-Setup` (Tauri, viết bằng Rust, mã ở
   `apps/bootstrap-installer/src-tauri/src/bootstrap.rs`). Nó chỉ lo việc đưa hệ thống thật về máy rồi mở app giao diện.
2. **Bộ cài tải script cài từ GitHub raw, ghim theo mã commit.** `install_script.rs`: thứ tự tìm script là (1) bản repo cạnh bên khi dev, (2) bản đóng kèm (hiện chưa dùng),
   (3) tải từ GitHub raw tại **commit ghim (SHA 40 ký tự, bất biến)** hoặc nhánh ghim (đuổi theo HEAD). Không có ghim thì từ chối: "no install-script pin supplied".
   Em **không thấy** bước kiểm băm sha256 nội dung script; tính an toàn dựa vào commit bất biến. Script được lưu đệm (`bootstrap-cache/`).
3. **Cài theo giao thức giai đoạn.** `scripts/install.sh --manifest` in danh sách giai đoạn dạng JSON; bộ cài chạy từng giai đoạn bằng
   `--stage NAME --json --non-interactive` và hiện tiến trình. Các giai đoạn (`stage_names` trong `install.sh`):
   `prerequisites, repository, venv, python-deps, config, products, setup, gateway, complete`. Hai giai đoạn `setup` (khóa API) và `gateway`
   cần người dùng nhập, bị bỏ qua khi không tương tác.
4. **Có nhật ký pháp y, hủy được, chạy lại được.** Nhật ký `HERMES_HOME/logs/bootstrap-<thời gian>.log`; người dùng hủy được; xong thì ghi
   file dấu `.hermes-bootstrap-complete`; mở lại bộ cài khi đã cài xong thì **đi đường tắt: chỉ mở app**, không cài lại ("hermes already installed").
5. **Cài mới và cập nhật dùng chung một đường.** Giai đoạn `products` là phần "đuôi hoàn tất" mà `hermes update` cũng gọi (chú thích trong
   `install.sh`), nên cài mới và cập nhật xong ở cùng một trạng thái. Cập nhật thay app bằng cặp `.hermes-update-new` và `.hermes-update-old`.
6. **Phần phụ thuộc nặng cài theo yêu cầu**, không nhét hết lúc đầu: `hermes pm install` lo trình duyệt, binary công cụ, node.
7. **Mọi thứ nằm trong một thư mục nhà** `HERMES_HOME` (mặc định `~/.hermes`). Hồ sơ (profile) là một thư mục nhà riêng khác.
8. **App giao diện tách khỏi hệ thống.** Desktop (Electron) bật một backend `hermes serve` không giao diện cho từng (kết nối, hồ sơ) và nói chuyện bằng JSON-RPC
   (`apps/desktop/src/AGENTS.md`). Có đường lùi tương thích: nếu runtime cũ chưa có lệnh `serve` thì app dùng lệnh cũ, để người đang giữa chừng nâng cấp không bị hỏng.
   Backend chết cùng app, còn gateway nhắn tin sống độc lập.
9. **Skill đóng gói sẵn, chép vào nhà theo bảng băm.** `skills/` trong repo (58 skill) được `tools/skills_sync.py` chép vào `~/.hermes/skills`, ghi nguồn gốc
   băm vào `.bundled_manifest`: skill mới thì chép; skill đã có chỉ cập nhật khi bản gốc đổi **và** bản của người dùng chưa bị sửa; skill người dùng đã xóa thì **không**
   chép lại. Skill tùy chọn (`optional-skills`) không tự cài; có hub để tìm và cài thêm; có kiểm tra an toàn (`skills_guard.py`).
10. **Bật tắt bằng cấu hình một chỗ.** Lệnh `hermes tools` và `toolsets.py`: bộ công cụ bật tắt theo nền tảng, lưu trong `config.yaml`. Luật của họ (`AGENTS.md`):
    `.env` chỉ cho bí mật; **không thêm biến môi trường `HERMES_*` cho cấu hình không bí mật**; tính năng mới phải nối vào `hermes tools` và `hermes setup`.
11. **Hai nguyên tắc thiết kế họ giữ cứng:** (a) bộ nhớ đệm prompt của cuộc hội thoại là thiêng: thay đổi skill, công cụ, trí nhớ có hiệu lực từ phiên sau, chỉ áp ngay
    khi người dùng chọn `--now`; (b) lõi hẹp, khả năng nằm ở rìa (plugin, skill, MCP).

## Áp vào Yana

Cách này **giải được** câu hỏi em nêu lần trước (ghi hàng nghìn file vào từng dự án): hệ thống nặng nằm **một chỗ** trong thư mục nhà của Yana, IDE chỉ là giao diện.

| Hermes | Yana đề xuất |
|---|---|
| `Hermes.app` (bộ cài) rồi `~/.hermes` | Yana Studio IDE (app nhẹ) cài bình thường; lần đầu mở có **màn "Cài hệ thống Yana"** đưa hệ thống vào `~/.yana` (`YANA_HOME`) |
| `install.sh --manifest` và `--stage` | Một script cài của Yana theo cùng giao thức giai đoạn, JSON, không tương tác. Đề xuất giai đoạn: `prerequisites` (bash, git, python3, nhận biết Docker), `runtime` (yana-rt, ghim bản và kiểm băm sha256), `pack` (hook, script, cổng, luật, agent, lệnh, skill), `config`, `integrity` (core-lock và kiểm lại), `sandbox` (tùy chọn: dựng image khi có Docker), `supervisor` (Giám Thị cấp hệ điều hành, **cần người dùng đồng ý**), `complete` |
| Ghim commit của script | Cùng ý: tải từ nguồn chỉ định, ghim commit. **Yana nên làm chặt hơn Hermes: thêm kiểm băm sha256 của script và của yana-rt**, vì Hermes không kiểm băm. Khớp luật chuỗi cung ứng của dự án (`44-supply-chain-vetting`, `slsa-artifact-law`) và danh sách egress (cho phép `raw.githubusercontent.com` với SHA ghim) |
| `.hermes-bootstrap-complete`, đường tắt khi đã cài | Dấu hoàn tất trong `~/.yana`; mở IDE lần sau chỉ kiểm nhanh rồi vào thẳng |
| `skills_sync.py` với `.bundled_manifest` | Chép skill, agent, luật vào `~/.yana` theo bảng băm: cập nhật không đè lên bản người dùng đã sửa, không chép lại cái đã xóa. Yana có **2026 skill**, Hermes có 58, nên cần chia bậc: nhóm thiết yếu chép sẵn, phần còn lại tìm và cài theo yêu cầu |
| `hermes pm install` cho phần nặng | Docker image và công cụ ngoài cài theo yêu cầu, không nhét vào lúc đầu |
| `hermes tools` và `config.yaml` | Một file cấu hình cho công tắc (nhóm khóa, mặc định bật, mặc định tắt trong `YANA-COVERAGE.md`); màn Cài đặt ghi vào đó. Yana hiện dùng nhiều biến `YANA_*`; chuyển cấu hình không bí mật sang file |
| Đường lùi tương thích backend cũ | IDE đã làm cùng ý cho Plan mode (dò xem yana-rt có hiểu trường mới không, nếu không thì cảnh báo) |
| Thay đổi có hiệu lực từ phiên sau | Khớp luật Project Memory đã có: không đổi system prompt giữa hội thoại. Công tắc đổi thì áp từ hội thoại mới |

### Việc phải sửa ở phía Yana để áp dụng

1. `yana-ai install` hiện chép hook và script vào `.claude/` của từng dự án. Mô hình mới cần **lớp nối mỏng** trong dự án (khai báo hook trỏ về `~/.yana`), phần nặng ở `~/.yana`.
   Đây là thay đổi installer, cần thiết kế và duyệt riêng (liên quan `49-immutable-infrastructure-law`, `67-core-integrity-lock-law`).
2. yana-rt tìm sandbox ở `<dự án>/core/scripts/sandbox-exec.sh`. Phải đổi để tìm trong `YANA_HOME` (và vẫn giữ cách cũ làm đường lùi).
3. Giám Thị cần chạy từ `~/.yana`, không từ một bản repo cụ thể (hiện có hai bản trỏ hai chỗ khác nhau).

### Quyết định của anh Tâm (2026-10-14)

1. **Nguồn tải: cả hai.** Phần Python từ PyPI (`pip install yana-ai`), phần Rust từ crates.io (`cargo install yana-rt`). Cả hai lệnh **tự chạy** khi cài app.
   Gói PyPI còn mang theo bản `yana-rt` dựng sẵn (`bin/yana-rt-<nền tảng>-<kiến trúc>`), nên bộ cài ưu tiên bản dựng sẵn (nhanh, không cần Rust),
   chỉ biên dịch bằng `cargo` khi gói không có bản cho máy này.
2. **Thư mục nhà `~/.yana`**: đồng ý.
3. **Giám Thị: tự động cài.** Nó cài theo từng dự án (`giamthi install <dự án>`), nên chạy khi một thư mục được mở/áp dụng, không phải lúc cài hệ thống.

Hai điều cần lưu ý cho quyết định 3:

- **macOS chặn thư mục Desktop, Documents, Downloads.** `giamthi install` trên `~/Desktop/Yana-AI` trả lỗi "macOS background access is restricted" (đã chạy thử `--dry-run`).
  Cài tự động không thể vượt qua chặn này, và bộ cài **không bao giờ** tự thêm `--allow-protected-path`. Với thư mục như vậy bộ cài báo rõ cần làm gì: cấp Full Disk Access
  rồi chạy lại, hoặc chuyển dự án sang `~/Projects`. Đó là quyền riêng tư của macOS, không phải việc của em quyết.
- **Rust:** nếu gói PyPI không có bản dựng sẵn cho máy và máy chưa có `cargo`, bộ cài dừng với hướng dẫn cài Rust (rustup), chưa tự cài Rust. Tự cài cả Rust toolchain
  là một thay đổi lớn hơn, chờ anh quyết.

### Tiến độ (cập nhật 2026-10-14)

Đã có `tools/yana-ide/setup/` (Python, chỉ thư viện chuẩn): `yana_system_install.py` và gói `yana_install/` (`seed.py`, `stages.py`, `cli.py`).

- Giao thức giai đoạn y như Hermes: `--manifest`, `--stage NAME --json`, `--status`, `--dry-run`. Chín giai đoạn: prerequisites, package (PyPI), runtime (gói dựng sẵn hoặc crates.io),
  pack, config, integrity, sandbox, supervisor, complete.
- Chép gói theo bảng băm (`.bundled_manifest`) như `skills_sync` của Hermes: không đè lên bản người dùng đã sửa, không chép lại cái đã xóa, không theo symlink, không ghi ra ngoài
  thư mục đích, bỏ `core/memory` và `core/tests`.
- Test: `python3 -m unittest discover -s tools/yana-ide/tests -p test_system_install.py` đạt 39/39. Mọi lệnh ngoài (pip, cargo, docker, giamthi) là script giả trong thư mục tạm.
  Khi viết test đã bắt được một lỗi thật trong kiểm tra đường dẫn (`safe_dest`), đã sửa.
- **Chạy thật** với nguồn là repo này vào thư mục nhà tạm: 9 giai đoạn, thoát 0, **7063 file, 111 MB**, toàn bộ nguyên vẹn; chạy lại lần hai: 7063 file không đổi; runtime đã cài chạy được (`yana-rt 1.5.1`).
  Docker không chạy nên giai đoạn sandbox báo bỏ qua kèm lý do; giai đoạn supervisor bỏ qua vì chưa có thư mục dự án.
- **Chưa làm:** đường PyPI thật (`pip install` thật) và đường crates.io thật chưa chạy, chỉ kiểm bằng script giả và `--dry-run`. Màn "Cài hệ thống Yana" trong IDE chưa có. Control Center chưa đọc
  `--status` của bộ cài. yana-rt, `yana-ai install` và Giám Thị chưa được sửa để dùng `~/.yana` (ba việc ở mục "Việc phải sửa ở phía Yana").

### Kết quả test thật (2026-10-14, vào thư mục nhà tạm, chưa đụng `~/.yana`)

Chạy bằng `--package yana-ai==1.5.1 --requirements <khóa có băm> --runtime-version 1.5.1`, mạng thật.

| Giai đoạn | Kết quả thật |
|---|---|
| prerequisites | đạt (Python 3.14.7, có git, cargo 1.96, docker; trống 74 GB) |
| package | `pip install` thật với `--require-hashes`: 7 gói (`yana-ai 1.5.1`, `jsonschema`, `pyyaml`, `attrs`, `referencing`, `rpds-py`, `jsonschema-specifications`) cài vào môi trường Python của nhà |
| runtime | **biên dịch thật từ crates.io** (`cargo install yana-rt 1.5.1 --locked`, 4 luồng): `yana-rt 1.5.1` chạy được. Tổng pip + biên dịch khoảng **1 phút 50 giây** trên máy này |
| pack | 7062 file chép từ wheel đã cài, 0 file bị giữ lại, 0 lỗi |
| integrity | 7062 nguyên vẹn, 0 sửa, 0 mất |
| sandbox | bỏ qua: Docker đã cài nhưng daemon không chạy |
| supervisor | bỏ qua: xem phát hiện 4 |
| complete | đạt, ghi dấu hoàn tất. Tổng thư mục nhà: 220 MB |

Cài lại lần hai (kiểm riêng trên nguồn cục bộ): 7063 file không đổi, chạy lại không đè gì.

Phát hiện từ test thật:

1. **Gói PyPI yêu cầu Python 3.11 trở lên** (`requires_python >=3.11`). Bộ cài từng cho 3.9, đã sửa và có test.
2. **Wheel `yana-ai` không chứa `yana-rt` dựng sẵn** (`yana_ai/bin/` chỉ có `yana`). Nên máy sạch **bắt buộc** có Rust để biên dịch từ crates.io. Quyết định tự cài Rust (rustup) hay không vẫn mở.
3. **Wheel đã công bố chứa `core/memory/`**: 5 file nén phiên `L2_session/auto-compress-20260628T*.md`, 98 file journal agent, `trust-ledger.json`. Nội dung xem qua chỉ là ghi chú phát triển, mức nhạy cảm thấp,
   nhưng là dữ liệu trạng thái không nên đi vào gói. Bộ cài bỏ `core/memory`; việc loại khỏi wheel là của `pyproject.toml` (chưa sửa).
4. **Giám Thị đòi dự án đã có sẵn `.claude/scripts/giamthi-watch.sh`.** `giamthi install` chạy thật báo: phải chạy `yana-ai install <dự án>` trước. Nghĩa là Giám Thị hiện đọc script **từ chính dự án**,
   chưa dùng `~/.yana`. Đây đúng là việc "Giám Thị phải chạy từ thư mục nhà" ở mục phải sửa. Bộ cài xử lý thành "bỏ qua kèm lý do" (`needs: project-pack`) để không làm hỏng cả lần cài.
5. Thêm một rào của macOS: dự án dưới Desktop, Documents, Downloads bị chặn (đã gặp ở lần chạy thử trước).
6. `yana-ai --version` in 1.5.0 dù gói là 1.5.1: nó đọc phiên bản **sản phẩm** từ `plugin.json`, còn 1.5.1 là phiên bản gói Python. Hai trục tách nhau theo `VERSIONING.md`, chỉ dễ gây nhầm.
7. Mã băm wheel tải về khớp mã băm PyPI công bố (đã đối chiếu từng byte). Khóa băm trong lần thử này do em tạo từ chính các file vừa tải (tin vào lần đầu); khi phát hành thật, khóa phải được tạo và ký ở khâu release.

### Xử lý các phát hiện (cùng ngày)

| Phát hiện | Cách xử lý | Bằng chứng |
|---|---|---|
| 1. Máy sạch không có Rust | Giai đoạn mới `toolchain`: tải `rustup-init` chính thức từ `static.rust-lang.org`, **kiểm sha256 theo file `.sha256` công bố trước khi chạy**, cài vào `<nhà>/rust` với `CARGO_HOME` và `RUSTUP_HOME` riêng, `--profile minimal`, `--no-modify-path` (không đụng `PATH`, shell profile hay `~/.cargo` của người dùng). Chỉ chạy khi cần: bỏ qua nếu đã có `cargo` trên PATH, có runtime dựng sẵn, hoặc chỉ định runtime tay. Từ chối `http://`, có trần dung lượng 64 MB, báo rõ khi thiếu trình biên dịch C (`xcode-select --install`) | 9 test mới. **Chạy thật** với `PATH` không có cargo: tải `rustup-init`, cài `cargo 1.99.0`, biên dịch `yana-rt 1.5.1` bằng đúng bản đó, thoát mã 0 |
| 1b. Rust nặng | Sau khi build xong bằng Rust của Yana, tự dọn bộ nhớ đệm crate (khoảng 379 MB, tải lại được). Cờ `--prune-rust` xóa luôn toolchain (khoảng 463 MB; lần cập nhật sau giai đoạn `toolchain` tự cài lại). Không bao giờ dọn Rust của người dùng | 3 test mới. Lần chạy thật trên máy sạch (trước khi có bước dọn) là 1,1 GB, trong đó Rust 853 MB |
| 2. Gói công bố chứa `core/memory` | `pyproject.toml`: bỏ ánh xạ nguyên cả `core` (vì `force-include` bỏ qua `exclude`), ánh xạ từng thư mục con, chỉ giữ hai file mã `secure-logger.js` và `trust-ledger.js`; thêm `exclude` cho sdist vì `python -m build` dựng wheel từ sdist. Bộ cài dùng cùng danh sách | Dựng thật bằng `python -m build`: wheel mới bỏ đúng **106 file** dữ liệu (6 + 98 + 1 + 1), hai file mã còn, không mất gì khác. `tests/test_packaging.py` 6 test, đỏ trên cấu hình cũ. Còn sót `core/memory/audit/.gitkeep` (file rỗng) trong sdist, vô hại |
| 3. Python tối thiểu | 3.11, theo `requires_python` của gói | 1 test |
| 4. Giám Thị đọc script từ dự án | **Chưa sửa, cần anh duyệt**, xem mục dưới | đã đọc `giamthi_service.py` và `giamthi-watch.sh` |

Ghi chú khi dựng wheel từ working tree: wheel build từ máy này có thêm một file `.so` của thử nghiệm Mojo (`core/lib/hermes_adapted/mojo/__mojocache__/...so`) vì `force-include` bỏ qua `.gitignore`.
Bản phát hành chạy trên checkout sạch của CI nên không dính, nhưng nếu ai dựng wheel trên máy dev thì sẽ lọt vào.

#### Giám Thị: phát hiện và đề xuất (chưa làm, vì là mã của cơ quan an toàn gốc)

Hiện trạng đọc từ mã:

- `giamthi_service.py:34` `watch_script(target)` luôn là `<dự án>/.claude/scripts/giamthi-watch.sh`; dịch vụ (launchd, systemd, Task Scheduler) chạy đúng file đó.
- `giamthi-watch.sh:31-32` suy ra dự án cần canh từ **vị trí của chính script** (`SCRIPT_DIR/../..`). Vì thế không thể chỉ trỏ dịch vụ sang `~/.yana/pack/...`: script sẽ canh nhầm thư mục.
- `SENSITIVE_PATHS` của watcher (`giamthi-watch.sh`) **không có `.claude/scripts`**, và `SOURCE_CHECKOUT` chỉ bật khi có `core/config/core-lock.json`.
  Với dự án đã cài (không có core-lock) thì file `giamthi-watch.sh` nằm trong cây dự án mà tác tử ghi được, và không có gì độc lập kiểm nó.
  Một tác tử ghi đè file đó bằng `exit 0` sẽ vô hiệu hóa Giám Thị ở lần chạy theo lịch kế tiếp. Đây là điều **suy ra từ đọc mã, em chưa thử khai thác**.

Đề xuất (cần anh duyệt, vì đụng `core/scripts/` bị ghim bởi core-lock, thuộc Tier 1, và theo `54-bft-consensus-law` + `67-core-integrity-lock-law` cần hai người xem độc lập rồi mới tạo lại khóa):

1. `giamthi-watch.sh` nhận mục tiêu từ biến `YANA_WATCH_TARGET` (nếu có, và là thư mục tồn tại, không phải symlink thoát ra ngoài) thay vì luôn suy từ vị trí script. Không có biến thì giữ hành vi cũ.
2. `giamthi_service.py` ưu tiên script ở `~/.yana/pack/core/scripts/` (ngoài cây ghi được của dự án) và truyền `YANA_WATCH_TARGET`; không có thì dùng bản trong dự án như cũ.
3. Thêm `.claude/scripts` vào `SENSITIVE_PATHS`.
4. Test bash cho watcher: canh đúng mục tiêu từ nhà, không canh nhầm, bản trong dự án bị sửa thì bị phát hiện.

### Việc không làm vội

Chưa viết installer. Bộ cài của Hermes dài hàng nghìn dòng (riêng `bootstrap.rs` 1519 dòng, `update.rs` 1795 dòng) vì xử lý hủy, khóa file, cập nhật đang chạy,
Windows. Yana nên làm từng giai đoạn nhỏ và kiểm từng cái, bắt đầu từ giai đoạn đọc trạng thái (Control Center đã có) rồi đến `pack` và `integrity`.
