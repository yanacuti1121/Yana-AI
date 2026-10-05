# Hợp đồng WS2: runtime agent (vòng lặp, subagent, cron)

Trạng thái: **DỰ THẢO, chờ anh Tâm duyệt.** Chưa có dòng mã nào theo hợp đồng này và chưa thêm crate nào. Nhánh `ws2/runtime`, gốc `origin/main` (`5238cfa5`, sau #428). Người viết: yana-ai-b8 (đã làm WS3 và WS6). Phạm vi file theo brief: `src/runtime/`, `src/mission/`, `src/os/supervisor*`, module mới (đề xuất `src/agent_loop/`, `src/subagent/`, `src/cron/`), `tests/`. Mọi việc cần sửa ngoài đó được gom ở mục 9 để duyệt một lượt.

## 1. Hiện trạng (đã đọc mã trên `origin/main`, chưa chạy gì mới)

| Điều | Thực tế | Nơi |
|---|---|---|
| Vòng lặp một lượt | `TurnEngine::run` đã lặp "gọi mô hình, nếu có lời gọi công cụ thì chạy rồi gọi lại" tối đa **8 vòng công cụ** (`DEFAULT_MAX_TOOL_ROUNDS`). Mỗi vòng **chỉ một** lời gọi công cụ (nhiều hơn là lỗi `MultipleToolCallsUnsupported`). Chạy **đồng bộ** trên luồng gọi, truyền sự kiện qua closure `emit` | `src/runtime/controller.rs` |
| Kết quả một lượt | `Completed`, `AwaitingApproval` (đã lưu được để duyệt rồi `resume_turn`), `Cancelled { partial }` | `outcome.rs`, `pending_approval.rs` |
| Hủy | `CancellationToken` là một cờ `AtomicBool`, kiểm ở đầu vòng, trong lúc stream chunk, và ngay trước khi chạy công cụ. **Không có quan hệ cha con** | `controller.rs:16-30` |
| Giới hạn | Chỉ số vòng công cụ. **Không có trần token, thời gian, hay chi phí cho một lượt.** `cost::track_from_payload` chỉ ghi số liệu sau khi lượt xong | `controller.rs`, `chat/tui/turn.rs:252` |
| Quyền | `YanaAuthorityChain`: mọi công cụ phải có capability trong registry; capability `HumanApprovalPerCall` khi `human_initiated == false` bị **từ chối**, trừ khi có **lease** khớp (chủ thể = `agent_id`, capability, phạm vi, hạn, ngân sách). `TurnContext.intent` chỉ **thu hẹp** (`narrow_by_intent`), không mở rộng | `authority.rs:188-312` |
| Nguồn gốc lượt | `TurnOrigin` đã có `Scheduler`, `Governor`, `Subagent`; `TurnContext::for_subagent` đặt `origin = Subagent`, `human_initiated = false`, giữ `turn_id` của cha. **Không nơi nào ngoài test dùng chúng** | `origin.rs`, grep |
| Ai tạo `TurnEngine` | `chat/headless.rs:174`, `chat/tui/turn.rs:61`, `remote/mod.rs:144`, `pending_approval.rs:518` | grep |
| Cron | **Không có.** Từ "cron" chỉ xuất hiện ở `src/guard/mod.rs`. `os/supervisor*` là sổ an toàn và quan sát tiến trình (HALT, quarantine, sức khỏe), không phải bộ lập lịch | grep, `supervisor.rs` đầu tệp |
| Subagent | Chưa có chạy thật. `mission` lập đồ thị tác vụ có phụ thuộc và in "brief" JSON cho Yana phân phối (`dispatch --max-parallel`, mặc định 3); `os::agent` có sổ `ManagedAgent` (đăng ký, heartbeat, trạng thái). Không bên nào chạy một lượt mô hình | `mission/mod.rs`, `os/agent.rs` |
| Trạng thái (WS4) | `SqliteSessionStore` (feature `session-db`, `rusqlite =0.40.2` bundled): `create_session`, `append_message` (idempotent theo id), `finish_session`, `load_messages`, `search`, `integrity_check`, và **`lock_session(id)`** (khóa `try_lock` của hệ điều hành, tự nhả khi tiến trình chết). `StateRoot` theo profile; không đọc `current_dir()`. Có migration có phiên bản (`PRAGMA user_version`, bước nối thêm, không sửa bước cũ) | `src/session_db/` |
| Khóa chống chạy trùng | Chuẩn của repo: `File::try_lock` của thư viện chuẩn trên tệp khóa (`session_db/store/lock.rs`), và `flock_v1` | các tệp trên |

## 2. Bài học từ hermes (chỉ đọc, viết lại theo hành vi)

Đã đọc: `cron/AGENTS.md`, `website/docs/user-guide/features/{cron,delegation}.md` (đọc phần đầu và các mục bất biến). Không sao chép mã; nhiều bất biến dưới đây là lỗi thật đã được họ sửa.

**Cron (hermes dạy):** (a) bộ lập lịch **dời `next_run_at` TRƯỚC khi chạy** và đánh dấu "slot đang chờ" trong cùng một lần lưu, nên một vụ sập giữa chừng chỉ làm mất tối đa một lần chạy, không bao giờ chạy hai lần; một slot có chủ đã chết được **khôi phục đúng một lần**. (b) Một **sổ thực thi** với khóa duy nhất theo `(job, thời điểm dự kiến)` chặn lần chạy thứ hai của cùng một slot. (c) Cửa sổ **bù lỡ** bằng nửa chu kỳ, kẹp từ 2 phút đến 2 giờ; một lần chạy một-lần được ân hạn 2 phút; **không bỏ slot im lặng**, bỏ thì ghi lý do. (d) **Khóa tick theo từng profile** chặn hai tiến trình cùng tick. (e) Chủ của lần chạy nhận biết bằng **(pid, thời điểm bắt đầu tiến trình)**, không bằng pid trần (pid bị tái sử dụng làm họ giết nhầm tiến trình). (f) **Watchdog theo thời gian nhàn rỗi**, không theo đồng hồ treo tường: một phiên đứng yên bị ngắt, một lần chạy dài nhưng còn hoạt động thì không. (g) Lỗi lớp "giả định một-profile-một-tiến-trình": trạng thái đang chạy phải khóa theo (profile, job). (h) Phiên cron bỏ qua ghi bộ nhớ dài hạn. (i) Phần việc cần sống qua khởi động lại phải là job cron, không phải việc nền trong tiến trình.

**Subagent (hermes dạy):** mặc định **phẳng** (độ sâu 1), lồng nhau là tùy chọn có trần; số lượng đồng thời có trần và vượt trần là **lỗi trả về**, không cắt âm thầm; **hủy đi theo quyền sở hữu** (hủy cha hủy mọi con cháu, mỗi con vẫn trả kết quả `interrupted` kèm phần đã làm); phát hiện đứng yên bằng nhịp tim (tiến độ gọi API, bắt đầu công cụ) với ngưỡng riêng cho đang chờ mô hình và đang trong công cụ; công cụ sinh việc bị chặn với con lá; cảnh báo chi phí nhân lên theo từng cấp (3 cấp x 3 con = 27 lá).

**Khác biệt có chủ ý của Yana:** quyền của con **chỉ giảm** và được chứng minh bằng cấu trúc của `authority` đã có, không bằng cờ cấu hình; mọi con đi qua đúng `YanaAuthorityChain` như cha; không có trạng thái toàn cục theo tiến trình; không có nhánh "kanban".

## 3. Nguyên tắc chung

1. **Bọc, không thay `TurnEngine`.** Vòng lặp agent là lớp nằm trên `TurnEngine::run`: nó thêm hạn mức, lưu trữ, hủy theo cây, tiếp tục; mọi lời gọi công cụ vẫn đi qua `authorize_tool` và `execute_approved_tool` như hôm nay. Không có đường chạy công cụ nào mới.
2. **Quyền là phép giao.** Quyền hiệu lực của một subagent là giao của: quyền hiện tại của cha, `intent` mà cha khai cho con, hạn mức còn lại của cha. Con không bao giờ nhận lease của cha.
3. **Mọi thứ không người ngồi trước đều là `human_initiated = false`** (cron, subagent). Hệ quả có sẵn: không chạy được capability cần duyệt từng lần, trừ khi có lease do người cấp cho đúng chủ thể.
4. **Thư mục lưu là tham số** (như WS4): mọi kiểu nhận `StateRoot`; không đọc `current_dir()` hay biến môi trường bên trong. Test dùng thư mục tạm và **đồng hồ giả** (`Clock` trait), không `sleep` dài.
5. **Kết quả từ con là dữ liệu không tin cậy** (như kết quả MCP): đi qua `capability::untrusted::guard` trước khi mô hình của cha thấy.
6. **Không thêm crate.** `std::thread`, `std::sync`, `chrono`, `uuid`, `serde_json`, `rusqlite` (đã có, sau feature `session-db`). Bộ phân tích lịch tự viết (mục 6.2).
7. **Không `async`.** Giữ mô hình đồng bộ hiện tại; song song bằng luồng hệ điều hành có trần.

## 4. R1: vòng lặp agent

Kiểu mới `AgentRun` (đề xuất `src/agent_loop/`), một lần chạy gồm nhiều lượt trên **một phiên**:

```rust
pub struct RunLimits {
    pub max_tool_rounds: usize,        // mặc định 8 như hiện nay
    pub max_input_tokens: u64,         // tổng cả lần chạy; 0 = không giới hạn (không được dùng cho cron/subagent)
    pub max_output_tokens: u64,
    pub wall: Duration,                // đồng hồ treo tường tổng
    pub idle: Duration,                // watchdog: không có sự kiện nào trong chừng này thì ngắt
}
pub enum RunStatus { Completed, Cancelled, AwaitingApproval(PendingApprovalId), LimitReached(Limit), Failed(String), Crashed }
pub struct RunReport { pub status: RunStatus, pub final_message: String, pub usage: ChatUsage, pub tool_rounds: usize, pub session_id: String }
```

- **Một lượt gồm gì:** (1) lấy khóa phiên (`lock_session`), tạo hoặc mở phiên; (2) thêm tin nhắn người dùng vào phiên (idempotent theo id); (3) gọi `TurnEngine::run` với `RuntimeEvent` đi qua một bộ nghe vừa ghi vào phiên vừa chuyển tiếp cho khách (TUI, headless, WS5); (4) mỗi tin nhắn trợ lý và kết quả công cụ được `append_message` ngay khi xong (nên một vụ sập chỉ mất phần dở); (5) kết thúc bằng `finish_session` với `EndReason`.
- **Streaming:** không đổi, vẫn `RuntimeEvent::TextDelta`; `AgentRun` chỉ thêm sự kiện `RunLimitReached` và `RunPaused`.
- **Dispatch công cụ:** không đổi (một lời gọi mỗi vòng, qua authority). Lời gọi song song là việc sau và cần bản thiết kế riêng vì authority hiện quyết định từng lời gọi một.
- **Hạn mức (khoảng trống hiện nay):** kiểm trước mỗi vòng gọi mô hình bằng `ChatUsage` đã cộng dồn. Chạm trần thì dừng với `LimitReached`, **không** cắt giữa stream. Đây là chỗ cần sửa `controller.rs` (trong phạm vi): thêm `TurnError::BudgetExceeded` và nhận `RunLimits` qua `TurnRequest`.
- **Dừng và hủy:** thêm quan hệ cha con vào `CancellationToken` (token con trả `is_cancelled` đúng khi chính nó **hoặc bất kỳ tổ tiên** bị hủy; hủy con không hủy cha). Đây là cơ sở của hủy cây (mục 5).
- **Tạm dừng chờ duyệt:** dùng nguyên `PendingApprovalStore` và `resume_turn`; `AgentRun` chỉ báo `AwaitingApproval(id)` và nhả khóa phiên. Tiếp tục là một `AgentRun` mới cùng phiên.
- **Sập giữa chừng:** phiên còn mở mà không ai giữ khóa được `recover()` của WS4 đặt `Crashed` khi mở lại; `AgentRun` không tự động chạy lại một lượt dở (cần người hoặc cron quyết).
- **Phụ thuộc:** cần feature `session-db`. Không có feature thì `AgentRun` chạy không lưu (như chat hôm nay) và cron/subagent không có.
- **Test (viết thất bại trước):** nhà cung cấp giả (đã có `MockProvider` trong `runtime/tests.rs`); chạm trần token dừng đúng vòng; hủy giữa stream giữ phần dở; sập sau `append_message` thứ n rồi mở lại thấy đúng n tin; hai `AgentRun` cùng phiên: lần hai nhận `Busy`; không lượt nào vượt `max_tool_rounds`.

## 5. R3: subagent

```rust
pub struct SubagentSpec {
    pub task: String,                  // lời giao việc đầy đủ (con không thấy hội thoại của cha)
    pub context_brief: String,         // do cha viết, có trần 16 KiB
    pub intent: IntentDeclaration,     // capability và phạm vi con được dùng (chỉ thu hẹp)
    pub limits: RunLimits,             // phải <= phần còn lại của cha
    pub role: Role,                    // Leaf (mặc định) | Orchestrator
}
pub enum SubagentStatus { Completed, Failed, Cancelled, TimedOut, BudgetExceeded, NeedsApproval }
pub struct SubagentResult { pub status: SubagentStatus, pub summary: String /* tối đa 8 KiB */, pub usage: ChatUsage, pub tool_rounds: usize, pub child_session_id: String }
```

- **Tạo:** cha gọi một capability mới (đề xuất tên `agent.delegate`, công cụ `delegate_task`). Mỗi con có: `agent_id` mới (`sub:<uuid>`), `TurnContext::for_subagent(agent_id).with_intent(spec.intent)` (nguồn gốc `Subagent`, `human_initiated = false`, `turn_id` của cha, nên mọi quyết định quyền của con truy ngược được về lượt của người), **phiên riêng** (cùng `SessionStore`), `CancellationToken` con của token cha, luồng riêng.
- **Độ sâu (rule `agent-excessive-agency-law`):** gốc có độ sâu 0; con của gốc 1; tối đa **3**. Cái nhìn của em về rule: "max 3 levels" và đoạn mã `[[ depth -gt 3 ]] block` cho phép độ sâu 3; con ở độ sâu 3 là lá và không được sinh tiếp. Cấu hình **mặc định phẳng (tối đa 1)**, nâng lên tối đa 3 phải do người đặt rõ. Kiểm ở hai chỗ: lúc cha gọi `delegate_task` (từ chối trả về lỗi) và lúc dựng con (không tin tham số). Con `Leaf` không có capability `agent.delegate` (lọc ra khỏi catalog công cụ và bị authority từ chối).
- **Quyền chỉ giảm (chứng minh được):** (1) `intent` của con phải là tập con của tập capability còn dùng được của cha (kiểm khi tạo, từ chối nếu lớn hơn); (2) `narrow_by_intent` chỉ thu hẹp (đã có test); (3) lease **không thừa kế**: chủ thể lease là `agent_id` nên con mới không khớp lease nào của cha; (4) `RunLimits` của con bị kẹp bằng phần còn lại của cha và token con tiêu thụ được **trừ vào** cha; (5) capability `HumanApprovalPerCall` bị từ chối cho con (có sẵn trong authority), nên mặc định con chỉ dùng được capability không cần duyệt (đọc). Test: thử tạo con có intent lớn hơn cha, độ sâu 4, giới hạn lớn hơn cha: đều bị từ chối.
- **Duyệt của người cho việc của con:** quyết định cần anh (mục 10, câu 4): (A) **mặc định, từ chối** và trả `NeedsApproval` cho cha (con dừng, cha biết con cần gì); (B) chuyển lời xin duyệt lên phiên gốc để người duyệt rồi tiếp tục con (cần cha chờ hoặc con tiếp tục độc lập). Hợp đồng viết theo (A); (B) là việc sau.
- **Số lượng đồng thời:** trần toàn cục mặc định **3** (khớp `mission dispatch --max-parallel`), trần trên mỗi cha; vượt trần trả **lỗi** cho cha (không cắt âm thầm, không xếp hàng vô hạn). Con chạy trên luồng riêng; cha chờ hoặc thu kết quả theo `delegate_task`.
- **Thu kết quả:** `SubagentResult`; `summary` là lời cuối của con hoặc phần dở nếu bị ngắt, cắt ở 8 KiB, qua `untrusted::guard`; con **không** trả cả hội thoại, chỉ phiên của nó nằm trong DB để người xem.
- **Hủy cây:** hủy token cha là hủy mọi con cháu (mục 4); mỗi con trả `Cancelled` kèm phần dở; cha chỉ trả sau khi **mọi con đã dừng hoặc quá hạn chờ 10 giây**, không để luồng mồ côi (luồng chờ có hạn; con bị đứng trong một lời gọi mô hình thoát khi chunk kế tiếp thấy cờ hủy; công cụ chạy lâu như `run_command` đã có hạn thời gian và nhóm tiến trình ở WS3/WS6).
- **Đứng yên:** watchdog theo sự kiện (`RuntimeEvent`): `idle` mặc định 300 giây cho con; chờ mô hình tính là còn hoạt động.
- **Liên kết phiên cha con:** cần một cột hoặc bảng liên kết trong `sessions.db` (ngoài phạm vi, WS4; xem mục 9). Tạm thời có thể dùng tiền tố tiêu đề `[sub:<id cha>] ...`.
- **Test:** hủy cha khi ba con đang chạy: cả ba dừng, không luồng nào còn sống (đếm bằng bộ đếm luồng), phiên mỗi con kết thúc `Cancelled`; trần đồng thời; độ sâu; quyền chỉ giảm; con không nhận lease của cha; `summary` bị chặn khi chứa mẫu tiêm lệnh.

## 6. R4: cron

### 6.1 Định nghĩa job và lưu trữ

```rust
pub struct CronJob {
    pub id: String, pub name: String,
    pub schedule: Schedule,            // mục 6.2
    pub prompt: String,                // việc agent làm (tự đủ ngữ cảnh)
    pub provider: Option<String>, pub model: Option<String>,
    pub intent: IntentDeclaration,     // capability job được dùng (bắt buộc, không có mặc định "tất cả")
    pub limits: RunLimits,             // bắt buộc có cả token lẫn idle; cron không được chạy không hạn mức
    pub delivery: DeliveryTarget,      // mục 7, chỉ là tên đích; WS5 hiểu nó
    pub enabled: bool, pub created_at: String,
}
```

- **Lưu ở đâu:** một tệp `cron.db` (SQLite, sau feature `session-db`) cạnh `sessions.db` trong cùng `StateRoot`, bảng `jobs` và `runs`. Lý do không nhét vào `sessions.db`: lược đồ đó thuộc WS4 và việc thêm bảng là một bước migration của họ; tách tệp thì WS2 tự quản lược đồ (có `user_version` riêng). Phương án thay thế (cùng tệp, WS4 thêm migration) nằm ở mục 10, câu 2. Mỗi lần chạy sinh **một phiên** trong `sessions.db` (qua `SessionStore`), nên lịch sử cron xem được bằng công cụ phiên hiện có.
- **`runs`:** `(job_id, scheduled_instant)` có ràng buộc `UNIQUE` (đây là cái chặn chạy trùng), `claimed_at`, `owner` = (pid, thời điểm bắt đầu tiến trình), `started_at`, `finished_at`, `status` (`Claimed|Running|Succeeded|Failed|TimedOut|Crashed|SkippedMissed|Deferred`), `session_id`, `error_class`, `usage`, `delivery_status`.

### 6.2 Lịch

Bốn dạng (như hermes): khoảng (`30m`, `2h`, `1d`), "mỗi" (`every 2h`), biểu thức 5 trường (`0 9 * * *`), một-lần (ISO 8601). **Bộ phân tích tự viết** (không crate `cron`), là hàm thuần `next_after(schedule, instant) -> Option<Instant>` và `missed_between(...)`, test như **dữ liệu** (bảng đầu vào đầu ra). **Múi giờ:** bản đầu chỉ hỗ trợ **UTC hoặc độ lệch cố định** do người đặt cho job (chrono không có cơ sở dữ liệu múi giờ nếu không thêm `chrono-tz`); DST không được xử lý và được ghi rõ (mục 10, câu 3).

### 6.3 Bộ lập lịch (tick) và khóa chống chạy trùng

`CronScheduler::tick(now: Instant)` (đồng hồ truyền vào, test dùng đồng hồ giả):
1. Lấy **khóa tick** `<state>/cron/tick.lock` bằng `try_lock`; không lấy được thì thoát yên lặng (tiến trình khác đang tick).
2. Trong **một giao dịch**: với mỗi job đến hạn, `INSERT` dòng `runs(job_id, scheduled_instant)`; thành công nghĩa là **đã giành slot** (trùng khóa duy nhất thì bỏ qua); đồng thời **dời `next_run`** của job sang slot kế tiếp. Dời trước khi chạy: một vụ sập giữa chừng làm mất tối đa một lần, không bao giờ chạy hai lần.
3. Slot có chủ đã chết (chủ nhận biết bằng (pid, thời điểm bắt đầu), không pid trần): đặt `Crashed` và **khôi phục đúng một lần** (tạo slot bù) theo chính sách bù.
4. **Bù lỡ:** cửa sổ = nửa chu kỳ kẹp 120 giây đến 2 giờ; một-lần được ân hạn 120 giây; ngoài cửa sổ ghi `SkippedMissed` kèm lý do, **không bỏ im lặng**; tùy chọn `catch_up_missed` (mặc định bật).
5. **Hoãn khi máy tải:** nếu `os::resource::pressure` báo áp lực cao thì ghi `Deferred` và thử lại ở tick sau, tối đa một số phút cấu hình, rồi chạy hoặc bỏ có ghi nhận.
6. Chạy job: `AgentRun` (mục 4) với `origin = Scheduler`, `human_initiated = false`, `agent_id = "cron:<job_id>"` (nên người có thể cấp lease cho chủ thể này), `intent` của job, **bỏ qua ghi bộ nhớ dài hạn** (như hermes), watchdog `idle` (mặc định 600 giây) và `wall`. Trần song song toàn cục (mặc định 2), tính theo (profile, job) để hai profile cùng tên job không đè nhau.
7. Sau khi xong: `delivery` (mục 7), rồi cập nhật `runs`.

**Ai chạy tick:** `CronScheduler` là thư viện; việc đặt nó thành tiến trình nền (dịch vụ) thuộc phần host (lệnh `yana-rt cron daemon`, hoặc dịch vụ của `os/service`, hoặc tiến trình Desktop/gateway của WS5). Hợp đồng chỉ bảo đảm: nhiều tiến trình cùng gọi `tick` thì mỗi slot chạy đúng một lần.

### 6.4 Giao diện dòng lệnh (cần sửa `src/main.rs`, xem mục 9)

`yana-rt cron add|list|show|pause|resume|remove|run-now|tick|runs`. `run-now` cũng đi qua `runs` (slot "thủ công") nên không chạy chồng với lần theo lịch. Job không tự tạo hay sửa job khác: capability quản lý cron **không** có trong catalog của lần chạy cron.

## 7. Giao diện giao kết quả cho WS5 (hợp đồng, WS2 chỉ định nghĩa)

```rust
pub struct DeliveryTarget(pub String);          // tên đích, WS5 diễn giải ("discord:#ops", "file:outbox", ...)
pub struct DeliveryReport { pub job_id: String, pub run_id: String, pub status: RunStatus, pub text: String /* đã che chuỗi giống khóa, trần 8 KiB */, pub finished_at: String }
pub trait DeliverySink: Send + Sync {
    fn deliver(&self, target: &DeliveryTarget, report: &DeliveryReport) -> Result<DeliveryReceipt, DeliveryError>;
}
```

WS2 cung cấp `NullSink` và `FileSink` (ghi vào `<state>/cron/outbox/<run_id>.json`, để WS5 hay người dùng đọc). Giao thất bại **không** làm job thất bại: ghi `delivery_status` và thử lại theo chính sách đơn giản (3 lần, lùi dần). Sự kiện cho giao diện: `RunReport` và `RuntimeEvent` hiện có; thêm `RunPaused` khi cần duyệt để WS5 gắn thông báo.

## 8. Giai đoạn và tiêu chí xong

Thứ tự theo brief: **R1** vòng lặp (mục 4) và hủy cây; **R4** cron (mục 6, đồng hồ giả); **R3** subagent (mục 5); **R2** tool-search; R5 batch, R6 mixture-of-agents và goals/loops, R7 nén ngữ cảnh: sau khi 1 đến 4 ổn. Mỗi bước: viết test thất bại trước, review chỉ đọc (security-auditor và code-auditor) trước khi báo xong, commit cục bộ, không push.

Tiêu chí xong (theo brief): mỗi mục có test hồi quy; **cron không chạy trùng khi hai tiến trình cùng khởi động** (test hai `CronScheduler` trên cùng `cron.db` với đồng hồ giả, đếm số lần chạy); **hủy cha hủy hết con và không có luồng hay tiến trình mồ côi**; không lượt nào vượt trần token hay độ sâu; `cargo test --locked --features cli,session-db` xanh, chạy lặp 3 lần; số cảnh báo bin `yana-rt` không vượt `main`.

Tải máy: `nice -n 19`, `CARGO_BUILD_JOBS=1`, `--test-threads=2`; test thời gian dùng đồng hồ giả hoặc cận lỏng (>= 2 giây) và đồng bộ bằng sự kiện, không `sleep` dài; không gọi API thật (mọi test dùng nhà cung cấp giả).

## 9. Việc ngoài phạm vi WS2 (xin duyệt chung một lượt, để không hai phiên cùng sửa một tệp)

| Tệp | Thay đổi | Ai quản |
|---|---|---|
| `src/runtime/pending_approval.rs` | Chỉ nếu cần để `AgentRun` báo `AwaitingApproval` và để con báo `NeedsApproval`; **cùng tệp mà WS6 cần sửa** để hiện `BackendDisclosure` trong lời nhắc duyệt từ xa. Đề xuất: **một phiên sửa tệp này một lần**, các thay đổi gom lại (WS6 thêm hàm hiện thông tin nơi chạy; WS2 không đụng `reason_with_disclosure` mà chỉ gọi) | WS2 (trong phạm vi) và WS6 |
| `src/capability/registry_data*.rs` (WS3) | Thêm capability `agent.delegate` (ReadOnly hay Mutating? xem câu 5) kèm descriptor và `availability` theo độ sâu | WS3 (đã xong), cần duyệt |
| `src/chat/tui/tool_dispatch.rs` | Thêm nhánh thực thi `delegate_task` trong `ChatCapabilityExecutor` (chạy `SubagentSpec`) | WS1/WS3 (chat) |
| `src/session_db/profile.rs`, `store/migrations.rs` | `StateKind::CronDb` (một dòng) và, nếu chọn phương án cùng tệp, các bảng cron; cột liên kết phiên cha con | WS4 |
| `src/main.rs` | Đăng ký lệnh con `cron` (và có thể `agent`) | chung |
| `Cargo.toml` | Không thêm crate; có thể thêm tên feature (`cron`, `agent-loop`) nếu muốn bật riêng | chung |

## 10. Quyết định cần anh Tâm (kèm đề xuất của em)

1. **Độ sâu subagent mặc định:** phẳng (tối đa 1), nâng tới tối đa 3 chỉ khi người đặt rõ. Đồng ý?
2. **Nơi lưu cron:** `cron.db` riêng (đề xuất, WS2 tự quản lược đồ, cần thêm `StateKind::CronDb`) hay cùng `sessions.db` (WS4 thêm migration)?
3. **Múi giờ:** bản đầu chỉ UTC hoặc độ lệch cố định, không DST (không thêm `chrono-tz`)? Hay duyệt thêm crate `chrono-tz` qua rule 44?
4. **Duyệt của người cho việc của con và của job cron:** mặc định **từ chối** và báo `NeedsApproval` (đề xuất), người dùng cấp **lease** cho `cron:<job_id>` nếu muốn job tự chạy capability mutating; chuyển lời xin duyệt lên phiên gốc là việc sau. Đồng ý?
5. **`agent.delegate` thuộc loại capability nào?** Em đề xuất `ReadOnly` ở mức registry (nó chỉ sinh một lượt con bị chặn bởi quyền của cha), vì rủi ro nằm ở những gì con được làm, và những thứ đó vẫn qua authority từng lời gọi. Có phản đối?
6. **Bộ phân tích lịch tự viết** thay vì crate: đồng ý?
7. **Hỗ trợ vòng lặp khi không có `session-db`:** chỉ chạy không lưu (như chat hiện nay), còn cron và subagent đòi `session-db`. Đồng ý?
8. **Thứ tự R1 rồi R4 rồi R3** (brief) hay làm subagent trước cron?

## 11. Chưa kiểm chứng

Cách `File::try_lock` hoạt động trên Windows và trên hệ tệp mạng; cửa sổ đua giữa `INSERT` slot và dời `next_run` nếu không đặt trong cùng giao dịch SQLite (thiết kế yêu cầu cùng giao dịch; cần test với hai kết nối thật); hiệu năng và độ ổn định khi nhiều luồng con cùng gọi một `ChatProvider` có `FailoverProvider` và credential pool (chưa đọc kỹ bảo đảm `Send + Sync` thực tế ngoài chữ ký trait); `os::resource::pressure` có phản ánh đủ tải máy cho mục "hoãn" hay không; nhịp tim của con khi mô hình stream rất chậm; có nên đếm token con theo `ChatUsage` của nhà cung cấp (có thể bằng 0 khi nhà cung cấp không báo); rule `agent-excessive-agency-law` nói "max 3 levels" nhưng ví dụ ghi "agent B (độ sâu 2) cannot spawn further" nên em chọn cách hiểu độ sâu 3 là cho phép và là lá: cần anh xác nhận cách hiểu này.
