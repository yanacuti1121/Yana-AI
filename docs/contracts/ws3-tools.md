# WS3: Hợp đồng công cụ cho agent

Trạng thái: **ĐỀ XUẤT, chờ anh Tâm duyệt.** Chưa có dòng mã nào. Nhánh `ws3/tools`, gốc `281f1bfb`.
Phạm vi mã: `src/capability/` (trừ `file_mutation.rs` và `checkpoint_hook*`), `src/mcp.rs`, module mới `src/mcp_client/`, test.
Nếu cần sửa `src/runtime/` thì dừng và báo trước; hợp đồng này cố ý thiết kế để không cần.

## 1. Những gì đã đọc và ảnh hưởng đến thiết kế (đọc từ mã, chưa chạy)

1. **Registry là tĩnh.** `CapabilityDescriptor` (`src/capability/registry.rs`) có `name`, `tool_name`, `description` kiểu `&'static str`, cộng `access_mode` (ReadOnly/Mutating), `risk_tier` (Low/Medium/High), `approval` (None/HumanApprovalPerCall), `input_schema`, `output_schema`, `availability`. `Manifest::all()` dựng 13 mục từ `registry_data.rs`.
2. **Cơ quan cấp quyền tra theo `tool_name` trong registry đó.** `YanaAuthorityChain::capability_decision` (`src/runtime/authority.rs`) dùng `manifest().get_by_tool_name(&call.name)`; công cụ không có trong registry bị `Deny` với lý do "no canonical Yana capability". Vì vậy **công cụ ngoài không thể đăng ký động mà không sửa `src/runtime/`**.
3. **Lease khớp theo văn bản `command`.** `command_text_for_lease` chỉ đọc trường `command` trong `arguments_json`; `LeaseStore::try_consume_matching(subject, capability, repo_root, command_text)` so `allow`/`deny` của lease với văn bản đó. Mọi công cụ `HumanApprovalPerCall` đi qua đúng đường này (hết hạn, thu hồi, ngân sách, HALT đều kiểm lại mỗi lần).
4. **`mcp` là feature riêng** (`mcp = ["rmcp", "tokio"]`), không nằm trong `cli`. Build mặc định không có tokio.
5. **Không có hàm quét prompt injection theo chuỗi.** `src/scanner` quét tệp bằng bộ luật YAML (`scanner/*.yml`), không có API "quét chuỗi này". Brief giả định có sẵn; thực tế phải viết bộ khớp nhỏ (mục 6).
6. **Gốc `281f1bfb` cũ hơn các bản sửa Y20 và Y21** (`design/fetch.rs` chưa có; `filescan` còn bản `is_private_ip` trùng). `crate::design::is_private_ip` (`pub(crate)`, `src/design/mod.rs:136`) thì có. Mã mạng ở đây dùng hàm đó, tự tắt chuyển hướng tự động và kiểm từng bước theo mẫu Y21; khi nhánh này hợp nhất với bản có `design/fetch.rs` thì gộp về một chỗ.

## 2. Một công cụ khai báo, đăng ký, trả kết quả và lỗi như thế nào

**Khai báo.** Công cụ tĩnh (T2, T3, và cổng MCP) thêm đúng một `CapabilityDescriptor` vào `registry_data.rs`. Bốn thứ bắt buộc:
- tên (`name` dạng `nhóm.hành_động`, `tool_name` dạng định danh cho API mô hình);
- tham số: `input_schema` JSON Schema, có giới hạn độ dài từng trường;
- quyền cần: `access_mode` + `approval`;
- mức rủi ro: `risk_tier`.
Quy tắc cứng: công cụ nào ghi đĩa, chạy tiến trình, hoặc gửi dữ liệu ra ngoài máy đều là `HumanApprovalPerCall`. Không có công cụ nào tự nhận `approval: None` nếu nó gửi dữ liệu ra mạng hay đọc thứ ngoài kho.

**Đăng ký.** Chính là `Manifest::all()`. Mặc định không đổi hành vi: mục mới chỉ hiện trong registry; công cụ chỉ đến tay mô hình khi một danh mục (`chat::tools::catalog`, ngoài phạm vi WS3) chọn cấp. **Đợt này không nối vào chat và không mở ra qua MCP server của Yana** (tránh biến Yana thành cầu nối cho công cụ ngoài).

**Kết quả.** Dùng hình dạng hiện có: `{capability, data, truncated}` (như `output_schema` các mục cũ). Thêm hai trường chỉ cho công cụ nhận dữ liệu ngoài: `untrusted: true` và `scan: {status, categories}` (mục 6). Mọi kết quả có trần kích thước (mặc định 64 KiB, cắt và đặt `truncated`).

**Lỗi.** Dùng `CapabilityError` hiện có; thêm đúng hai biến thể vào `error.rs`: `Timeout { detail }` và `External { detail }` (lỗi từ phía server ngoài hoặc dịch vụ ngoài). Các biến thể cũ giữ nguyên nghĩa; adapter `From<CapabilityError> for String` bao cả hai. Lỗi không bao giờ chứa nội dung bí mật (khóa API, giá trị biến môi trường).

## 3. Bảng công cụ

| Tên | access | risk | approval | Ghi chú |
|---|---|---|---|---|
| `mcp.call` (T1) | Mutating | High | HumanApprovalPerCall | cổng duy nhất tới mọi công cụ MCP ngoài |
| `web.search` (T2) | ReadOnly | Medium | HumanApprovalPerCall | câu truy vấn rời khỏi máy (rule 68) |
| `file.patch` (T3) | Mutating | High | HumanApprovalPerCall | xây trên `apply_file_write`, không sửa nó |
| T4 trình duyệt CDP, T5 LSP, T6 vision | | | | hợp đồng riêng, làm sau |

## 4. T1: MCP client (stdio)

**Cổng một tool, không đăng ký động.** Một capability tĩnh `mcp.call`, tham số:
`{"command": "<server>/<tool>", "arguments": {...}}`. Trường tên `command` là **cố ý** (mục 1.3): nó làm lease `allow`/`deny` khớp được theo `server/tool` (ví dụ `github/*`) mà không cần đổi `src/runtime/`. Đây là chỗ mượn tên trường; lựa chọn khác là sửa 3 dòng ở `src/runtime/authority.rs` (cần anh Tâm cho phép sửa phạm vi WS2). Liệt kê tool của server (`tools/list`) là một chế độ của cùng cổng (`command` = `<server>/`), vì bản thân việc khởi động server đã là thực thi một tệp.

**Khai báo server chỉ do người dùng.** Danh sách server nằm trong tệp cấu hình do người dùng sở hữu (đề xuất `<repo>/.yana-ai/mcp-servers.json`), mô hình không thêm hay sửa được. Mỗi mục: `name`, `command`, `args`, `env` (danh sách tên biến được chuyển qua, không phải cả môi trường), `timeout_secs`. Tiến trình con chạy với môi trường **xóa sạch** cộng đúng các biến đã liệt kê (tránh lộ khóa API của Yana cho server ngoài), thư mục làm việc là gốc kho.

**Mọi lời gọi đều cần quyền.** Không tin chú thích `readOnlyHint` của server (nó tự khai). Mỗi lời gọi đi qua `YanaAuthorityChain` như `browser.fetch`: người ở terminal duyệt, hoặc lease do con người cấp khớp `server/tool`. Có test: chưa có quyền thì server **không được khởi động**.

**Kỷ luật tiến trình.** Hạn thời gian cứng cho khởi động, cho mỗi lời gọi và cho tổng phiên; quá hạn thì kill và trả `Timeout`. Giới hạn kích thước một thông điệp và số tool nhận về. Đóng phiên khi xong lượt, không giữ tiến trình nền.

**Thay đổi phụ thuộc (rule 44, CHỜ anh Tâm xác nhận riêng, em không tự bật):**
- Sửa một dòng `Cargo.toml`: `rmcp ... features = ["server", "transport-io", "client"]`. Chỉ đổi feature của **chính crate `rmcp` đã ghim `=2.2.0`**, không đổi phiên bản.
- Feature `client` của `rmcp 2.2.0` là `client = ["dep:tokio-stream"]` (đọc từ `Cargo.toml` của crate trong bộ nhớ đệm cargo). Nghĩa là **kéo thêm 1 gói mới**: `tokio-stream` 0.1.x (của nhóm tokio). Nó dùng `futures-core`, `pin-project-lite` và `tokio` đã có trong `Cargo.lock` (chưa kiểm chứng đầy đủ cây phụ thuộc). Gói này **chưa có trong bộ nhớ đệm cargo** trên máy, nên bật nó cần tải từ mạng.
- **Cố ý không bật `transport-child-process`**: feature đó kéo thêm `process-wrap` 9. Thay vào đó em dùng `transport-async-rw` (đã có sẵn nhờ `transport-io`) và tự tạo tiến trình con bằng `tokio::process` (tokio đã bật `full`), truyền stdin/stdout của nó làm đường truyền. Vì vậy không thêm gói thứ hai.
- Phạm vi ảnh hưởng: `rmcp` là phụ thuộc tùy chọn của feature `mcp`, nên build `cli` mặc định không đổi gì; chỉ `--features mcp` thêm `tokio-stream`.
- **Chưa kiểm chứng:** số lượt tải, tuổi bản phát hành, có thông báo lỗ hổng không, giấy phép của `tokio-stream` (em không có công cụ tra cứu). Sau khi anh duyệt em sẽ chạy `cargo` với `--locked` bị tắt đúng một lần, so `Cargo.lock` cũ với mới, và báo chính xác gói nào thêm vào trước khi commit.

## 5. T2: web search

Một trait `SearchBackend` (nhận truy vấn đã kiểm, trả danh sách `{title, url, snippet}`). Backend đầu tiên: **một điểm cuối JSON do người dùng cấu hình** (tương thích SearXNG), không cần khóa nhà cung cấp; khóa nếu có lấy từ biến môi trường mà cấu hình chỉ nêu **tên**. Backend khác (Brave, Tavily...) cắm sau qua cùng trait. Không có phụ thuộc mới (`ureq` và `url` đã có trong `cli`).
- Chỉ `https`; cấm thông tin đăng nhập trong URL; phân giải và kiểm địa chỉ bằng `crate::design::is_private_ip`; tắt chuyển hướng tự động, kiểm từng bước tối đa 5, kiểm lại mỗi địa chỉ đích.
- Kết quả trả về là dữ liệu không tin cậy: qua bộ quét mục 6, đánh dấu `untrusted`.
- Test dùng máy chủ giả cục bộ và khẳng định host bị cấm không bao giờ bị kết nối. Không gọi mạng thật.

## 6. Nội dung không tin cậy: bộ quét

Mới, nhỏ, dùng crate `regex` đã có: `capability::untrusted::scan(&str) -> ScanResult { categories }`. Bộ mẫu lấy từ `core/rules/prompt-jailbreak-guard.md` (4 loại: ghi đè trực tiếp, chiếm vai, mã hóa che giấu, đòi lộ prompt) cộng ký tự độ rộng bằng không giữa các từ khóa. **Chính sách đề xuất theo đúng rule đó: khớp thì từ chối nguyên kết quả** (không "làm sạch rồi dùng), trả lỗi nêu nguồn và loại, và ghi vào nhật ký. Không khớp thì vẫn bọc kết quả trong khối dữ liệu có nhãn nguồn. Giới hạn nói thẳng: bộ mẫu chỉ bắt được các mẫu đã biết, **không phải bảo đảm** an toàn trước injection; lớp bảo vệ thật vẫn là quyền (mọi công cụ nguy hiểm cần người duyệt).
Ghi chú: nhánh WS4 có `src/memory/guard.rs` với mẫu tương tự (chưa hợp nhất vào gốc này). Sau khi hợp nhất nên gộp về một bộ; đợt này không phụ thuộc vào nó.

## 7. T3: sửa tệp bằng patch và so khớp mờ

`file.patch`: nhận `path` và danh sách `edits: [{old, new}]` (và tùy chọn định dạng unified diff sau). Đường dẫn qua đúng bộ kiểm của `file.write` (`resolve_for_write`, chặn thoát gốc, symlink, `..`). Thứ tự khớp: khớp chính xác, rồi khớp sau khi chuẩn hóa khoảng trắng cuối dòng, rồi khớp theo dòng đã cắt lề. **Không bao giờ chấp nhận khớp mờ dưới ngưỡng** và **từ chối khi có nhiều hơn một vị trí khớp** (trừ khi đặt `replace_all`). Áp dụng bằng `propose_file_write` (hiện diff cho người duyệt) rồi `apply_file_write` (sao lưu, ghi nguyên tử, kiểm băm, điểm kiểm tra tùy chọn). Không sửa `file_mutation.rs`.

## 8. Việc hoãn
T4 (CDP) cần kết nối WebSocket tới trình duyệt; rất có thể cần thêm một crate (chưa xác định) nên phải hỏi riêng. T5 (LSP) là JSON-RPC qua stdio, không cần crate nhưng cũng chạy tiến trình ngoài, dùng chung khung của T1. T6 (vision) phụ thuộc hỗ trợ ảnh của lớp nhà cung cấp (WS1).

## 9. Kiểm thử (không gọi mạng thật)
- **MCP:** server giả trong tiến trình qua đường truyền `duplex` (giao thức đầy đủ: liệt kê, gọi, lỗi, thông điệp quá lớn); tiến trình con giả bằng lệnh `sh` (treo, thoát sớm, in rác) để kiểm hạn thời gian, kill, môi trường bị xóa sạch; chưa có quyền thì không khởi động.
- **Quyền:** `mcp.call` không lease và không duyệt bị `Deny` hoặc `HumanApprovalRequired`; có lease khớp `server/tool` được `Allow`; lease `github/*` không cho `other/x`; HALT chặn.
- **Bộ quét:** mỗi loại có mẫu dương và âm; kết quả bị từ chối không lọt ra ngoài.
- **Mạng:** IPv4 riêng, `::ffff:`, metadata (169.254.169.254, 100.100.100.200), CGNAT, chuyển hướng tới địa chỉ nội bộ, thông tin đăng nhập trong URL, `http`.
- **Mặc định:** registry cũ vẫn đúng 13 mục theo tên cũ (test hiện có), thêm 3 mục mới có test đếm; không tệp hay tiến trình nào được tạo khi không gọi công cụ.
- Theo quy trình: tuần tự, `CARGO_BUILD_JOBS=2`, lặp 10 lần ở lần chốt, security-auditor và code-auditor đọc (chỉ đọc) trước khi commit phần chạm lease/approval hoặc mã mạng.

## 10. Quyết định cần anh Tâm

1. **Bật feature `client` của `rmcp` (thêm `tokio-stream`)?** Em đề nghị có, theo mục 4. Đây là việc riêng theo rule 44, em chưa làm gì.
2. **Lease khớp theo `server/tool` qua trường `command`** (không sửa runtime) hay **sửa `src/runtime/authority.rs`** cho có trường riêng? Em đề nghị dùng `command`, nêu rõ là mượn tên.
3. **Chính sách bộ quét: từ chối nguyên kết quả khi khớp** (đề nghị, theo `prompt-jailbreak-guard.md`) hay chỉ cảnh báo?
4. **Backend tìm kiếm đầu tiên:** điểm cuối JSON tương thích SearXNG do người dùng cấu hình (đề nghị) hay một nhà cung cấp cụ thể cần khóa?
5. **Nơi khai báo server MCP:** `<repo>/.yana-ai/mcp-servers.json` (đề nghị) hay tệp cấp người dùng?
6. Thêm hai biến thể `Timeout` và `External` vào `CapabilityError` (đụng `error.rs`, nhưng chỉ thêm, không đổi cái cũ).

## 11. Chưa kiểm chứng
Hành vi thật của `rmcp` client với server thật; cây phụ thuộc đầy đủ của `tokio-stream`; Windows (tiến trình con, kill); phát hiện injection ngoài các mẫu đã biết; đường truyền `duplex` có phản ánh đủ hành vi stdio thật hay không (sẽ thêm một test chạy tiến trình con thật bằng `sh`).
