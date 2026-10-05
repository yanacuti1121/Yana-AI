# Hợp đồng WS6: backend chạy lệnh (Docker, SSH)

Trạng thái: hợp đồng được anh Tâm duyệt (câu "làm đi em anh duyệt"); **E0 và E1 Implemented và Tested** (xem mục 13), E2 (SSH) chưa làm; chưa nối vào `run_command` (xem mục 13). **E1 chưa được coi là an toàn để nối: review lần 2 tìm ra lỗ che-theo-đường-dẫn không vá được bằng mount (mục 14).** Nhánh `ws6/exec-backends`, gốc là `ws3/tools` (đã chứa `program_path`, `visible_line`, tách `lsp`). Phạm vi file: `src/exec_backend/` (mới), `src/capability/command*` (chỉ phần chọn backend), `src/os/` (phần môi trường), `tests/`. Không sửa `src/runtime/`, `src/guard`, `core/`; chỗ nào cần sửa ngoài đó thì ghi ở mục 10 và báo.

## 1. Vấn đề

`run_command` hiện chạy lệnh trên máy người dùng, sau khi người dùng duyệt từng lần. Đó là hàng rào duy nhất. Một lệnh đã duyệt là một chương trình tùy ý với quyền của người dùng, nên có thể đọc `$HOME`, ghi vào kho tin cậy (`$HOME/.yana-ai/trust`), sửa `.git/hooks`, đọc khóa. Hợp đồng WS3 mục 17 đã ghi rủi ro này là chấp nhận có điều kiện. WS6 cho một cách chạy lệnh trong môi trường tách biệt để rủi ro đó nhỏ đi khi người dùng chọn.

## 2. Hiện trạng (đã đọc mã, chưa chạy gì mới)

- `capability::command::spawn_command(root, argv, use_sandbox)`: `Command::output()` (đọc hết đầu ra vào bộ nhớ, **không giới hạn lúc đọc**; `execute_command` cắt 32 KiB sau khi đã đọc), cwd là gốc repo, **không `env_clear`** (con thừa kế toàn bộ môi trường, gồm `HOME` và mọi biến bí mật), chỉ thêm `YANA_AGENT_CHILD=1`. Không có hạn thời gian, không có nhóm tiến trình.
- `use_sandbox = true` (mặc định của chat, `--no-sandbox` để tắt): chạy `bash core/scripts/sandbox-exec.sh <argv>`; script tự chọn docker, nsjail hoặc ulimit. Đó là một hệ riêng bằng bash, ngoài kiểm soát của Rust, và chế độ ulimit không cách ly tệp hay mạng.
- Chỗ gọi: `chat/tools/run_command.rs` (qua `ChatCapabilityExecutor`), `compact/mod.rs` (gọi `spawn_command(..., false)` để đếm thống kê từ đầu ra đầy đủ, **phải giữ nguyên**), `bin/pty_bridge.rs` (pty, ngoài phạm vi).
- Khung chạy tiến trình có giới hạn đã có ở `mcp_client/process.rs` (môi trường rỗng, nhóm tiến trình riêng, `kill_tree`) và `mcp_client/bounded.rs` (đọc có trần). WS6 dùng lại hai thứ này, không viết lại.

## 3. Trait (đề xuất)

```rust
pub trait ExecBackend: Send + Sync {
    /// Tóm tắt cho người duyệt: loại, ảnh/máy, mạng, thư mục gắn, giới hạn, tên biến được chuyển.
    fn disclosure(&self) -> BackendDisclosure;
    /// Chạy một lệnh (argv, không qua shell). Chặn đến khi xong, hết hạn hoặc bị hủy.
    fn run(&self, request: &ExecRequest, cancel: &CancellationToken) -> Result<ExecResult, ExecError>;
    /// Đưa/lấy tệp cho backend không gắn thư mục (SSH). Backend gắn thư mục: không làm gì.
    fn sync_in(&self, root: &Path) -> Result<(), ExecError> { Ok(()) }
    fn sync_out(&self, root: &Path) -> Result<SyncReport, ExecError> { Ok(SyncReport::default()) }
    /// Dọn mọi thứ do backend tạo (container, thư mục từ xa). Gọi được nhiều lần, không lỗi nếu đã sạch.
    fn cleanup(&self);
}

pub struct ExecRequest { pub argv: Vec<String>, pub cwd: PathBuf /* tương đối gốc repo */,
    pub env_names: Vec<String> /* chỉ tên, giá trị lấy từ tiến trình cha */, pub limits: Limits, pub network: Network }
pub struct Limits { pub wall: Duration, pub cpu: f32, pub memory_mb: u32, pub pids: u32, pub output_bytes: usize }
pub enum Network { None, Open }          // danh sách cho phép: để sau (mục 6)
pub struct ExecResult { pub stdout: String, pub stderr: String, pub exit_code: Option<i32>, pub truncated: bool, pub timed_out: bool }
```

`execute_command` và `spawn_command` giữ chữ ký; bên trong chúng gọi `LocalBackend` (E0). Mọi đầu ra đi qua trần `output_bytes` **lúc đọc**, không sau khi đọc.

## 4. Chọn backend và nơi giữ cấu hình

Quy tắc: **cấu hình chọn backend không được nằm trong repo mà mô hình ghi được.** Một `.yana-ai/exec.json` trong repo lạ có thể trỏ `ssh` tới máy của kẻ khác, hoặc chọn một ảnh Docker độc. Đề xuất: cấu hình cấp người dùng (`$HOME/.yana-ai/exec/backends.json`, ngoài mọi repo, mô hình không ghi tới được vì nằm ngoài gốc repo như kho tin cậy), cộng cờ `--backend <tên>` cho phiên chat. Mặc định `local`; không tự chuyển sang backend khác khi lỗi (lỗi thì báo, không hạ cấp âm thầm xuống `local`). Chọn cấu hình trong repo (kèm xác nhận lần đầu như `mcp-servers.json`) là phương án thay thế, cần anh quyết (mục 10).

## 5. Bảo vệ kho tin cậy, home, khóa, `.yana-ai/`

Đây là điều kiện "xong" quan trọng nhất. Quy tắc chung của backend tách biệt:

- Lệnh **không thấy** `$HOME`, `~/.yana-ai`, `~/.ssh`, `~/.aws`, `~/.docker`, `docker.sock`, kho tin cậy, bất kỳ tệp nào ngoài thư mục làm việc. Kho tin cậy nằm ngoài repo và không bao giờ được gắn.
- Thư mục làm việc (gốc repo) được gắn vào `/work` đọc-ghi, **trừ** các phần gắn chồng chỉ đọc: `.yana-ai/` (cấu hình mô hình không được tự đổi), `.git/hooks` và `.git/config` (một hook ghi vào đó chạy trên máy thật ở lần dùng git kế tiếp), và các tệp trùng mẫu bí mật của `sensitive_path`. Đây là đường thoát ghi-rồi-chờ, phải chặn.
- Môi trường: chỉ chuyển **tên** biến người dùng liệt kê (`-e NAME`, giá trị đọc từ tiến trình cha, không bao giờ nằm trong argv hay nhật ký). Không chuyển biến `YANA_*` nào ngoài `YANA_AGENT_CHILD=1`. `HOME` trong container là thư mục rỗng.
- Local (E0) **giữ nguyên hành vi**: nó thừa kế môi trường và home như hôm nay, và được ghi rõ là mức rủi ro cao nhất. Bản local cứng hơn (xóa môi trường, `HOME` giả) làm hỏng công cụ cần `~/.cargo`, `~/.gitconfig`, nên chỉ là tùy chọn riêng sau E0 (mục 10).

## 6. Mạng

Mặc định **không có mạng** (`Network::None`: `--network none` với Docker). `Network::Open` chỉ khi người dùng bật trong cấu hình backend **và** hộp duyệt hiện "mạng: mở" cho từng lần. Danh sách cho phép theo host (theo `network-egress-law`) cần một proxy chặn ngoài container; đó là một thành phần riêng, **không làm ở E1**; nếu cần thì thiết kế riêng và hỏi lại. Với SSH, mạng là của máy từ xa, không kiểm soát được; hộp duyệt nói rõ "máy từ xa, mạng của nó".

## 7. Docker (E1)

Gọi tiến trình `docker` có sẵn qua `mcp_client/process`-style (không crate Docker). Chương trình `docker` được xác định bằng `program_path::resolve_program` (không tìm trong repo). Danh sách đối số do một hàm thuần dựng ra và có test từng chuỗi (golden):

`run --rm --init --name yana-<id> --label yana.run=<id> --user <uid:gid không phải 0> --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --cap-drop ALL --security-opt no-new-privileges --pids-limit N --memory M --memory-swap M --cpus C --network none -w /work -v <repo>:/work:rw -v <repo>/.yana-ai:/work/.yana-ai:ro ... -e NAME ... <ảnh> <argv...>`

- **Cấm** (có test quét danh sách đối số): `--privileged`, `--cap-add`, `--device`, `--pid/--ipc/--uts host`, `--network host`, `-v` tới `docker.sock`, `$HOME`, `/`, `/etc`, `/var`, `-v` có nguồn không nằm trong gốc repo, `--user 0` hoặc `root`, `-e NAME=giá-trị`.
- Ảnh: bắt buộc cấu hình rõ, ưu tiên dạng `tên@sha256:...`; không có mặc định ngầm (không tự kéo ảnh `latest`). Không `docker pull` trong lúc chạy lệnh; thiếu ảnh thì báo.
- Hết hạn: giết phía client (nhóm tiến trình), rồi `docker kill yana-<id>` và `docker rm -f yana-<id>`; mỗi lần khởi động và mỗi `cleanup()` quét container có nhãn `yana.run` quá tuổi để không có container mồ côi. Chuỗi `--name` chỉ gồm `[a-z0-9-]`.
- Client `docker` chạy trên máy thật và thừa kế môi trường của nó (cần `DOCKER_HOST`, cấu hình); điều cấm ở mục 5 áp cho **container**, không cho client.
- Giới hạn mặc định (đề xuất): 1 CPU, 512 MB, 128 PID, hạn 120 giây (tối đa 600), đầu ra 32 KiB.

## 8. SSH (E2)

Gọi `ssh` có sẵn. Mọi chạy đều: `-F /dev/null` (bỏ qua `~/.ssh/config`, nơi có thể có `ProxyCommand`/`LocalCommand`), `-o BatchMode=yes`, `-o PasswordAuthentication=no`, `-o ForwardAgent=no`, `-o ForwardX11=no`, `-o ClearAllForwardings=yes`, `-o IdentitiesOnly=yes -i <đường dẫn khóa>` (chỉ **đường dẫn**; nội dung khóa không bao giờ đi qua Yana), `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=<tệp ghim của Yana>`, `-o ConnectTimeout`, `-o ServerAliveInterval`. Khóa host được **ghim trong cấu hình** (khóa công khai đầy đủ, không TOFU, không `accept-new`); host lạ hoặc khóa đổi thì dừng. Không lưu mật khẩu, không có tùy chọn mật khẩu. Lệnh từ xa là một chuỗi dựng bằng `shell_words::quote` từng phần tử argv, đặt sau `cd <thư mục từ xa cấu hình>`; thư mục từ xa phải nằm dưới một gốc cấu hình sẵn, không phải `~` hay `/`.

Đồng bộ tệp: đi lên và xuống theo danh sách tệp, mỗi đường dẫn qua kiểm tra như `file.write` (tương đối, không `..`, không liên kết ra ngoài, không tệp trùng `sensitive_path`); phía nhận không giải nén tay một kho lưu trữ do máy từ xa gửi mà không kiểm tra từng mục. Cách đồng bộ khả thi mà không thêm crate (qua `ssh ... tar` hay `scp`) còn phải thử; xem mục 10.

## 9. Mức rủi ro từng backend (để hộp duyệt hiện)

| Backend | Lệnh thấy được | Mạng | Rủi ro còn lại |
|---|---|---|---|
| `local` | cả máy người dùng | của máy | cao: như hôm nay, chỉ có duyệt từng lần |
| `local` + `sandbox-exec.sh` | tùy chế độ (docker/nsjail/ulimit) | tùy chế độ | ulimit không cách ly; hệ riêng bằng bash |
| `docker` | chỉ `/work` (một phần chỉ đọc) và `/tmp` | không (mặc định) | lỗi thoát container; ảnh độc; `/work` đọc-ghi vẫn sửa được mã nguồn |
| `ssh` | máy từ xa theo tài khoản đã cấu hình | của máy từ xa | tin cậy máy từ xa; tệp đồng bộ về |
| sandbox từ xa (E3) | chưa làm | | chỉ khi anh Tâm yêu cầu |

Hộp duyệt và bản lưu cho duyệt từ xa phải hiện `BackendDisclosure` (loại, ảnh hoặc máy, mạng, phần gắn chỉ đọc, giới hạn, tên biến). Khi tiếp tục, bản tóm tắt dựng lại từ cấu hình hiện tại phải bằng bản đã lưu, như `lsp_query`/`mcp_call`. Phần này đụng `src/runtime/pending_approval.rs` (WS2); xem mục 10.

## 10. Quyết định cần anh Tâm, và phần ngoài phạm vi

1. **Nơi giữ cấu hình backend:** cấp người dùng (đề xuất, an toàn hơn) hay trong repo kèm xác nhận lần đầu?
2. **Ghi `.git/hooks`, `.git/config`, `.yana-ai/` chỉ đọc trong container:** đề xuất bật mặc định (chặn ghi-rồi-chờ), đổi lại `git commit` trong container không ghi được `.git/hooks` (commit vẫn ghi được `.git/objects`). Đồng ý?
3. **Bản `local` cứng hơn** (`env_clear`, `HOME` giả, hạn thời gian, nhóm tiến trình, đọc có trần): làm thành tùy chọn riêng sau E0 hay bỏ qua?
4. **Mạng theo danh sách cho phép:** hoãn (cần proxy). Đồng ý?
5. **Đồng bộ SSH không thêm crate:** thử `ssh host 'tar ...'`; nếu không đủ an toàn thì hỏi lại trước khi thêm gì.
6. **Chính sách ảnh Docker:** bắt buộc digest hay chấp nhận thẻ do người dùng đặt?
7. **Ngoài phạm vi của em, cần báo:** hiện `BackendDisclosure` trong lời nhắc duyệt từ xa cần sửa `src/runtime/pending_approval.rs` (WS2); chọn backend theo phiên cần cờ ở `src/chat` và `src/main.rs`; một bước CI cho `cargo check` của `exec_backend` nằm ở `.github/workflows` (WS0/WS9).

## 11. Kế hoạch và test

- **E0** trait + `LocalBackend` bọc đúng hành vi hiện tại; test hồi quy giữ nguyên (cùng đầu ra, `YANA_AGENT_CHILD`, cwd, mã thoát, đường `use_sandbox`); `compact` vẫn gọi `spawn_command` và nhận đầu ra không cắt.
- **E1** Docker: hàm dựng đối số thuần + test golden và test "cấm" ở mục 7; chương trình `docker` là một tham số (đường dẫn), test truyền một tập lệnh `sh` giả ghi lại đối số và mô phỏng hết hạn/lỗi, không đặt biến môi trường toàn cục; test chứng minh danh sách đối số không có `$HOME`, `~/.yana-ai`, kho tin cậy, `docker.sock`; test không để mồ côi (giả ghi `kill`/`rm`); một test tích hợp `#[ignore]` chạy khi có Docker.
- **E2** SSH: dựng đối số thuần + golden; máy chủ giả bằng tập lệnh; test host lạ và khóa đổi bị từ chối, test không có mật khẩu/agent/`-F` mặc định, test đường dẫn đồng bộ độc (`..`, tuyệt đối, liên kết) bị từ chối.
- Tải máy: `nice -n 19`, một job build, `--test-threads=2`, tối đa 5 lượt lặp.
- Xong khi: mỗi backend có test với bản giả; lệnh trong backend không đọc/ghi được kho tin cậy hay home thật (có test chứng minh); mặc định không có mạng; hết hạn không để tiến trình hay container mồ côi; số cảnh báo bin `yana-rt` không vượt `main`; `cargo test --locked --features cli` xanh; review chỉ đọc bằng security-auditor và code-auditor, mọi đường thoát sandbox là lỗi Safety chặn gộp.

## 12. Chưa kiểm chứng

Hành vi thật của Docker trên máy này (chưa chạy, và test tự động không chạy Docker thật); `--user` với bind mount trên macOS (Docker Desktop ánh xạ quyền khác Linux); `ssh -F /dev/null` và `UserKnownHostsFile` trên Windows OpenSSH; tương tác của các phần gắn chồng chỉ đọc với tệp đang tồn tại hoặc chưa tồn tại; chi phí khởi động container cho từng lệnh.

Nguồn tham khảo hành vi (đọc, không chép mã): hermes-agent `tools/environments/{base,docker,docker_egress,ssh,file_sync}.py` (MIT, Nous Research). Khác biệt có chủ ý: hermes dùng `StrictHostKeyChecking=accept-new` và gắn thêm thư mục; Yana ghim khóa host, không TOFU, và chặn ghi vào `.git/hooks`.

## 13. Cập nhật sau E0 và E1 (khác với các mục trên)

Mã: `src/exec_backend/{mod,docker,docker_mounts,docker_run}.rs`; test: `tests.rs`, `docker_tests.rs`, `docker_fake_tests.rs` (docker giả bằng `sh`), một test tích hợp `#[ignore]` cần Docker thật và ảnh ghim digest trong `YANA_TEST_DOCKER_IMAGE`.

**Khác với mục 3.** Trait chỉ có `disclosure`, `run`, `cleanup` (chưa có `sync_in`/`sync_out`: SSH làm ở E2). `ExecRequest` chỉ có `root` và `argv`; giới hạn, mạng và tên biến nằm trong `DockerConfig` (một backend, một bộ giới hạn), không nằm trong từng yêu cầu. Kết quả là `ExecOutput { stdout, stderr: Vec<u8>, exit_code, timed_out, truncated }`. Lỗi dùng `CapabilityError`. Chưa có `CancellationToken`: hạn thời gian (`wall`) là cách dừng duy nhất. Chương trình `docker` phải là đường dẫn tuyệt đối trong cấu hình (không tìm theo `PATH`).

**Cấm và bắt buộc (mục 7), theo mã hiện tại.** `docker run --rm --init --pull never` (không bao giờ kéo ảnh khi chạy lệnh), dùng `--mount` (không dùng `-v`; nguồn thiếu thì lỗi chứ không tự tạo trên máy thật), người dùng số `uid:gid` khác 0 (mặc định id của tiến trình, hoặc 65534 nếu đang là root), `--read-only`, `/tmp` tmpfs `noexec`, `--cap-drop ALL`, `no-new-privileges`, giới hạn PID/RAM (swap bằng RAM)/CPU, `--network none` mặc định. Ảnh phải là `tên@sha256:<64 hex thường>`. Chỉ nhận daemon Docker cục bộ: `DOCKER_HOST` không phải `unix://` hoặc `DOCKER_CONTEXT` khác `default` thì từ chối (nguồn mount là đường dẫn trên đĩa của daemon). Thư mục làm việc không được là thư mục home, thư mục chứa home, hay `/`.

**Phần được bảo vệ trong thư mục làm việc (mục 5), theo mã hiện tại.** `.yana-ai`, `.git/hooks`, `.git/config` gắn chỉ đọc. Một thành phần của các đường dẫn đó là liên kết mềm thì từ chối chạy (nguồn mount sẽ trỏ ra ngoài repo). `.yana-ai` chưa có thì được tạo rỗng trên máy thật rồi gắn chỉ đọc (để không ghi-rồi-chờ); `.git/hooks` được tạo nếu `.git` là thư mục thật; **nếu không có `.git` thì không tạo gì và một lệnh vẫn có thể tạo `.git/...` ở đó** (giới hạn đã biết, hộp duyệt nói rõ). Tệp và thư mục tên giống bí mật (`sensitive_path`: `.env*`, `*.pem`, `*.key`, `.ssh`, `.aws`, `id_rsa`...) bị che ở **mọi độ sâu** (tối đa 8 cấp, 20 000 mục, 64 mục bị che; vượt thì từ chối chạy): tệp bằng một tệp rỗng (`/dev/null`) đè lên, thư mục bằng tmpfs rỗng chỉ đọc. Không tìm trong `node_modules`, `target`, `.venv`, `venv`, `__pycache__`, `dist`, `build`, `.next` (thư mục của người khác, rất lớn; hộp duyệt nói rõ); liên kết mềm không được theo. Tên bí mật mà `--mount` không mang được (dấu phẩy, nháy kép, xuống dòng) hoặc tên không phải UTF-8 thì từ chối chạy. Thư mục làm việc vẫn **ghi được** (Makefile, `package.json`, `.cargo/config.toml` mà lệnh ghi vào sẽ chạy trên máy thật về sau): hộp duyệt nói điều này.

**Môi trường.** Client `docker` chỉ nhận vài biến (`HOME`, `DOCKER_*`, `XDG_RUNTIME_DIR`, `TMPDIR`, `PATH` đã lọc mục trong repo) cộng các biến người dùng liệt kê; vào container chỉ đi `-e TÊN` (không giá trị), cùng `HOME=/tmp` và `YANA_AGENT_CHILD=1`. Tên bị từ chối: `HOME`, `PATH`, `USER`, `TMPDIR`, `XDG_RUNTIME_DIR` và các tiền tố `YANA_`, `DOCKER_`, `LD_`, `DYLD_`, `SSH_` (không phân biệt hoa thường).

**Hết hạn và dọn dẹp.** Hết `wall` (1 đến 600 giây): giết nhóm tiến trình của client, rồi `docker kill` và `docker rm -f` tên `yana-<id>`. Đọc đầu ra có trần ngay lúc đọc (cho từng luồng stdout và stderr, nên tối đa gấp đôi), và sau khi client thoát chỉ chờ ống đóng tối đa 2 giây. Mỗi container có nhãn `yana.deadline` (giờ hiện tại cộng `wall` cộng 60 giây); `cleanup()` xóa mọi container có nhãn `yana.run`, tên bắt đầu `yana-`, đã quá hạn, bất kể ai khởi động (không dựa vào pid). Mã thoát 125 của `docker run` (lỗi của chính Docker) và client chết do tín hiệu là **lỗi**, không phải kết quả của lệnh.

**Chưa nối vào `run_command`.** `DockerBackend` chưa được chọn từ cấu hình hay cờ nào, và `BackendDisclosure` chưa hiện trong hộp duyệt hay lời nhắc từ xa (cần sửa `src/runtime/pending_approval.rs` và `src/chat`, ngoài phạm vi E1; sẽ làm khi anh Tâm cho phép sửa vừa đủ). Nhóm `#![allow(dead_code)]` ở `exec_backend/mod.rs` là tạm thời vì lý do đó và phải bỏ khi nối. Chưa có cấu hình cấp người dùng (`backends.json`).

**Chưa kiểm chứng:** Docker thật (mọi test chạy bằng `docker` giả); hành vi của `--mount type=tmpfs,...,readonly` và bind chỉ đọc lồng nhau trên Docker Desktop macOS; `proxies` trong `~/.docker/config.json` có tiêm biến proxy vào container hay không; hai lệnh song song cùng một thư mục làm việc; Windows; một lần test hết hạn từng lỗi một lần dưới tải nhưng không tái hiện trong 5 lượt (nay thông báo lỗi in ra danh sách lời gọi).

## 14. Review lần 2 của E1: lỗ không vá được bằng mount, và hướng đề xuất

Review chỉ đọc lần 2 (security-auditor, đọc mã, chưa chạy Docker thật) xác nhận đã sửa thật: `--pull never`, dọn mồ côi theo hạn, giết nhóm tiến trình trước khi thu dọn, giới hạn thời gian chờ ống, liên kết mềm trung gian ở trạng thái tĩnh. Còn các lỗ sau, đều có cùng gốc: **thư mục làm việc thật được gắn ghi được, nên lệnh trong container đổi tên được mọi thứ không phải điểm mount, và mọi bảo vệ theo đường dẫn chỉ có hiệu lực trên đường dẫn lúc quét.**

- N1a: `mv .git .git.x && mkdir .git` trong container đổi tên thật trên máy thật (chỉ `.git/hooks` và `.git/config` là điểm mount, không phải `.git`), rồi dựng `.git/config` có `core.fsmonitor` hoặc `hooks/` do mô hình viết; lần chạy git kế tiếp trên máy thật chạy mã đó. Cùng lớp: `.git` là tệp (worktree, submodule), `.git/modules/*`, `.git/worktrees/*`. **Safety, chặn nối.**
- N3: `mv config node_modules/` (hoặc xuống sâu hơn 8 cấp) ở lần chạy 1, rồi lần chạy 2 quét không thấy `config/.env` và nó đọc được. Che theo đường dẫn không bao giờ kín khi thư mục cha ghi được. **Safety, chặn nối.**
- N2: giữa lúc kiểm tra liên kết mềm và `docker run` một tiến trình khác trên máy đổi `.yana-ai` thành liên kết mềm ra ngoài (thấp xác suất, cần ghi đồng thời).
- N4: nội dung `.yana-ai` (có `leases.json`, `pending-approvals.json`) và `.git/config` (URL remote có thể mang token) chỉ chỉ đọc, vẫn đọc được: lệch với lời hứa "không thấy bản ghi tin cậy".
- N6: nếu `HOME` không đặt thì kiểm tra thư mục gốc bỏ qua phần home; gốc là `~/.ssh`, `~/.aws` hay `/run` vẫn qua; liên kết mềm tên bí mật không bị che.
- N8: `check_daemon` không biết context đang dùng trong `~/.docker/config.json` và từ chối nhầm `desktop-linux`, `colima`.
- Điều kiện khi nối: một lỗi Docker (kể cả "từ chối vì giới hạn") **không bao giờ** được tự hạ xuống backend `local`; hạ cấp tự động biến mọi giới hạn an toàn thành cách tắt sandbox.

**Đề xuất (cần anh Tâm quyết, thay đổi thiết kế mục 5):** không gắn thư mục thật. Mỗi lần chạy: (1) **sao chép vào thư mục tạm** của Yana (ngoài repo) một bản của cây làm việc, **loại ngay lúc sao chép** tệp tên bí mật (`sensitive_path`), `.git`, `.yana-ai`, liên kết mềm trỏ ra ngoài, socket và thiết bị; (2) gắn thư mục tạm đó (ghi được) làm `/work`; (3) sau khi lệnh xong, **đồng bộ ngược có kiểm tra**: chỉ tệp thường, đường dẫn tương đối không `..`, không đè lên `.git`, `.yana-ai` hay tên bí mật, không liên kết mềm, trần số tệp và dung lượng; thay đổi bị từ chối được báo; (4) xóa thư mục tạm. Như vậy không còn gì để đổi tên trên máy thật, bí mật không nằm trong container, `.git` không bị lệnh sửa, và không còn khe TOCTOU với thư mục thật. Đổi lại: tốn thời gian và đĩa cho cây lớn (cần trần), `git commit` trong container không dùng được (commit làm bằng công cụ phía máy thật), và lệnh sinh tệp lớn phải qua đồng bộ ngược. Cùng cơ chế này là `sync_in`/`sync_out` mà SSH (E2) cần nên không thừa công. Nếu anh chọn hướng này, mục 5 và 7 của hợp đồng được viết lại và `docker_mounts.rs` được thay bằng bước sao chép và đồng bộ.
