# Hợp đồng WS6: backend chạy lệnh (Docker, SSH)

Trạng thái: hợp đồng được anh Tâm duyệt (câu "làm đi em anh duyệt"); **E0 và E1 Implemented và Tested** (xem mục 13), E2 (SSH) chưa làm; chưa nối vào `run_command` (xem mục 13). **E1b (chạy trên bản sao, mục 15) thay thế cách gắn thư mục thật của E1 sau review lần 2 (mục 14); chờ review lần 3 trước khi nối.** Nhánh `ws6/exec-backends`, gốc là `ws3/tools` (đã chứa `program_path`, `visible_line`, tách `lsp`). Phạm vi file: `src/exec_backend/` (mới), `src/capability/command*` (chỉ phần chọn backend), `src/os/` (phần môi trường), `tests/`. Không sửa `src/runtime/`, `src/guard`, `core/`; chỗ nào cần sửa ngoài đó thì ghi ở mục 10 và báo.

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

## 13. Cập nhật sau E0 và E1 (khác với các mục trên; các đoạn về gắn thư mục thật, che bí mật và `.yana-ai` chỉ đọc đã bị mục 15 thay thế)

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

## 15. E1b: chạy trên bản sao (thay thế phần gắn thư mục thật của mục 5 và 7; anh Tâm duyệt hướng này: "oke làm đi em")

Mã: `src/exec_backend/{staging,staging_sync,docker_mounts}.rs`; test: `staging_tests.rs`, `docker_fake_tests.rs`, `docker_tests.rs`.

**Mỗi lần chạy.** (1) `Staging::copy_in` sao chép thư mục làm việc vào `$TMPDIR/yana-exec-<uuid>` (quyền 0700, ngoài repo). (2) Container chỉ gắn **bản sao đó** làm `/work` (một `--mount` duy nhất, nguồn là bản sao). (3) Nếu lệnh kết thúc (kể cả mã thoát khác 0): `sync_back` đưa thay đổi về thư mục thật. Hết hạn thì **không** đưa gì về, ghi chú nói rõ. Lỗi của chính Docker (mã 125, tín hiệu): không đưa gì về, trả lỗi. (4) Bản sao luôn bị xóa (`Drop`), kể cả khi lỗi.

**Không có trong bản sao** (và không bao giờ được đưa về): `.git`, `.yana-ai` (không phân biệt hoa thường); mọi đường dẫn có thành phần trùng `sensitive_path` (`.env*`, `*.pem`, `*.key`, `.ssh`, `.aws`, `id_rsa`, `leases.json`, `*credential*`/`*token*`/`*secret*` dạng cấu hình...), ở mọi độ sâu; liên kết mềm; tệp không phải tệp thường (fifo, socket, thiết bị); thư mục vendored/build (`node_modules`, `target`, `.venv`, `venv`, `__pycache__`, `dist`, `build`, `.next`); tên không UTF-8 hoặc có ký tự điều khiển. Tên bị bỏ lại được báo trong `ExecOutput.notes` (chỉ tên, tối đa 20). Quyền tệp giữ nguyên trừ bit setuid, setgid, sticky.

**Giới hạn, và vượt thì từ chối chứ không cắt:** 20 000 tệp, 256 MiB, sâu 16 cấp khi sao chép vào; khi đưa về, số tệp thay đổi và số byte thay đổi cũng bị chặn, **kiểm trước khi ghi bất cứ gì** (vượt thì không ghi gì).

**Đưa về (`sync_back`).** Mỗi tệp thường trong bản sao có băm SHA-256 khác lúc sao chép thì là thay đổi; tệp có trong lúc sao chép mà biến mất là xóa. Chỉ tệp thường được ghi (qua tệp tạm `.yana-sync-*` cùng thư mục rồi đổi tên; bản tạm bị xóa nếu lỗi). Từ chối và báo (không dừng cả lượt): đường dẫn trùng danh sách loại ở trên; liên kết mềm hoặc tệp đặc biệt trong bản sao; **một thư mục cha trên máy thật là liên kết mềm hoặc là tệp** (không ghi xuyên liên kết); đích trên máy thật là liên kết hoặc thư mục; **tệp trên máy thật đã đổi từ lúc sao chép** (băm khác bản đầu) thì không ghi đè và không xóa; tệp mới mà trên máy thật đã có file cùng tên thì không đè. Thư mục rỗng mới không được đưa về (chỉ tệp). Việc ghi từng tệp có thể thành công một phần; báo cáo ghi số ghi, số xóa, và các tệp bị bỏ cùng lý do.

**Vì sao đóng được các lỗ của mục 14.** Không còn gì thật được gắn vào container, nên không có gì để đổi tên trên máy thật (N1a, N1b); bí mật chưa bao giờ nằm trong container nên chuyển thư mục vào vùng không quét chẳng lộ gì (N3, có test `renaming_a_secret_folder_inside_the_copy_reaches_nothing`); không còn nguồn mount nào trên máy thật để đổi thành liên kết mềm giữa lúc kiểm tra và chạy (N2); `.yana-ai` và `.git/config` không có trong container (N4); `check_root` từ chối khi không xác định được HOME (N6, nửa đầu).

**Còn lại, ghi rõ:** (a) lệnh ghi được `Makefile`, `package.json`, `.cargo/config.toml`, `.github/workflows/*`, `.vscode/tasks.json`, `.gitattributes`, `.gitignore`... và các tệp đó **được đưa về** rồi có thể chạy trên máy thật về sau; đó là kết quả hợp lệ của việc người dùng duyệt lệnh, hộp duyệt nói điều này; (b) cửa sổ đua rất nhỏ giữa kiểm tra đích và đổi tên khi đưa về (một tiến trình khác đổi một thư mục cha thành liên kết mềm đúng lúc đó); (c) tệp lớn cần nhiều đĩa trong `$TMPDIR`; (d) `git commit` trong container không dùng được (không có `.git`), commit làm bằng công cụ phía máy thật; (e) vẫn chưa kiểm chứng Docker thật; (f) `check_daemon` vẫn chỉ nhìn biến môi trường (N8); (g) tệp tên hay đường dẫn bí mật nằm trong thư mục vendored không bị che vì thư mục đó không được sao chép; (h) liên kết cứng đến tệp bí mật trong repo (cùng inode) với tên vô hại sẽ được sao chép như tệp thường (cần một bước ghi trước đó ngoài container).

**Điều kiện khi nối vào `run_command` (không đổi):** lỗi Docker, kể cả "từ chối vì giới hạn", không bao giờ tự hạ xuống `local`; hộp duyệt và lời nhắc từ xa hiện `BackendDisclosure` (nay gồm "chạy trên bản sao", phần bị bỏ lại, và "tệp ghi về có thể chạy sau"), và khi tiếp tục phải so khớp với cấu hình hiện tại; ba việc đó cần sửa `src/runtime/pending_approval.rs` và `src/chat`, chờ anh Tâm cho phép rõ.

## 16. Sửa sau review lần 3 của E1b (security-auditor, đọc mã, chưa chạy Docker thật)

Đã sửa trong mã: (S1) **danh tính thay vì chỉ tên**: lúc sao chép, ghi (dev, inode) của mọi mục bị loại vì tên (`.git`, `.yana-ai`, thư mục bí mật, vendored); khi đưa về, một thư mục cha hoặc đích trên máy thật trùng danh tính đó thì từ chối, nên tên gấp hoa thường phi ASCII trên đĩa không phân biệt hoa thường (U+017F, U+212A) không ghi được vào `.ssh`, `.aws`, `node_modules` thật. (S2) sau khi client `docker` thoát, hỏi daemon `docker inspect yana-<id>`: chỉ khi "No such object" mới đưa về; còn tồn tại thì kill, rm -f và **không** đưa gì về. (S3) bản sao nằm ở `yana-exec-<uuid>/work`, cha 0700, chỉ mount `work`. (C1) đổi tên chỉ khác hoa thường không xóa bản gốc. (C6) một thư mục hay tệp được thay bằng liên kết, hoặc tệp đặc biệt, không làm xóa cây thật. (C2) so cỡ trước khi băm, ngân sách đọc tổng 4 lần trần, và `--ulimit fsize=<max_bytes>` cho mỗi tệp trong container. (C3) lỗi khi đưa về không làm mất kết quả lệnh: trả kết quả kèm ghi chú. (C4) xóa bản sao mở quyền thư mục trước, không theo liên kết. (C5) tệp không đọc được thì bỏ qua và báo. (C7) `check_root` còn từ chối `~/Library`, `/etc`, `/System`, `/Library`, gốc có tên dạng bí mật (`~/.ssh`, `~/.aws`), và gốc chứa thư mục chứa các bản sao. (C9) không phải Unix thì từ chối rõ ràng. (C10) tệp có nhiều hơn một liên kết cứng không được sao chép. (C12) quyền tệp chỉ giữ `& 0o755`. Ghi chú đưa về nay liệt kê tên tệp đã ghi (tối đa 20).

Còn lại, ghi nhận: (C8) `check_daemon` chỉ nhìn `DOCKER_HOST`/`DOCKER_CONTEXT`; không biết `currentContext` trong `~/.docker/config.json`, và từ chối nhầm `desktop-linux`/`colima`. (C11) bản sao 0700 thuộc người dùng Yana, nên `--user` khác uid chủ (hoặc dự phòng 65534 khi Yana chạy bằng root) không đọc/ghi được. (C13) danh sách tên bí mật (`sensitive_path`) còn hở với `kubeconfig`, `service-account*.json`, `*.keytab`, `*.ovpn`, `.dockercfg`, `wp-config.php`, `*.kdbx`; bí mật nằm trong tệp tên vô hại được sao chép như tệp thường. Thay đổi chỉ về quyền (`chmod +x`) không được đưa về vì chỉ so băm. Không có trần dung lượng đĩa **trong lúc** lệnh chạy ngoài `fsize` từng tệp: nhiều tệp trong `wall` giây vẫn có thể đầy `$TMPDIR`. Mở nguồn khi đưa về dùng `O_NOFOLLOW` ở thành phần cuối, không phải `openat` từng cấp (an toàn vì container đã dừng và bản sao riêng tư, nhưng không chống được tiến trình khác của chính người dùng). Mục (a) của mục 15 cần liệt kê rộng hơn các tệp "chạy sau trên máy thật" mà lệnh có thể ghi được và sẽ được đưa về: `Makefile`, `package.json`, `setup.py`, `conftest.py`, `build.rs`, `*.pth`, `sitecustomize.py`, `.husky/*`, `.pre-commit-config.yaml`, `.devcontainer/*`, `.github/workflows/*`, `.vscode/tasks.json`, `.mcp.json`, `AGENTS.md`/`CLAUDE.md` và các thư mục `.claude/`, `.codex/`, `.cursor/` (chỉ dẫn cho chính tác tử). Hộp duyệt nói điều này và ghi chú sau chạy liệt kê tên tệp đã ghi để người dùng soát. Mục 14 chỉ định nghĩa N1a, N2, N3, N4, N6, N8 (N1b, N5, N7 là nhãn của các review khác về `.git` là tệp, độ sâu 8, liên kết mềm tên bí mật; cả ba nay không còn vì không có mount thật và liên kết mềm không được sao chép).

## 17. E2: backend SSH (viết sau khi hermes chuyển yêu cầu của anh Tâm; cùng cơ chế sao chép và đồng bộ ngược)

Mã: `src/exec_backend/{ssh,ssh_run,tar,proc}.rs`; test: `ssh_tests.rs` (ssh giả bằng `sh`, chạy lệnh "từ xa" ngay trên máy, không mạng), `tar_tests.rs`. Không thêm crate (không crate SSH, không crate tar; `proc.rs` dùng chung với Docker).

**Cấu hình** (`SshConfig`, cấp người dùng, không nằm trong repo): đường dẫn tuyệt đối của `ssh`; `host` (chữ, số, dấu chấm, gạch ngang; không bắt đầu bằng gạch ngang); `port`; `user`; `key_path` tuyệt đối (chỉ đường dẫn, Yana không đọc khóa; tệp phải là tệp thường, không đọc được bởi người khác: kiểm trước khi gọi); `host_key` dạng `<kiểu> <base64>` đúng hai từ; `remote_base` tuyệt đối từ hai cấp trở lên (ví dụ `/home/me/yana-work`), chỉ chữ, số và `. _ - /`, không `..`, không `~`, không dấu `/` cuối; giới hạn `wall` 1 đến 600 giây, `transfer_wall` 10 đến 900 giây, đầu ra 1 KiB đến 1 MiB; giới hạn sao chép như Docker. Chưa có tệp cấu hình `backends.json` và chưa nối vào `run_command`.

**Mỗi lần gọi ssh** (`ssh_options`, hàm thuần, test từng chuỗi): `-F /dev/null` (bỏ qua `~/.ssh/config`, nơi có `ProxyCommand`, `LocalCommand`), `-T -x -a -q`, `BatchMode=yes`, `PasswordAuthentication=no`, `PreferredAuthentications=publickey`, `IdentitiesOnly=yes`, `IdentityAgent=none`, `ForwardAgent=no`, `ForwardX11=no`, `ClearAllForwardings=yes`, `StrictHostKeyChecking=yes`, `GlobalKnownHostsFile=/dev/null`, `UserKnownHostsFile=<tệp của lần chạy>`, `VerifyHostKeyDNS=no`, `ProxyCommand=none`, `ControlMaster=no`, `ControlPath=none`, `PermitLocalCommand=no`, `RequestTTY=no`, hạn kết nối 10 giây, `-i <khóa> -p <cổng>`. **Khóa host được ghim:** tệp known-hosts của lần chạy (thư mục 0700 riêng, xóa sau khi chạy) chỉ có một dòng `host <khóa>` (hoặc `[host]:cổng <khóa>`); khóa host khác thì ssh dừng. Không TOFU, không `accept-new`, không mật khẩu, không agent, không chuyển tiếp. Client `ssh` chỉ nhận `PATH` đã lọc mục trong repo; biến môi trường không được chuyển sang máy xa.

**Các bước (`ssh_run`).** (1) Sao chép riêng như Docker (cùng danh sách loại: `.git`, `.yana-ai`, tên bí mật, liên kết, hard link, tệp đặc biệt, vendored). (2) Gửi: `ssh ... 'umask 077 && mkdir -p DIR && tar -xf - -C DIR'` với luồng tar do **bộ ghi USTAR của Yana** tạo (chỉ tệp thường, tên tối đa 255 ký tự). `DIR` là `remote_base/<16 hex ngẫu nhiên>`. (3) Chạy: `cd DIR && exec env 'YANA_AGENT_CHILD=1' sh -c '<dùng timeout nếu có>' <wall> <argv>`; mỗi phần tử argv được trích dẫn dạng `'...'` (shell đăng nhập từ xa phải tương thích POSIX: sh, bash, zsh); hạn cục bộ là `wall` cộng 5 giây, nên `timeout` ở máy xa báo trước; mã 124 hoặc hết hạn cục bộ là "hết hạn". Mã 255 của ssh (không kết nối, sai khóa, khóa host đổi) là **lỗi**, không phải kết quả của lệnh. (4) Nhận: `ssh ... 'cd DIR && tar --format=ustar -cf - .'` vào bộ nhớ (trần: `max_bytes` cộng 2048 byte mỗi tệp tối đa cộng 1 MiB), rồi **bộ đọc tar nghiêm ngặt** giải vào một thư mục riêng khác, rồi `sync_back` có cùng kiểm tra như Docker. (5) Luôn: `ssh ... 'rm -rf DIR'` (DIR chỉ có dạng đã kiểm), và xóa bản sao cục bộ.

**Bộ đọc tar (dữ liệu từ máy khác, không tin).** Nhận tệp thường và thư mục; liên kết, hard link, thiết bị, fifo chỉ được đếm, không bao giờ được tạo; từ chối tiêu đề mở rộng hoặc GNU (`x g L K S`) và mọi loại lạ; từ chối tên tuyệt đối, có `.` hoặc `..`, `//`, ký tự điều khiển, `\`, không UTF-8; từ chối cỡ dạng base-256; kiểm tổng kiểm (checksum); **thiếu hai khối 0 kết thúc, hoặc cụt giữa chừng, là lỗi** (không nhận một phần); trần số tệp (nhân 2 cho số mục), tổng byte, cỡ khai báo kiểm **trước** khi đọc dữ liệu; cùng một đường dẫn hai lần là lỗi; tệp tạo bằng `create_new`, quyền chỉ `& 0o755`.

**Mất kết quả khi lỗi.** Lỗi khi nhận hoặc đưa về không làm mất kết quả lệnh: trả `ExecOutput` kèm ghi chú "changes were not copied back".

**Còn lại, ghi nhận.** (a) Tiến trình con trên máy xa có thể còn chạy sau khi hết hạn nếu máy xa không có `timeout` (ssh không cấp pty, nên không có SIGHUP): hộp duyệt nói điều này; thư mục từ xa vẫn bị xóa. (b) Lệnh có thể làm gì tùy ý với tài khoản từ xa và mạng của máy đó; đó là điều người dùng chọn khi duyệt, hộp duyệt nói rõ. (c) Kết quả nhận nằm trong bộ nhớ (đến cỡ trần). (d) Chưa chạy ssh hay máy chủ thật; `ssh` giả chạy lệnh cục bộ, nên chưa kiểm chứng: tùy chọn bị OpenSSH cũ từ chối (`PreferredAuthentications`, `VerifyHostKeyDNS`, `IdentityAgent` cần OpenSSH 7.x trở lên), `tar --format=ustar` trên máy xa không phải GNU/bsdtar, khóa host có chứng chỉ. (e) Yana không đọc `known_hosts` của người dùng; muốn ghim khóa phải đưa vào cấu hình (nhập tay hoặc lấy từ một lần `ssh-keyscan` có người kiểm dấu vân tay). (f) Biến môi trường chưa được chuyển (cần thiết kế riêng). (g) Các điểm còn mở của §16 áp dụng nguyên cho SSH (danh sách tên bí mật, không có trần đĩa ngoài giới hạn sao chép, `sync_back` dùng `O_NOFOLLOW` ở thành phần cuối).

## 18. Sửa sau review của E2 (security-auditor, đọc mã, chưa chạy ssh thật; không có lỗi Safety chặn gộp)

Đã sửa: (F1) **trích dẫn lệnh từ xa tự viết**: chỉ `[A-Za-z0-9_@%+:,./-]` để trần, mọi thứ khác (cả `{ } ! ^ ~ =`) nằm trong `'...'` với `'\''`, nên bash và zsh không mở rộng ngoặc nhọn; có test chạy bằng bash thật. (F2/F3) bộ đọc tar kiểm độ sâu và số thư mục tạo ra (trần chung với `max_files`), **bỏ qua** (đọc rồi bỏ, không ghi, không tính trần) mọi mục thuộc `.git`, `.yana-ai`, tên bí mật, thư mục vendored; ghi chú nói có bao nhiêu mục bị bỏ qua. (F4) trần stderr riêng nhỏ (4 KiB) cho các lần truyền và không sao chép bộ đệm khi lấy kết quả. (F5) ssh bị tín hiệu giết (không mã thoát, không hết hạn) là lỗi, không copy-back. (F7) dọn thư mục từ xa kiểm kết quả và ghi chú nếu thất bại; script `chmod -R u+rwX` trước `rm -rf`. (F8) `mkdir -p BASE && mkdir DIR` (DIR phải mới). (F9) `tar -C DIR` thay vì `cd DIR && tar`. (F11) `key_path` và đường dẫn known-hosts không được có khoảng trắng, nháy, `\`, `%`. (F12) feeder bị panic là lỗi. (F13) từ chối byte sau NUL trong tên và tiêu đề không có dấu `ustar`. (F15) dòng stderr từ xa trong lỗi: ký tự điều khiển thành `?`. Tên host được ghim ở dạng chữ thường.

Còn lại, ghi nhận: (F6) `timeout` không có `-k` (không ép SIGKILL): lệnh bắt SIGTERM có thể sống sau khi `rm -rf DIR` chạy; (F9b) `env`/`sh`/`timeout` được tìm theo `PATH` của máy xa khi thư mục hiện tại là thư mục chạy: một `PATH` có `.` hoặc mục rỗng trên máy xa có thể chạy tệp cùng tên trong dự án đã gửi; dùng tài khoản có `PATH` sạch; (F10) kiểm khóa riêng là kiểm sớm cho tiện, ssh tự kiểm lại và có khe TOCTOU với người dùng cục bộ khác; (F14) lệnh có thể tự thoát bằng 124 hoặc 255 để làm mất kết quả của chính nó; (F16) Windows: `clean_name` chưa chặn `C:foo` (chỉ Unix được hỗ trợ); (F17) shell khởi động của máy xa in ra stdout (từ `.bashrc`) làm hỏng luồng tar (lỗi checksum, không copy-back); (F8b) `remote_base` phải chỉ thuộc tài khoản này, không nằm trong thư mục người khác ghi được (như `/tmp`); bộ nhớ khi nhận đạt khoảng `room` (cỡ trần cộng phần đệm), không phải bội số.
