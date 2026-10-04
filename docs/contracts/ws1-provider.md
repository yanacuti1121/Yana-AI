# Hợp đồng WS1: nhà cung cấp model

Trạng thái: **DỰ THẢO, chờ anh Tâm duyệt.** Chưa có dòng code nào theo hợp đồng này.
Nhánh `ws1/provider`, từ commit `281f1bfb`. Phạm vi: `src/model/`, `src/chat/{provider,anthropic,gemini,openai_compat,ollama_native,settings}.rs`.

## 1. Hiện trạng đã đo (đọc code, không suy đoán)

| Điều | Thực tế | Nơi |
|---|---|---|
| Trait gọi model | `ChatProvider` (blocking, `stream_chat(api_key, model, system, messages, tools, on_chunk) -> Result<(ChatUsage, StreamOutcome)>`) | `src/model/provider.rs:194` |
| Kiểu lỗi | Không có. Mỗi adapter ném `anyhow` với chuỗi, ví dụ `"anthropic error (429): <body>"` | `anthropic.rs:94`, `gemini.rs:84`, `openai_compat.rs:488` |
| Phân loại lỗi | `FailureClass` (4 lớp, chỉ từ mã HTTP) và `CircuitBreaker::record_failure_with_status` có sẵn, nhưng **chỉ được gọi trong chính `circuit_breaker.rs`**. Chưa nơi nào nối vào | `src/model/circuit_breaker.rs:46,192` |
| Breaker đang dùng thật | `record_failure()` không có mã lỗi, ở `chat/tui/turn.rs` | `turn.rs:102-204` |
| Nhiều khóa | Không có. Mỗi provider đọc đúng một biến môi trường (`ANTHROPIC_API_KEY`...) | `anthropic.rs:38` |
| Failover | Không có | |
| Prompt caching | Không có (`cache_control` không xuất hiện) | |
| Nơi khác gọi `stream_chat` | `src/runtime/controller.rs:339` (WS2), `chat/tui/turn.rs`, `remote/discord.rs`, `model/runtime.rs`, `ask_once` | |

Hệ quả thiết kế: vì `runtime/` và `chat/tui/` nằm ngoài phạm vi WS1, **mọi thay đổi ở trait phải chỉ thêm, có mặc định**. Chữ ký `stream_chat` không đổi.

## 2. Kiểu lỗi phân loại được (việc P1)

Thêm vào `src/model/provider_error.rs` (file mới, phạm vi `src/model/`):

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderErrorKind {
    RateLimited,      // 429, "rate limit"
    QuotaExhausted,   // 402, hết tiền/hạn mức
    ContextOverflow,  // prompt vượt cửa sổ ngữ cảnh
    Auth,             // 401, 403
    Overloaded,       // 503, 529
    ServerError,      // 500, 502, 504
    Timeout,          // hết giờ kết nối hoặc đọc
    Network,          // đứt kết nối, DNS
    ModelNotFound,    // 404, model không tồn tại
    BadRequest,       // 400, 413 và 4xx còn lại: gửi lại y hệt sẽ lỗi y hệt
    Unknown,
}

pub struct ProviderError {
    pub kind: ProviderErrorKind,
    pub status: Option<u16>,
    pub provider: String,
    pub model: Option<String>,
    pub retry_after: Option<std::time::Duration>,
    detail: String, // đã cắt và làm sạch, xem mục 2.2
}

pub struct RecoveryHint {
    pub retry_same: bool,          // thử lại cùng provider sau backoff
    pub rotate_credential: bool,   // đổi sang khóa khác của provider
    pub fallback_provider: bool,   // chuyển sang provider kế tiếp
}
impl ProviderErrorKind { pub fn hint(self) -> RecoveryHint; }
```

Bảng `hint()` (viết lại theo hành vi, tham khảo `agent/error_classifier.py` của hermes, không chép mã):

| Kind | retry_same | rotate_credential | fallback_provider |
|---|---|---|---|
| RateLimited | có (backoff) | có | có |
| QuotaExhausted | không | có | có |
| ContextOverflow | không | không | không (báo lên, chờ nén ngữ cảnh) |
| Auth | không | có | có |
| Overloaded | có | không | có |
| ServerError | có | không | có |
| Timeout, Network | có | không | có |
| ModelNotFound | không | không | có |
| BadRequest | không | không | không |
| Unknown | có (1 lần) | không | không |

### 2.1 Tương thích ngược

- Adapter trả `anyhow::Error::new(ProviderError)`. Nơi gọi lấy lại bằng `err.downcast_ref::<ProviderError>()`.
- `Display` của `ProviderError` giữ **đúng định dạng chuỗi hiện tại** (`"anthropic error (429): ..."`), nên mọi chỗ đang so khớp hoặc in chuỗi không đổi hành vi.
- `impl From<ProviderErrorKind> for Option<FailureClass>` để router đưa lỗi vào `CircuitBreaker::record_failure_with_status` sẵn có, không viết breaker thứ hai.

### 2.2 An toàn dữ liệu

- `detail` cắt tối đa 2 KiB và loại các chuỗi giống khóa (tiền tố `sk-`, `AIza`, header `Authorization`) trước khi lưu.
- `Debug` và `Display` không bao giờ chứa giá trị khóa. Có test kiểm tra: đưa khóa giả vào body lỗi, khẳng định nó không xuất hiện trong `format!("{err:?}{err}")`.

## 3. Bộ định tuyến và failover (việc P2)

Bộ định tuyến **tự là một `ChatProvider`**, nên mọi nơi gọi hiện tại dùng được mà không sửa:

```rust
pub struct ProviderRoute {
    pub provider: Arc<dyn ChatProvider>,
    pub model: String,
    pub credentials: Arc<CredentialPool>,   // mục 4
}

pub struct FailoverPolicy {
    pub max_attempts_per_route: u32,        // mặc định 2
    pub allow_failover_after_output: bool,  // mặc định false
}

pub struct FailoverProvider { /* routes theo thứ tự ưu tiên, một CircuitBreaker mỗi route, policy */ }
impl ChatProvider for FailoverProvider { /* ... */ }
```

Quy tắc, theo thứ tự:

1. Duyệt route theo thứ tự ưu tiên. Bỏ qua route mà `breaker.can_attempt()` là false.
2. Gọi `stream_chat` của route với khóa lấy từ pool. Lỗi thì phân loại (mục 2) và báo breaker qua `record_failure_with_status`.
3. Theo `hint()`: `retry_same` thì thử lại tối đa `max_attempts_per_route`; `rotate_credential` thì đổi khóa; `fallback_provider` thì sang route kế; không có gợi ý nào thì trả lỗi ngay.
4. **Không failover sau khi đã phát chunk nào ra `on_chunk`.** Chuyển provider giữa chừng sẽ làm người dùng thấy văn bản lặp hoặc lệch. Khi `allow_failover_after_output` là false và đã có output, trả lỗi gốc. Đây là điểm cần anh Tâm xác nhận (mục 7).
5. Hết mọi route: trả `ProviderError` của lỗi cuối, kèm danh sách route đã thử trong `detail`.
6. Đường lỗi không được nuốt tool call: `ContextOverflow` và `BadRequest` không bao giờ failover, vì chuyển provider không làm request đúng lên.

Cấu hình: `ChatSettings` (`settings.rs`) thêm `fallback_providers: Vec<String>` với `#[serde(default)]`. File cấu hình cũ vẫn đọc được, mặc định rỗng nghĩa là không failover.

## 4. Nhóm khóa (việc P3)

```rust
pub struct CredentialPool { /* danh sách Credential, con trỏ xoay vòng, đồng hồ có thể thay khi test */ }
pub struct Credential { id: String /* nhãn, không phải bí mật */, secret: Secret }
pub struct Lease<'a> { /* mượn một Credential, có id và secret() */ }

impl CredentialPool {
    pub fn acquire(&self) -> Option<Lease<'_>>;               // xoay vòng, bỏ qua khóa đang khóa tạm
    pub fn report(&self, lease: Lease<'_>, err: &ProviderError); // cập nhật trạng thái khóa
}
```

- `Secret` là kiểu bọc: `Debug` in `Secret(***)`, không có `Display`, không `Clone` ra ngoài crate. **Không thêm crate mới** (không `zeroize`); xóa bộ nhớ bằng ghi đè khi `Drop`, và ghi rõ đó là nỗ lực tốt nhất, không phải đảm bảo.
- Trạng thái khóa sau `report`: `RateLimited` thì khóa tạm đến `retry_after` (mặc định 60 giây); `QuotaExhausted` thì khóa tạm 1 giờ; `Auth` thì vô hiệu đến khi nạp lại cấu hình. Khóa tạm hết hạn tự dùng lại được.
- Khóa **chỉ nằm trong bộ nhớ**, không ghi đĩa, không ghi log. `acquire()` trả `None` khi mọi khóa đang bị khóa thì router coi như route đó đã hết khả năng và sang route kế.
- Nguồn khóa: đọc từ biến môi trường, xem câu hỏi mở số 2.
- `stream_chat` vẫn nhận `api_key: Option<&str>`: pool chỉ cấp chuỗi cho từng lần gọi, không đổi trait.

## 5. Prompt caching (việc P4, chỉ Anthropic)

- Trait thêm `fn supports_prompt_cache(&self) -> bool { false }` (có mặc định). Chỉ `AnthropicProvider` trả `true`.
- Adapter gắn `"cache_control": {"type": "ephemeral"}` vào khối `system` và khối tin nhắn ổn định cuối cùng. Tắt được bằng cài đặt.
- `ChatUsage` thêm `cache_read_tokens` và `cache_write_tokens`. `ChatUsage` được dựng bằng literal ở 9 chỗ, nên thay đổi này **phải** đi kèm sửa các chỗ đó hoặc dùng `..Default::default()`. Nếu chỗ nào nằm ngoài phạm vi WS1 thì dừng và báo trước khi sửa.

### 5.1 Thay đổi khi cài đặt P4 (2026-09-30)

Ba chỗ khác với văn bản trên, đều do phạm vi file:

1. **Không thêm trường vào `ChatUsage` ở lần đầu.** 4 chỗ dựng bằng literal nằm ngoài phạm vi WS1: `chat/headless.rs:761`, `chat/tui/tabs/tests.rs:42`, `runtime/tests.rs:66` và `:74`. Vì vậy P4 lúc đầu chỉ làm phía yêu cầu (gắn `cache_control`).
   **Đã giải quyết (2026-09-30, anh Tâm cho phép sửa đúng 4 chỗ này):** `ChatUsage` có thêm `cache_read_tokens` và `cache_write_tokens` (mặc định 0); 4 literal dùng `..Default::default()`, không đổi logic. Anthropic đọc `cache_read_input_tokens` và `cache_creation_input_tokens` từ sự kiện `message_start`. Chế độ không TUI báo hai số này trong sự kiện JSON `metrics` (`cache_read_tokens`, `cache_write_tokens`). Giao diện TUI chưa hiển thị chúng.
2. **Không thêm `supports_prompt_cache()` vào trait.** Chưa có nơi nào dùng nó, thêm vào là thừa. Thêm khi có người gọi.
3. **Công tắc tắt là biến môi trường `YANA_PROMPT_CACHE=0|off|false`, không phải cài đặt.** `AnthropicProvider` là struct rỗng được tạo ở `chat/mod.rs:107` và `model/catalog.rs:35`; thêm trường cấu hình buộc phải sửa `chat/mod.rs` (ngoài phạm vi). Mặc định bật. Biến được đọc mỗi lần gửi yêu cầu, còn test gọi thẳng `build_request_body` nên không đụng môi trường.

Vị trí điểm cache: khối `system` (kéo theo `tools` phía trước) và khối cuối của tin nhắn mới nhất. Tin nhắn chuỗi thường được đổi thành mảng một khối vì API chỉ nhận `cache_control` trên khối. Văn bản rỗng bị bỏ qua vì API từ chối `cache_control` trên khối rỗng.

## 6. Provider mới qua `openai_compat` (việc P5)

Chỉ thêm sau khi P1 đến P3 có test. Mỗi provider chỉ là một mục cấu hình (tên, URL gốc, biến môi trường khóa, model mặc định) trên `openai_compat`, không thêm mã truyền tải mới. Ứng viên: OpenRouter, một provider cục bộ.

## 7. Điều cần anh Tâm quyết trước khi cài đặt

1. **Failover sau khi đã có output:** mặc định em đề xuất *không* failover (mục 3, bước 4). Có đồng ý không?
2. **Nguồn nhiều khóa:** em đề xuất biến môi trường phân tách bằng dấu phẩy, tên `<TÊN_BIẾN_HIỆN_TẠI>_POOL` (ví dụ `ANTHROPIC_API_KEY_POOL=k1,k2`). Biến đơn `ANTHROPIC_API_KEY` vẫn chạy như cũ. Có đồng ý không?
3. **Đếm token:** brief nhắc trait có "đếm token". Hiện chưa có hàm nào, và quy tắc token-budget cảnh báo ước lượng theo ký tự lệch đến 30%. Em đề xuất **không thêm** vào đợt này. Có đồng ý không?
4. **`ChatUsage` có 9 literal:** nếu có chỗ nằm ngoài phạm vi (`runtime/`, `remote/`), em dừng lại báo anh thay vì tự sửa. Có đồng ý cách xử lý đó không?

## 8. Kế hoạch kiểm thử (viết test thất bại trước)

- Không gọi mạng thật, không dùng khóa thật. Máy chủ giả bằng `std::net::TcpListener` như `ollama_native.rs` và `golden_e2e_tests.rs` đang dùng. Không thêm crate.
- P1: mỗi mã HTTP và mỗi mẫu lỗi thân trả về đúng `ProviderErrorKind`; bảng `hint()`; khóa giả không lọt vào `Debug`/`Display`.
- P2: route đầu trả 429 thì chuyển route hai; `ContextOverflow` không chuyển; đã có output thì không chuyển; hết route thì lỗi kèm danh sách route đã thử; breaker mở thì bỏ qua route.
- P3: khóa bị 429 được bỏ qua rồi dùng lại sau `retry_after` (đồng hồ giả); khóa bị `Auth` không tự sống lại; mọi khóa bị khóa thì `acquire()` là `None`; xoay vòng đều.
- Không test nào đặt biến môi trường toàn cục (bài học của lỗi chập chờn ở WS0). Truyền cấu hình qua tham số.
- Tiêu chí nộp: `cargo test --features cli` xanh, chạy lặp 20 lần để loại chập chờn, kèm log thật.

## 9. Nối vào ứng dụng (2026-09-30, anh Tâm chọn hướng 3 cho P5)

Phạm vi được mở thêm đúng hai file: `src/chat/mod.rs` và `src/chat/settings.rs`. Logic nằm ở file mới `src/model/wiring.rs` (thuộc `src/model/`), còn hai file kia chỉ sửa mỏng.

- `settings.rs`: thêm `fallback_providers: Vec<String>` (`#[serde(default)]`, mặc định rỗng). File cấu hình cũ đọc được như trước.
- `wiring::assemble(primary, fallback_names, select, lookup)` là hàm thuần: môi trường và catalog đi vào bằng tham số. Không cấu hình gì (không `fallback_providers`, không `<TÊN>_POOL` của provider chính) thì trả về **chính `Arc` provider đó**, không bọc. Có test `Arc::ptr_eq` chứng minh.
- Có `<TÊN>_POOL` của provider chính thì provider chính dùng nhóm khóa. Có `fallback_providers` thì bọc bằng `FailoverProvider`. Provider dự phòng bị bỏ qua kèm ghi chú khi: tên không có trong catalog, trùng provider chính, đã liệt kê hai lần, hoặc cần khóa mà chưa đặt biến. Provider không cần khóa (ví dụ ollama) dùng được không cần khóa.
- Provider dự phòng dùng model mặc định của chính nó và khóa của chính nó (`<TÊN>` hoặc `<TÊN>_POOL`), không dùng khóa hay model của người gọi.
- `chat/mod.rs`: `dispatch` lấy khóa chính bằng `wiring::resolve_primary_key` (biến đơn được ưu tiên; nếu chỉ có `<TÊN>_POOL` thì dùng khóa đầu của nhóm, trước đây trường hợp này báo lỗi thoát). Ghi chú của `assemble` in ra stderr trước khi vào TUI.
- Thay đổi hành vi duy nhất so với trước khi có cấu hình: đặt `<TÊN>_POOL` mà không đặt `<TÊN>` giờ chạy được thay vì thoát mã 2.

### 9.1 Nối nốt các điểm vào còn lại (2026-09-30, anh Tâm mở thêm phạm vi)

Mọi điểm vào chat giờ đi qua đúng một chỗ: `chat::wire_provider(provider, fallback_names)` trong `chat/mod.rs`, bọc `wiring::assemble`. Đó là: `dispatch` (TUI), `headless::dispatch`, `headless::dispatch_resume`, lệnh `/model` (`tui/model_command.rs`) và khôi phục phiên (`tui/tabs.rs`). `chat::configured_fallbacks(repo_root)` đọc `fallback_providers` từ `.yana-ai/chat-settings.json`; thiếu hoặc lỗi file thì là rỗng. Không cấu hình gì thì `wire_provider` trả về đúng provider đưa vào (có test `Arc::ptr_eq`).

- Ghi chú của `assemble` hiển thị ở: stderr trước khi vào TUI (`dispatch`), stderr với tiền tố `[chat/headless]` (chế độ không TUI, vì stdout là kênh giao thức NDJSON), và dòng trạng thái (`/model`, khôi phục phiên).
- `/model` và khôi phục phiên cũng đọc khóa bằng `wiring::resolve_primary_key`, nên `<TÊN>_POOL` đứng một mình chạy được ở đó như ở `dispatch`.
- Ở chế độ không TUI, khóa của provider chính vẫn đến từ JSON trên stdin (ứng dụng Desktop cấp). Provider dự phòng lấy khóa từ biến môi trường của tiến trình (`<TÊN>` hoặc `<TÊN>_POOL`); nếu thiếu, nó bị bỏ qua kèm ghi chú.

### 9.2 Cách bật

1. Failover: thêm vào `.yana-ai/chat-settings.json` (cùng thư mục làm việc khi chạy chat), ví dụ `{"fallback_providers": ["openai", "ollama"]}`. Tên là những tên `--provider` nhận. Thứ tự là thứ tự thử.
2. Nhiều khóa: đặt `<TÊN_BIẾN_KHÓA>_POOL` là danh sách khóa cách nhau bởi dấu phẩy, ví dụ `ANTHROPIC_API_KEY_POOL=k1,k2,k3`. Biến đơn `ANTHROPIC_API_KEY` vẫn chạy như cũ và được thử trước.
3. Tắt prompt caching Anthropic: `YANA_PROMPT_CACHE=0`.

### 9.3 Sau review mã (2026-09-30)

Một reviewer đọc toàn bộ mã WS1; các phát hiện đã đối chiếu với mã trước khi sửa.

**Đã sửa (có test):**
- Vòng lặp xoay khóa không dừng khi máy chủ trả `Retry-After: 0`: khóa bị 429 giờ luôn bị tạm dừng tối thiểu 1 giây, và mỗi lượt chỉ được xoay tối đa bằng số khóa của nhóm.
- Thời gian chờ khi thử lại tuân theo `Retry-After` (không dưới `retry_backoff`), nhờ `FailoverPolicy::retry_wait`.
- Lỗi cuối cùng liệt kê lý do của từng route, dạng `primary (Auth), backup (Overloaded)`, không chỉ route cuối.
- Che khóa: thêm tiền tố `gsk_`, `xai-`, `hf_`, `ghp_`, `AKIA`; giá trị đi sau `Bearer`, `x-api-key`, `x-goog-api-key`, `api_key`, `apikey`, `api-key` luôn bị che, gồm cả token base64 có `/`, `+`, `=`.
- Phân loại: Gemini trả 400 "API key not valid" giờ là `Auth` (được xoay khóa và failover); 408 là `Timeout`.
- Nhóm khóa: 403 chỉ tạm dừng khóa 1 giờ thay vì vô hiệu vĩnh viễn (403 có thể là chặn vùng hay thiếu quyền). 401 vẫn vô hiệu đến khi nạp lại cấu hình.

**Đã quyết:** ở chế độ không TUI, nếu tiến trình có `<TÊN>_POOL` thì nhóm khóa được dùng cho provider chính và khóa từ stdin bị bỏ qua. Lý do: đặt biến môi trường là cấu hình chủ động. Ai muốn dùng khóa của Desktop thì đừng đặt `<TÊN>_POOL` cho provider đó.

**Chưa sửa, cần quyết định thiết kế:**
- Breaker đếm cả các lần thử lại, nên mở sớm hơn 5 lượt thất bại (với 2 lần thử mỗi lượt thì khoảng 3 lượt). Lần thử thăm dò half-open thất bại vẫn thử lại.
- Provider dự phòng nhận nguyên `tools` và ảnh của yêu cầu, dù nó có thể không hỗ trợ; khi đó người dùng thấy lỗi 400 của dự phòng thay vì lỗi gốc. Model mặc định của dự phòng ollama là `default_model()`, không dò model đã cài như đường chính.
- Lỗi TLS và các lỗi truyền tải khác ngoài timeout, host, kết nối được xếp `Unknown` nên không failover.
- Che khóa bằng so khớp chính xác giá trị của các khóa trong nhóm (cần đưa nhóm khóa vào nơi dựng lỗi) chưa làm.
- Yêu cầu Anthropic khi không cấu hình gì đã khác trước: có `cache_control` và `system` là mảng (đã ghi ở 5.1, tắt được bằng `YANA_PROMPT_CACHE=0`).
