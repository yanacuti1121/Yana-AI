# Hợp đồng WS6: backend chạy lệnh (Docker, SSH)

Trạng thái: **Planned** (đề xuất, chờ anh Tâm duyệt; chưa có mã). Nhánh `ws6/exec-backends`, gốc là `ws3/tools` (đã chứa `program_path`, `visible_line`, tách `lsp`). Phạm vi file: `src/exec_backend/` (mới), `src/capability/command*` (chỉ phần chọn backend), `src/os/` (phần môi trường), `tests/`. Không sửa `src/runtime/`, `src/guard`, `core/`; chỗ nào cần sửa ngoài đó thì ghi ở mục 10 và báo.

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
