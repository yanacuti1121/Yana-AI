# Hợp đồng WS4: trạng thái và bộ nhớ

Trạng thái: **DỰ THẢO, chờ anh Tâm duyệt.** Chưa có dòng code nào theo hợp đồng này, chưa thêm crate nào.
Nhánh `ws4/state`, từ commit `281f1bfb`. Phạm vi: `src/memory/`, `src/session_context.rs`, `src/workspace/` (chỉ phần lưu trạng thái), module mới `src/session_db/`, và test tương ứng. Việc nào cần đụng chỗ khác được ghi ở mục 10 để anh quyết, không tự sửa.

## 1. Hiện trạng đã đo (đọc mã, không suy đoán)

| Điều | Thực tế | Nơi |
|---|---|---|
| Lịch sử chat | Mỗi phiên hai file: `<cwd>/.yana-ai/chat-history/<id>.jsonl` (từng lượt) và `<id>.meta.json`. Thư mục lấy từ `std::env::current_dir()` bên trong hàm, không phải tham số | `src/chat/history.rs:86-101` |
| Tìm kiếm phiên | Không có. Chỉ `list_recent_sessions` (đọc từng file, lấy 60 ký tự đầu của tin nhắn đầu) | `history.rs:457-490` |
| Sửa phiên hỏng | Chỉ một việc: `repair_dangling_tool_call` (lượt gọi công cụ bị bỏ dở do tiến trình chết) | `src/chat/history/repair.rs` |
| Bộ nhớ dài hạn (L3) | `.yana-ai/l3.jsonl`, mỗi dòng một `L3Fact` (key, value, tags, scope, confidence...). Đọc cả file mỗi lần, xếp hạng trong bộ nhớ bằng `rank_facts`. Đường dẫn cũng lấy từ `current_dir()` | `src/memory/mod.rs:26-56`, `pack.rs` |
| Sự kiện workspace | `.yana-ai/workspace/events/`, một `EventStore` (trait) với bản cài đặt file | `src/workspace/store.rs` |
| `SessionContext` | Struct nhỏ (id, repo_root, provider, model, sandboxed), không khóa API, không singleton | `src/session_context.rs` |
| Cơ sở dữ liệu nhúng | **Không có.** Không có `rusqlite`, `redb` hay tương tự trong `Cargo.toml` | `Cargo.toml` |
| Crate sẵn có dùng được | `serde`, `serde_json`, `regex`, `uuid`, `chrono`, `sha2`, `libc`, `tempfile` (dev) | `Cargo.toml` |
| Khóa giữa các tiến trình | Đã có module `flock_v1` (Unix `flock(2)`, Windows share-mode; tự nhả khi tiến trình chết), dùng ở `runtime/pending_approval.rs` và `capability/lease.rs`. Lưu ý: nó đặt khóa dưới `<project_root>/.claude/state/locks` và đòi có tệp giao thức `.claude/state/locking-protocol-version` | `src/flock_v1.rs:22-35`, `227` |
| Khái niệm "profile" | Không có. Toàn bộ trạng thái nằm trong `<thư mục làm việc>/.yana-ai/`, tức theo dự án, không theo người dùng hay tác tử | |
| Trạng thái ghi thẳng vào `~/.yana*` | Không thấy nơi nào | grep `YANA_HOME`, `.yana`, `home_dir` |

Hệ quả thiết kế: (1) mọi thư mục lưu phải nhận từ **tham số**, không đọc `current_dir()` bên trong hàm, vì đó chính là thứ làm test cô lập khó; (2) phải giữ đọc được dữ liệu cũ (`chat-history/*.jsonl`, `l3.jsonl`) mà không xóa hay ghi đè chúng.

## 2. Bài học từ hermes (chỉ đọc, viết lại theo hành vi)

Đã đọc: `hermes_state_common.py` (lược đồ), `hermes_state_schema.py`, `website/docs/user-guide/profiles.md`, `checkpoints-and-rollback.md`, `session-storage-recovery.md`.

- Hermes lưu phiên trong SQLite (`state.db`), lược đồ hiện ở **phiên bản 31**, bảng `sessions` có hơn 60 cột (chi phí, nén ngữ cảnh, bàn giao, ghim...), FTS5 kèm bản CJK, và khoảng 30 file `hermes_state_*.py` chỉ để xử lý khóa, WAL, sửa chữa, di chuyển. Tài liệu `session-storage-recovery.md` tồn tại vì cơ sở dữ liệu có lúc hỏng hoặc bị khóa.
- **Yana nên làm ngược lại:** bắt đầu với lược đồ nhỏ (khoảng 12 cột cho phiên, 9 cho tin nhắn), di chuyển có phiên bản từ ngày đầu, thêm cột khi thật sự cần. Không sao chép bảng của hermes.
- Hồ sơ (profile) của hermes là **một thư mục nhà riêng cho mỗi tác tử**, và họ cảnh báo rõ: đừng để hai tiến trình tác tử ghi chung một profile. Ta lấy ý này.
- Điểm kiểm tra (checkpoint) của hermes dùng **một kho git bóng** ngoài dự án ("real project `.git` is never touched"), chụp trước mỗi thao tác phá hủy, tối đa một lần mỗi thư mục mỗi lượt, có dọn dẹp và giới hạn dung lượng. Ta lấy ý này, chỉ dùng công cụ `git` có sẵn.

## 3. Nguyên tắc chung

1. **Thư mục lưu là tham số.** Mọi kiểu ở mục 5, 6, 7 nhận `StateRoot` (một đường dẫn đã xác định) khi tạo. Không hàm nào đọc `current_dir()` hay biến môi trường bên trong. Nơi gọi (chat, headless) mới là nơi quyết định.
2. **Không lưu khóa API.** Không trường nào của phiên, tin nhắn hay bộ nhớ chứa khóa. Nội dung tin nhắn đi qua bước che chuỗi giống khóa trước khi lưu vào **chỉ mục tìm kiếm** (nội dung gốc giữ như người dùng đã nhập, vì đó là dữ liệu của họ). Xem câu hỏi 6, mục 10.
3. **Cô lập theo profile ở mức thư mục** (mục 8), không bằng cột lọc. Hai profile không thể thấy dữ liệu của nhau vì chúng không cùng mở một tệp.
4. **Nguồn sự thật cũ vẫn đọc được.** Trình nhập (mục 9) đọc `chat-history/*.jsonl` và `l3.jsonl`, chạy lại nhiều lần không sinh bản trùng, không xóa nguồn.
5. **Kiểu lưu trữ thay được.** Hợp đồng định nghĩa trait; lựa chọn công nghệ (mục 4) chỉ quyết định bản cài đặt.
6. **Test không chạm nhà thật.** Mọi test dùng thư mục tạm; có test khẳng định không tạo tệp nào ngoài thư mục tạm.

## 4. Lựa chọn lưu trữ (việc S1): cần anh Tâm duyệt theo rule 44

Không thêm crate nào cho tới khi anh chọn. Ba phương án, số phiên bản do phiên hermes-agent-57 báo từ chỉ mục crates.io; **em chưa kiểm chứng** lượt tải, CVE, ngày phát hành (không có mạng ra ngoài chỉ mục, và quy tắc egress không cho tra cứu).

| | (a) `rusqlite` + SQLite bundled | (b) `redb` | (c) JSONL nối thêm + chỉ mục tự làm |
|---|---|---|---|
| Giấy phép | MIT (báo cáo, chưa kiểm chứng) | MIT hoặc Apache-2.0 (báo cáo) | không có phụ thuộc mới |
| Phiên bản | 0.40.2 (báo cáo) | 4.3.0 (báo cáo) | không áp dụng |
| Tìm kiếm toàn văn | Có sẵn (FTS5, bật khi biên dịch bundled; **cần kiểm chứng** khi cài) | Không. Phải tự làm chỉ mục ngược | Phải tự làm chỉ mục ngược |
| Giao dịch, phục hồi sập nguồn | Có (WAL, giao dịch). Hermes cho thấy vẫn phải chuẩn bị xử lý khóa và hỏng tệp | Có (sao chép khi ghi, an toàn khi sập) | Nối thêm từng dòng; dòng cuối bị cụt thì cắt bỏ được. Không có giao dịch qua nhiều tệp |
| Nhiều tiến trình cùng mở | Có (khóa kiểu SQLite, `busy_timeout`) | **Cần kiểm chứng:** theo em hiểu, một tiến trình giữ khóa độc quyền lên tệp. Yana chạy TUI cùng `chat-headless` do Desktop gọi từng lượt, nên đây có thể là điểm chết | Cần khóa (module `flock_v1` có sẵn, chạy cả Unix và Windows) |
| Di chuyển lược đồ | `PRAGMA user_version` + các bước có số thứ tự | Tự làm | Có sẵn `schema_version` trên từng dòng (`HistoryLine`) |
| Chuỗi cung ứng | Thêm `rusqlite` và `libsqlite3-sys` (mã C, cần trình biên dịch C trên máy build; CI đã build Windows, Linux, macOS) | Thuần Rust, một crate chính | Không thêm gì |
| Thời gian build | Biên dịch SQLite một lần, thêm vài chục giây trên máy đang quá tải | Nhẹ | Không đổi |
| Kích thước tệp thực thi | Tăng khoảng một đến hai MB (ước lượng, chưa đo) | Tăng ít | Không đổi |
| Tìm tiếng Việt có dấu | FTS5 có tokenizer bỏ dấu, dùng được ngay (cần kiểm chứng) | Tự viết | Tự viết (chuẩn hóa Unicode, bỏ dấu) |
| Công sức tự viết | Nhỏ | Trung bình đến lớn (chỉ mục ngược, xếp hạng) | Lớn (chỉ mục ngược, khóa, nén dọn) |

**Đề xuất của em: (a) `rusqlite` với `bundled`.** Lý do: phần khó nhất của S1 là tìm kiếm toàn văn, giao dịch và nhiều tiến trình cùng mở, và SQLite đã giải sẵn cả ba. Phương án (c) an toàn nhất về chuỗi cung ứng nhưng ta phải tự viết đúng những thứ hermes phải viết rất nhiều mã để làm cho vững. Phương án (b) có thể vướng chuyện khóa độc quyền giữa các tiến trình và vẫn thiếu tìm kiếm.

Điều kiện đi kèm nếu anh chọn (a): (1) kiểm tra thủ công theo rule 44 trước khi thêm (lượt tải, CVE, tác giả, chứng nhận) vì em không tự kiểm được; (2) khóa phiên bản chính xác trong `Cargo.lock`; (3) đặt sau một feature Cargo riêng để bản dựng không cần SQLite vẫn chạy được; (4) bản cài đặt nằm sau trait `SessionStore` nên đổi sang (c) sau này chỉ thay một file.

**Nếu anh muốn không thêm crate:** chọn (c). Hợp đồng này vẫn đúng, chỉ có bản cài đặt và ước lượng công sức ở mục 11 đổi.

## 5. Phiên và tin nhắn (việc S1, S2)

Mô hình logic, không phụ thuộc công nghệ lưu. Bắt đầu nhỏ, thêm cột qua di chuyển khi cần.

```rust
pub struct SessionRow {
    pub id: String,                  // uuid, cùng giá trị với id phiên chat hiện có
    pub title: String,
    pub provider: String,
    pub model: String,
    pub cwd: Option<String>,
    pub created_at: String,          // RFC 3339, giống history.rs
    pub updated_at: String,
    pub ended_at: Option<String>,    // None = còn mở hoặc bị bỏ dở
    pub end_reason: Option<EndReason>, // Completed | Cancelled | Crashed | Imported
    pub message_count: u32,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,      // từ ChatUsage của WS1
    pub cache_write_tokens: u64,
}

pub struct MessageRow {
    pub id: String,                  // cùng giá trị với HistoryLine.id, dùng làm khóa chống trùng
    pub session_id: String,
    pub seq: u32,                    // thứ tự trong phiên, bắt đầu từ 1, không hở
    pub role: Role,                  // chỉ User hoặc Assistant; KHÔNG có System (giữ tính chất của Role hiện tại)
    pub content: String,
    pub tool_call: Option<String>,   // JSON của ToolCallRecord như hiện nay
    pub tool_result: Option<String>, // JSON của ToolResultRecord
    pub ts: String,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}
```

```rust
pub trait SessionStore {
    fn open(root: &StateRoot) -> Result<Self> where Self: Sized;    // tạo và di chuyển lược đồ nếu cần
    fn schema_version(&self) -> u32;
    fn create_session(&self, row: &SessionRow) -> Result<()>;
    fn append_message(&self, row: &MessageRow) -> Result<()>;       // idempotent theo MessageRow.id
    fn finish_session(&self, id: &str, reason: EndReason) -> Result<()>;
    fn load_messages(&self, session_id: &str) -> Result<Vec<MessageRow>>;
    fn list_recent(&self, limit: usize) -> Result<Vec<SessionRow>>;
    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>>;
    fn integrity_check(&self) -> Result<IntegrityReport>;           // xem mục 5.2
    fn recover(&self) -> Result<RecoveryReport>;                    // xem mục 5.2
}
pub struct SearchHit { pub session_id: String, pub message_id: String, pub seq: u32, pub snippet: String, pub score: f64 }
```

### 5.1 Tìm kiếm (S1)

- Chỉ mục trên `content` của tin nhắn `User` và `Assistant`, và một phần đầu (2 KiB) của kết quả công cụ, để một kết quả `run_command` khổng lồ không làm chỉ mục phình.
- Truy vấn do người dùng nhập được **thoát** trước khi đưa vào bộ máy tìm kiếm (không cho cú pháp đặc biệt của FTS chạy như lệnh), có test với `"`, `*`, `NEAR(`, `:`.
- Tiếng Việt: chuẩn hóa Unicode NFC, và tìm được không phân biệt dấu ("tieng" khớp "tiếng"). Là câu hỏi 4, mục 10.

### 5.2 Phục hồi sau khi tiến trình chết (S2)

Các tình huống cụ thể, mỗi cái có test mô phỏng:

1. **Dòng cuối bị cụt** (tiến trình chết giữa lúc ghi): `recover()` cắt bỏ dòng dở, giữ mọi dòng hoàn chỉnh trước đó, báo lại số dòng đã bỏ.
2. **Phiên còn mở nhưng tiến trình đã chết** (`ended_at` là `None`, không tiến trình nào giữ): `recover()` đặt `end_reason = Crashed` và giữ nguyên nội dung. Nhận biết "không tiến trình nào giữ" bằng khóa của tiến trình đang ghi phiên (dùng lại `flock_v1`, nhả khi tiến trình chết), không bằng thời gian. Chi tiết cần kiểm chứng khi cài: `flock_v1` đặt khóa dưới `<project_root>/.claude/state/locks` và đòi tệp giao thức, nên khi dùng cho thư mục profile em sẽ đặt `project_root` là thư mục profile và tạo tệp giao thức ở đó, hoặc viết một khóa nhỏ theo cùng kỹ thuật. Chọn cách nào sẽ ghi lại vào hợp đồng khi cài đặt.
3. **Lượt gọi công cụ bỏ dở** (có `tool_call` mà không có `tool_result`): dùng đúng hành vi của `repair_dangling_tool_call` hiện có (thêm kết quả lỗi giả để phiên tiếp tục được).
4. **Khoảng hở `seq`** hoặc `message_count` lệch: `integrity_check()` báo, `recover()` tính lại từ tin nhắn.
5. **Tệp lưu trữ hỏng hẳn:** không tự xóa. Chuyển sang `<tên>.corrupt-<thời điểm>`, tạo tệp mới, và **nhập lại từ `chat-history/*.jsonl` nếu còn**. Báo rõ cho người dùng.

`recover()` chạy khi mở, chỉ trên phiên không có tiến trình nào giữ, không bao giờ trên phiên đang được tiến trình khác dùng.

## 6. Bộ nhớ dài hạn (việc S3)

Bọc thứ đang có (`L3Fact`, `l3.jsonl`, `rank_facts`), không viết lại.

```rust
pub trait MemoryProvider {
    fn name(&self) -> &str;
    fn remember(&self, fact: NewFact) -> Result<FactId>;      // ghi hoặc cập nhật theo key
    fn recall(&self, query: &str, limit: usize) -> Result<Vec<RankedFact>>;
    fn forget(&self, id: &FactId) -> Result<bool>;
    fn list(&self, filter: FactFilter) -> Result<Vec<L3Fact>>;
}
```

- Bản cài đặt đầu tiên `LocalMemory` bọc `l3.jsonl` qua `StateRoot` (không còn `current_dir()`), dùng lại `rank_facts`. Hành vi lệnh `yana-rt memory ...` hiện tại không đổi.
- Trait để sau này cắm được bản khác (ví dụ tìm theo vector). Không làm bản thứ hai trong đợt này.
- `remember` từ chối nội dung trông như khóa API hoặc bí mật (dùng cùng bộ che chuỗi giống khóa), và không lưu thông tin người dùng đã gắn mức mật theo rule 68 nếu nơi gọi truyền cờ đó. Là câu hỏi 6, mục 10.

## 7. Điểm kiểm tra và hoàn tác cho thay đổi file của tác tử (việc S4)

Theo cách hermes làm, dùng công cụ `git` có sẵn, không thêm crate:

```rust
pub trait CheckpointStore {
    fn snapshot(&self, label: &str) -> Result<CheckpointId>;      // tối đa một lần mỗi thư mục mỗi lượt do nơi gọi bảo đảm
    fn list(&self) -> Result<Vec<CheckpointInfo>>;
    fn diff(&self, id: &CheckpointId) -> Result<String>;
    fn restore(&self, id: &CheckpointId, scope: RestoreScope) -> Result<RestoreReport>; // Whole | OneFile(path)
    fn prune(&self, policy: PrunePolicy) -> Result<PruneReport>;
}
```

- **Kho git bóng** nằm trong `StateRoot` (`checkpoints/<băm đường dẫn dự án>.git`), dùng `GIT_DIR` và `GIT_WORK_TREE` trỏ vào dự án. **`.git` thật của dự án không bao giờ bị đọc ghi bởi nó.** Có test: chụp và khôi phục xong thì `git status` của dự án thật không có gì lạ.
- Loại trừ: `.git`, `.yana-ai/`, `node_modules`, `target`, và mọi đường dẫn khớp bộ lọc bí mật của repo (`.env*`, `*.pem`, `*.key`). **Điểm kiểm tra không được chứa tệp bí mật.**
- Khôi phục có hai mức: `OneFile` và `Whole`. Không có mức "giữ chỉnh sửa tay" như hermes ở đợt này (là phần thêm sau nếu cần).
- Đường dẫn khôi phục được kiểm tra không thoát ra ngoài thư mục dự án (chống `..`, liên kết mềm).
- Giới hạn dung lượng mặc định và `prune` xóa điểm cũ. Con số cụ thể là câu hỏi 5, mục 10.
- Thiếu `git`: tính năng tắt, báo một dòng rõ ràng, không lỗi.
- **Không móc vào lúc tác tử sửa file trong đợt này.** Chỗ móc nằm ở `src/capability/` (thuộc mảng khác). WS4 chỉ giao thư viện và test; nối vào là bước riêng cần anh duyệt (câu hỏi 3, mục 10).

## 8. Cô lập theo profile (việc S5)

```rust
pub struct ProfileName(String);  // hợp lệ: [a-z0-9_-], dài 1 đến 32, không rỗng; cấm "..", "/", "\", ký tự điều khiển, tên dành riêng
pub struct StateRoot { /* đường dẫn tuyệt đối đã chuẩn hóa */ }
impl StateRoot {
    pub fn for_profile(base: &Path, profile: &ProfileName) -> Result<StateRoot>;  // base/profiles/<profile>/ hoặc quy tắc mục 8.1
    pub fn path(&self, kind: StateKind) -> PathBuf;   // sessions.db, l3.jsonl, checkpoints/, workspace/events/
}
```

- Mỗi profile một thư mục riêng, **không chia sẻ tệp nào**. Đó là cách cô lập, không phải cột lọc `profile`.
- Tên profile được kiểm tra chặt (đường dẫn thoát, tên chứa dấu phân cách, tên trùng thư mục hệ thống). Có test với `../x`, `a/b`, chuỗi rỗng, tên rất dài, ký tự Unicode lạ.
- Hai profile mở cùng `base`: ghi ở A rồi liệt kê, tìm, nhớ ở B không thấy gì của A. Có test cho `SessionStore`, `MemoryProvider` và `CheckpointStore`.
- Cảnh báo của hermes được giữ nguyên: **không để hai tiến trình tác tử ghi chung một profile**. Trình mở lấy khóa độc quyền cho vai "người ghi chính" và báo lỗi rõ khi profile đang bận.

### 8.1 Đặt ở đâu: câu hỏi 2, mục 10

Hiện toàn bộ trạng thái nằm ở `<thư mục làm việc>/.yana-ai/`. Để **không đổi hành vi khi không cấu hình gì**, đề xuất: profile mặc định (`default`) dùng đúng bố cục cũ (`<repo>/.yana-ai/...`), còn profile đặt tên dùng `<repo>/.yana-ai/profiles/<tên>/`. Phương án khác là thư mục nhà người dùng như hermes (`~/.yana/profiles/<tên>/`), nhưng nó đổi nơi lưu cho mọi người dùng nên cần anh quyết.

## 9. Di chuyển và nhập dữ liệu cũ

- `import_chat_history(root, chat_history_dir)`: đọc `*.jsonl` và `*.meta.json`, tạo `SessionRow` (`end_reason = Imported`) và `MessageRow` với `id` giữ nguyên nên chạy lại không sinh bản trùng. Bỏ qua và báo dòng không đọc được, không dừng cả lần nhập.
- `import_l3(root, path)`: đọc `l3.jsonl` vào `LocalMemory`. Nếu `LocalMemory` vẫn ghi cùng tệp thì không cần nhập.
- **Không xóa, không sửa, không di chuyển nguồn.**
- Di chuyển lược đồ: mỗi bước có số thứ tự, chạy trong một giao dịch, có test "mở tệp lược đồ phiên bản N-1 rồi nâng lên N mà dữ liệu còn nguyên". Từ chối mở tệp có phiên bản **mới hơn** bản chương trình hiểu (không hạ cấp ngầm).
- **Chưa đổi đường ghi của chat.** `chat/history.rs` (ngoài phạm vi WS4) vẫn ghi JSONL như cũ. WS4 giao thư viện, trình nhập và test; việc cho chat ghi qua `SessionStore` là bước nối riêng (câu hỏi 3, mục 10), giống cách WS1 đã làm.

## 10. Điều cần anh Tâm quyết trước khi cài đặt

1. **Lưu trữ:** (a) `rusqlite` bundled (em đề xuất), (b) `redb`, hay (c) không thêm crate? Nếu chọn (a) hoặc (b), anh (hoặc em, với sự đồng ý của anh) phải chạy kiểm tra rule 44 thủ công vì em không tra được lượt tải và CVE.
2. **Vị trí profile:** mặc định giữ `<repo>/.yana-ai/` như cũ và profile đặt tên nằm dưới `.yana-ai/profiles/<tên>/` (em đề xuất), hay chuyển sang thư mục nhà người dùng?
3. **Phạm vi nối vào ứng dụng:** WS4 đợt này chỉ giao thư viện, trình nhập, test. Sau khi anh duyệt, anh có mở thêm `src/chat/history.rs` (để chat ghi qua `SessionStore`) và chỗ móc điểm kiểm tra ở `src/capability/` không? Nếu chưa thì các tính năng S1 đến S4 chưa đến tay người dùng.
4. **Tìm kiếm tiếng Việt:** chuẩn hóa NFC và tìm không phân biệt dấu có phải mặc định không? Có cần tìm theo cụm gần đúng (từ sai chính tả) không, hay chỉ khớp từ?
5. **Dung lượng và lưu giữ:** trần dung lượng kho điểm kiểm tra (đề xuất 500 MB mỗi profile), số điểm tối đa mỗi dự án (đề xuất 50), có tự xóa phiên cũ không (đề xuất **không**, chỉ có lệnh xóa thủ công).
6. **Bí mật trong bộ nhớ và chỉ mục:** dùng lại bộ che chuỗi giống khóa của WS1 (`provider_error::sanitize_detail`, nằm ở `src/model/` của nhánh khác) hay viết bộ che riêng? Dùng lại nghĩa là phụ thuộc nhánh `ws1/provider`, nên em đề xuất tách bộ che thành một hàm nhỏ dùng chung khi cả hai nhánh đã gộp, và ở WS4 tạm dùng bản riêng có test.

## 11. Kế hoạch cài đặt sau khi duyệt (theo thứ tự)

| Bước | Việc | Phụ thuộc |
|---|---|---|
| 0 | `StateRoot`, `ProfileName` (mục 8), chưa cần lưu trữ. Test cô lập và kiểm tra tên | Duyệt hợp đồng |
| 1 | `SessionStore` bản đầu theo lựa chọn ở mục 4, di chuyển có phiên bản, tìm kiếm | Câu hỏi 1, 2 |
| 2 | Trình nhập `chat-history`, `recover()` và các tình huống mục 5.2 | Bước 1 |
| 3 | `MemoryProvider` + `LocalMemory` bọc `l3.jsonl` | Bước 0 |
| 4 | `CheckpointStore` bằng kho git bóng | Bước 0 |
| 5 | Kiểm thử cô lập hai profile xuyên cả ba kho | Bước 1, 3, 4 |

Mỗi bước: viết test thất bại trước, cài đặt, `cargo test --features cli --bin yana-rt`, commit riêng, chạy lặp 10 lần ở lần chốt (giữ tải thấp: `CARGO_BUILD_JOBS=2`, `nice -n 10`, tuần tự).

Ước lượng công sức (chưa đo): (a) khoảng bằng một đợt như WS1 P1 đến P3 cộng thêm phần nhập và phục hồi; (c) lớn hơn rõ rệt vì tự viết chỉ mục và khóa.

## 12. Kế hoạch kiểm thử

- Không chạm nhà thật: mọi test dùng `tempfile::tempdir()`. Có test kiểm tra không tạo tệp nào ngoài thư mục tạm (so sánh danh sách thư mục trước và sau ở nơi được phép).
- Không đặt biến môi trường toàn cục trong test; cấu hình đi qua tham số.
- S1: di chuyển N-1 lên N giữ dữ liệu; từ chối phiên bản mới hơn; tìm thấy đúng và không có kết quả sai; truy vấn có ký tự đặc biệt không làm lỗi; tìm không phân biệt dấu (nếu duyệt).
- S2: năm tình huống ở mục 5.2, mỗi cái mô phỏng bằng cách viết dở tệp rồi mở lại, cộng với một test ghi từ hai luồng cùng lúc.
- S3: hành vi `yana-rt memory ...` hiện tại không đổi (so sánh đầu ra trước sau); `remember` từ chối chuỗi giống khóa.
- S4: chụp, sửa file, khôi phục một file và cả dự án; `.git` thật của dự án bất biến; tệp bí mật không có trong kho; đường dẫn khôi phục thoát ngoài bị từ chối; thiếu `git` thì tắt êm.
- S5: hai profile không thấy dữ liệu của nhau qua cả ba kho; tên profile độc hại bị từ chối; hai tiến trình cùng mở một profile thì tiến trình sau nhận lỗi rõ ràng.
- Tiêu chí nộp mỗi bước: xanh, chạy lặp 10 lần, kèm log thật.

## 13. Ngoài phạm vi (ghi để khỏi hiểu nhầm)

- Không nén ngữ cảnh, không đếm token, không đồng bộ giữa máy.
- Không mã hóa dữ liệu lưu (nếu cần là việc riêng, xem rule 52).
- Không sửa `src/chat/history.rs`, `src/capability/`, `src/runtime/` trong đợt này.
- Không có giao diện người dùng cho tìm kiếm phiên hay `/rollback`.

## 14. Ghi chú cài đặt (2026-09-30)

Ba bước không cần crate đã cài: bước 0 (`profile.rs`), bước 3 (`memory/provider.rs`), bước 4 (`session_db/checkpoint.rs`). Bước 1 và 2 (SessionDB, phục hồi phiên) vẫn chờ anh Tâm chốt lưu trữ ở mục 4.

### 14.1 Bước 3: `MemoryProvider` và `LocalMemory`

- `LocalMemory::open(&StateRoot)` (kiểm tra thư mục qua `ensure_dir`) hoặc `LocalMemory::at(path)`. Đọc và ghi cùng định dạng `l3.jsonl` với các lệnh `yana-rt memory ...`; mã của các lệnh đó **không bị sửa**.
- Khác với CLI: mỗi lần ghi viết lại cả tệp qua tệp tạm rồi đổi tên (không bao giờ để lại tệp ghi dở). Đổi lại, hai tiến trình cùng sửa một khóa một lúc vẫn có thể mất một bản cập nhật, giống CLI. Dòng không đọc được được **giữ nguyên** khi viết lại, không bị bỏ.
- `forget(id)` nhận id đầy đủ hoặc tiền tố duy nhất từ 8 ký tự trở lên; tiền tố ngắn hơn hoặc mơ hồ thì không xóa gì.
- `remember` từ chối (kèm lý do): (a) chuỗi giống khóa API hoặc bí mật (`memory/guard.rs`, bộ kiểm tra riêng của WS4: tiền tố `sk-`, `AIza`, `gsk_`, `xai-`, `hf_`, `ghp_`, `github_pat_`, `AKIA` từ 16 ký tự, khối khóa riêng, và token dài sau chữ `Bearer`), (b) ngữ cảnh rule 68 mức mật hoặc tối mật, dùng lại `route::classify_sensitivity` mà `checkpoint_fact` vốn đã dùng. Kiểm tra khóa, giá trị và cả thẻ.
- Chưa có: bản `MemoryProvider` thứ hai (ví dụ tìm theo vector); nối `LocalMemory` vào các lệnh CLI.

### 14.2 Bước 4: điểm kiểm tra

Khác hoặc chi tiết hơn so với mục 7:

- **Khôi phục không dùng lệnh git nào ghi vào cây làm việc** (không `checkout`, `reset`, `clean`). Đọc nội dung từng tệp từ kho bóng bằng `cat-file` rồi tự ghi, sau khi kiểm tra đường dẫn (tương đối, không `.`, `..`, đoạn rỗng, ký tự ổ đĩa; tổ tiên tồn tại sâu nhất được giải liên kết phải nằm trong dự án, kiểm tra **trước** khi tạo thư mục; đích không được là liên kết hay thư mục). Ghi qua tệp tạm rồi đổi tên; giữ bit thực thi.
- **Mỗi lần khôi phục tự chụp một điểm "before restore" trước**, nên khôi phục hoàn tác được bằng chính điểm đó.
- **Khôi phục không bao giờ xóa tệp.** Tệp tạo sau lúc chụp vẫn còn. Liên kết mềm và kho lồng trong điểm kiểm tra bị bỏ qua (báo trong `skipped`), không được tạo lại.
- Khôi phục một tệp mà vi phạm an toàn hay không có trong điểm kiểm tra trả lỗi; khôi phục cả dự án thì tệp có vấn đề vào `skipped`, phần còn lại vẫn được khôi phục.
- **Chạy `git` cách ly** (`checkpoint/git.rs`): xóa các biến `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_NAMESPACE` thừa hưởng từ môi trường; luôn truyền `--git-dir` (và `--work-tree` khi cần đọc dự án) bằng cờ tường minh; `GIT_CONFIG_GLOBAL` trỏ null, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, tắt hook, tắt ký commit. Có test kiểm tra các điều này và một test đọc mã nguồn khẳng định không có `reset`, `clean`, `checkout`, `restore`, `rm`, `stash`, `push`, `fetch`, `clone` trong mã điểm kiểm tra.
- **`.git` của dự án không bị đụng:** có test chụp dấu vân tay từng byte của `.git` (HEAD, index, refs, đối tượng, cấu hình) trước và sau khi chụp, xem khác biệt, khôi phục và dọn: giống hệt nhau.
- Kho bóng nằm ở `<StateRoot>/checkpoints/<16 ký tự đầu của sha256(đường dẫn dự án)>.git`. Danh sách loại trừ: `.git`, `.yana-ai/`, `node_modules/`, `target/`, `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `*.kdbx`, `id_rsa`, `id_ed25519`, `.npmrc`, `.netrc`, `.ssh/`, `.aws/`. Danh sách này hẹp hơn mẫu `*token*`, `*secret*` của rule 03 (mẫu đó dùng để chặn **ghi**, còn ở đây nó sẽ loại cả tệp mã nguồn như `token_budget.rs`).
- Chụp không đổi thì trả lại điểm mới nhất, không sinh bản trùng. `prune` giữ tối đa `max_points` (mặc định 50) điểm mới nhất rồi đến trần dung lượng (mặc định 500 MB), luôn giữ lại điểm mới nhất, chỉ dọn kho bóng.
- `git` không chạy được: mọi thao tác trả `GitMissing` (một dòng rõ ràng), không lỗi khác. Thư mục gốc hệ thống (`/`) bị từ chối làm dự án.
- **Giới hạn đã biết:** chưa có trần kích thước từng tệp (`git add -A` đọc mọi thứ không bị loại trừ, dự án rất lớn sẽ chậm); chưa có chỗ nào gọi `snapshot` khi tác tử sửa tệp (thuộc `src/capability/`, chờ anh duyệt); test liên kết mềm chỉ chạy trên Unix và phần chuẩn bị của test dùng `/dev/null` nên **chưa chạy thử trên Windows**; lệnh `/rollback` và giao diện chưa có.
