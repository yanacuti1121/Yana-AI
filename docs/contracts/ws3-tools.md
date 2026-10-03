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

## 12. Ghi chú cài đặt (đã làm, chưa có T1)

Trạng thái: **Implemented và Tested** cho T3 và T2; T1 CHƯA làm (chờ xác nhận rule 44). Tất cả commit cục bộ trên `ws3/tools`, không push, `Cargo.toml` và `Cargo.lock` không đổi. Mặc định không đổi: các mục mới chỉ có trong registry (15 mục, test đếm đã cập nhật); chưa nối vào chat hay `src/mcp.rs`.

- **`file.patch` (T3, `patch.rs`, `file_patch.rs`):** khớp chính xác, rồi theo dòng bỏ khoảng trắng cuối, rồi theo dòng bỏ thụt lề (thay thế được thụt lề lại theo tệp). Nhiều hơn một chỗ khớp bị từ chối trừ khi `replace_all`; không có ngưỡng giống nhau để đoán. Ghi qua `apply_file_write`, không sửa `file_mutation.rs`. Có test: không bao giờ được `Allow` nếu không có người hoặc lease.
- **Bộ quét (`untrusted.rs`):** như mục 6. Mẫu câu tấn công trong test được ghép từ mảnh chữ, vì hook chặn prompt injection của repo từ chối ghi chúng nguyên văn (và để tệp nguồn không chứa chữ tấn công cho agent khác đọc phải). Biến bỏ qua hook không được đặt.
- **Mạng (`egress.rs`):** chỉ `https`, không thông tin đăng nhập, mọi địa chỉ phải qua `crate::design::is_private_ip` **và** thêm `is_special_purpose` (broadcast, 224/4, 0/8, 240/4, 192.0.0/24, 192.0.2/24, 198.18/15, 198.51.100/24, 203.0.113/24; IPv6 chỉ cho phép `2000::/3` trừ Teredo, 6to4, tài liệu; nên NAT64, `::a.b.c.d`, `fec0::` bị chặn). `is_private_ip` gốc hở các dải đó (reviewer bảo mật tìm ra); em không sửa `design/mod.rs` vì ngoài phạm vi. Chuyển hướng do mình theo từng bước, kiểm trước khi kết nối, tối đa 5, chỉ các mã 301/302/303/307/308; hết hạn thì không phân giải bước thứ sáu. Khóa API chỉ gửi tới cùng scheme, host và cổng. `ureq` tắt proxy môi trường (proxy sẽ tự phân giải tên nên phép kiểm ở đây vô nghĩa), tắt chuyển hướng tự động, thông báo lỗi là chữ cố định (không trích nội dung header), nội dung quá lớn là lỗi rõ ràng.
- **Có test chạy thật** với máy chủ lặp lại cục bộ cho `UreqTransport`: báo chuyển hướng thay vì theo, thân quá hạn mức bị lỗi, thân trong hạn mức đọc được, header có xuống dòng bị từ chối mà không lặp lại nội dung. Còn lại dùng giả trong bộ nhớ, không mở socket.
- **`web.search` (T2, `web_search.rs`):** như mục 5. Thay đổi sau review: biến khóa API **phải** có tiền tố `YANA_SEARCH_` và chỉ gồm chữ hoa, số, gạch dưới; kết quả cho biết host backend đã nhận truy vấn; tệp cấu hình giới hạn 16 KiB và chỉ "không tồn tại" mới báo "chưa cấu hình"; liên kết quá dài bị bỏ chứ không bị cắt.
- **Rủi ro còn mở (cần anh Tâm quyết):** tệp `.yana-ai/web-search.json` nằm trong repo nên một repo lạ hoặc một lần `file.write` được duyệt có thể đổi `endpoint`. Tiền tố khóa chặn việc lấy trộm biến môi trường tùy ý, nhưng truy vấn vẫn có thể bị gửi tới host do kẻ khác chọn, và hộp duyệt chỉ hiện truy vấn. Hai cách xử lý đều ngoài phạm vi em: cấm `file.write`/`file.patch` ghi `.yana-ai/web-search.json` (`file_mutation.rs`), và hiện host cùng việc có gửi khóa trong lời nhắc duyệt (`src/runtime/`). Hoặc chuyển tệp cấu hình ra khỏi repo (cấp người dùng).
- **Chưa nối vào đâu:** không có chỗ gọi `web_search`, `apply_file_patch` ngoài test. Khi nối vào `src/mcp.rs` hoặc chat phải đi qua `authorize` và có test bị từ chối khi chưa duyệt (như `browser_fetch`). Do đó build in cảnh báo dead code cho các hàm này.
- **Chưa kiểm chứng:** mạng thật và DNS thật; Windows; chuyển hướng rebind DNS (rủi ro chấp nhận, như `browser_fetch`); `is_special_purpose` cho các dải hiếm khác; phát hiện injection ngoài mẫu đã biết.

## 13. Hiệu chỉnh và ghi chú đợt nối vào chat (2b)

**Sửa mục 4 (đọc từ `lease.rs`, không phải đoán):** bộ khớp lease là **tiền tố theo token** (`command_matches`: các token của mục `allow` phải là phần đầu các token của văn bản lệnh), KHÔNG có ký tự đại diện. Vì vậy văn bản của cổng `mcp.call` là `"<server>"` hoặc `"<server> <tool>"` (cách nhau bằng dấu cách), không phải `server/tool`: `allow: ["github"]` phủ cả server, `allow: ["github search"]` chỉ một tool, `deny` thắng. Tên server chỉ gồm `a-z0-9_-` và tên tool chỉ gồm `A-Za-z0-9_.:-` (tối đa 64) để mỗi cái là đúng một token.

**Lời nhắc duyệt cho `web.search`** (đã làm, nằm ở `src/chat/tui/`, không phải `src/runtime/`):
- `web_search` chỉ được đưa cho mô hình khi có `.yana-ai/web-search.json`; không có thì danh sách công cụ y như cũ (test).
- Hộp duyệt hiện, theo thứ tự: câu hỏi, **nơi nhận** (host kèm cổng), **có gửi khóa hay không** (tên biến, không bao giờ giá trị), rồi truy vấn (cắt một dòng). Phần do mô hình chọn đứng cuối để không đẩy hai dòng kia ra khỏi tầm nhìn. Reviewer bảo mật tìm ra lỗi thật: hộp mặc định chỉ cao 5 hàng (3 dòng), nên bản đầu tiên làm mất dòng "khóa". Hộp tìm kiếm nay cao 6 hàng; có test vẽ thật vào bộ đệm 80x6 (và một test chứng minh 5 hàng thì mất dòng truy vấn).
- Host (kèm cổng) tối đa 60 ký tự và tên biến khóa tối đa 40; dài hơn thì từ chối thay vì hiện cụt.
- Truy vấn được kiểm (`validate_query`: không rỗng, tối đa 300 ký tự, không ký tự điều khiển, không ký tự định dạng vô hình như đảo chiều văn bản hay độ rộng bằng không) **trước khi** hiện hay lưu, nên không thể giả dòng khác trong lời nhắc hay trong lý do lưu bền. Câu tóm tắt đặt nơi nhận và khóa trước, truy vấn sau cùng, được escape và đặt trong dấu nháy.
- Khi bấm `y`, cấu hình được đọc lại và so với cái người duyệt đã thấy (host, **toàn bộ endpoint**, tên biến khóa); khác thì không chạy.
- Đường từ xa/bền: lý do lưu kèm câu tóm tắt đó; `resume_turn` chỉ chạy khi câu tóm tắt tính lại **khớp đúng phần cuối** của lý do đã lưu, ngược lại trả kết quả bị từ chối cho mô hình mà không gọi bộ thực thi (test đầu cuối cả hai nhánh). Một lần tìm kiếm không thể công bố (chưa cấu hình, cấu hình sai, truy vấn xấu) thì không được dừng lại chờ duyệt mù.
- Lệnh `authority pending-approvals` in ra đã thay ký tự điều khiển bằng `?`, vì lý do lưu bền đi thẳng ra terminal.
- Đã mở rộng `PROTECTED_CONFIGS`: ngoài `web-search.json` và `mcp-servers.json` nay có cả `leases.json` và `pending-approvals.json` (một lần `file.write` được duyệt không thể tự cấp lease hay giả một phê duyệt).

**Rủi ro còn lại, nói thẳng:**
- **Cấu hình nằm trong repo.** Một repo lạ có thể kèm `.yana-ai/web-search.json` làm công cụ xuất hiện mà người dùng không làm gì, và có thể nêu tên một biến `YANA_SEARCH_*` mà người dùng đã đặt cho backend của riêng họ. Hàng rào duy nhất là hộp duyệt từng lần (nay hiện đúng host và biến khóa). Nên có bước xác nhận lần đầu cho cấu hình do repo cung cấp (băm cấu hình, lưu NGOÀI repo, kiểu `direnv allow`); em chưa làm vì cần quyết định thiết kế riêng. Cùng vấn đề, nặng hơn, với `mcp-servers.json`: nó chứa **lệnh sẽ được chạy**, nên hộp duyệt của T1 phải hiện nguyên dòng lệnh (`gateway::disclose`).
- **`run_command`** (người duyệt từng lần) vẫn có thể ghi đè các tệp cấu hình đó. Bảo vệ khi ấy dựa vào việc lần tìm kiếm kế tiếp hiện đúng nơi nhận.
- **TOCTOU còn lại rất hẹp:** cấu hình được đọc lại khi bấm `y`, rồi `web_search()` đọc một lần nữa để gửi. Khoảng giữa là mili giây, và kẻ tấn công cần quyền ghi tệp cục bộ đúng lúc đó. Chấp nhận, ghi lại.
- Một backend có thể chép nguyên header `Authorization` vào thân JSON. `guard()` quét câu injection, không quét khóa bị lặp lại; chưa xử lý.
- Windows: cách viết đường dẫn lạ (dấu chấm cuối, tên 8.3, `::$DATA`) trong `is_protected_config` chưa kiểm chứng. Liên kết cứng không đổi tệp gốc vì ghi bằng tệp tạm rồi đổi tên (đọc từ mã, chưa có test).

## 14. T1: MCP client (đã làm; đã nối vào chat ở mục 16)

Trạng thái: **Implemented và Tested**, chỉ có trong bản build `--features mcp`; `Cargo.toml`/`Cargo.lock` chỉ đổi ở commit `6e85cef6` (rmcp `client`, thêm `tokio-stream 0.1.19`). Đã nối vào hộp duyệt của chat (mục 16); chưa nối vào `src/mcp.rs`.

- **Cổng `mcp.call`** (`mcp_client/gateway.rs`): văn bản gọi là `"<server>"` hoặc `"<server> <tool>"` với đúng một dấu cách ASCII. Ngữ pháp chặt có chủ ý: bộ khớp lease tách bằng `shell_words` (dấu cách, tab, xuống dòng) còn `str::split_whitespace` còn tách cả NBSP, `\r`, U+3000. Reviewer chỉ ra một hướng bypass thật: `allow ["gh"]` cùng `deny ["gh delete_repo"]` với văn bản `gh <NBSP>delete_repo` thì authority cho qua (token thứ hai khác) trong khi cổng đọc ra `delete_repo`. Nay cổng từ chối mọi thứ ngoài ngữ pháp (có test dựng đúng tình huống đó: authority `Allow`, cổng từ chối).
- **Chạy đúng cái đã duyệt:** `disclose()` trả `Disclosure` (server, tool, lệnh, đối số, tên biến, hạn thời gian). `mcp_call(root, command, args, &approved)` đọc cấu hình đúng một lần và chỉ chạy nếu bằng `approved`; tệp đã đổi (sửa tay, `git pull`) thì không khởi động gì. Giới hạn: lease cấp trước đó vẫn gắn với tên server, nên lease cũ cộng cấu hình mới bị bỏ qua chỉ khi người gọi truyền `Disclosure` cũ; nếu không có bước duyệt thì cần gắn băm cấu hình vào lease (chưa làm).
- **Dòng lệnh hiển thị** được quote (`shell_words::join`), nên `run 'b c'` khác `run b c`. Cấu hình từ chối ký tự điều khiển và ký tự vô hình (đảo chiều, độ rộng bằng không, U+2028) trong lệnh và đối số, và từ chối tên biến nạp mã (`LD_*`, `DYLD_*`, `PATH`, `NODE_OPTIONS`, `PYTHONPATH`, `BASH_ENV`, `IFS`...).
- **Tiến trình con:** môi trường rỗng cộng `PATH` và các tên biến người dùng liệt kê, thư mục làm việc là gốc repo, stderr bỏ, **nhóm tiến trình riêng và kill cả nhóm** khi đóng, khi quá hạn, và cả khi bắt tay thất bại (test: tiến trình cháu cũng chết, bắt tay thất bại không để lại tiến trình).
- **Giới hạn bộ nhớ:** rmcp mặc định cho khung dài `usize::MAX`. Stdout của server đi qua `BoundedReader` (một thông điệp tối đa 1 MiB, cả phiên tối đa 16 MiB), và việc liệt kê tool theo trang bị chặn (tối đa 10 trang, 200 tool). Kết quả một lần gọi cắt ở 64 KiB đúng ranh giới ký tự UTF-8. Có test: dòng không bao giờ xuống dòng, máy chủ phân trang vô tận, ký tự 3 byte ở ranh giới.
- **Thời gian:** khởi động và mỗi lần gọi đều có hạn `timeout_secs` (mặc định 30, tối đa 120), nên một lời gọi có thể mất tới khoảng gấp đôi cộng vài giây để dừng.
- **Kết quả không tin cậy:** liệt kê và kết quả đều qua `untrusted::guard`; lỗi từ server không được chép vào lỗi của mình; nội dung không phải văn bản chỉ được gọi tên.
- **Điều kiện nối vào chat (đã làm, mục 15 và 16):** hộp duyệt hiện nguyên dòng lệnh và người gọi truyền chính `Disclosure` đã duyệt vào `mcp_call`; `mcp-servers.json` cần xác nhận lần đầu (băm lưu ngoài repo).
- **Chưa kiểm chứng:** server MCP thật (chỉ có server giả bằng `sh` và server rmcp trong bộ nhớ), Windows (các test tiến trình là Unix), tiến trình con đổi nhóm tiến trình để thoát khỏi `killpg`, các biến nạp mã khác ngoài danh sách.

## 15. Xác nhận lần đầu cho cấu hình do repo cung cấp (kiểu `direnv allow`)

Trạng thái: **Implemented và Tested** (`src/capability/config_trust.rs`, lệnh `yana-rt trust`). Áp dụng cho `.yana-ai/web-search.json` và `.yana-ai/mcp-servers.json`.
- **Băm toàn bộ byte** của tệp (SHA-256), ghi trong một bản ghi theo từng repo (khóa theo băm đường dẫn chuẩn hóa của repo) **NGOÀI repo**: `$YANA_TRUST_DIR`, mặc định `$HOME/.yana-ai/trust/<profile>/` (profile từ `$YANA_PROFILE`, mặc định `default`; chưa nối với khái niệm profile của WS4 vì nhánh này chưa có). Đổi một byte (kể cả dấu xuống dòng cuối) thì phải xác nhận lại.
- **Chưa xác nhận thì không dùng:** `web_search()` và `disclose()` từ chối; `web_search` không xuất hiện trong danh mục công cụ của chat; `find_server` (nên cả `disclose` lẫn `mcp_call`) từ chối, nên không có chương trình nào khởi động. Mọi trạng thái bất thường đều là "không tin cậy": chưa có bản ghi, băm khác, bản ghi hỏng hoặc sai dạng, kho bị xóa, không có thư mục home, **kho nằm trong repo** (từ chối cả đọc lẫn ghi, vì một lần ghi vào repo có thể sửa nó). Tin cậy thuộc về một repo: cùng nội dung ở repo khác không được tin.
- **Chỉ người xác nhận được:** `yana-rt trust allow <web-search|mcp-servers>` yêu cầu stdin và stdout đều là terminal, in nguyên nội dung tệp (ký tự điều khiển thành `?`, quá 8 KiB thì từ chối) cùng băm, và phải gõ đúng `yes`. Chạy qua `run_command` (không có terminal) hay đưa `yes` qua ống đều bị từ chối và không ghi gì (đã chạy thử bằng tệp nhị phân thật). Các lệnh khác: `trust status`, `trust show`, `trust revoke`.
- **Lease gắn với cấu hình:** một lease được cấp cho cấu hình cũ không được áp dụng cho cấu hình mới. Thay vì sửa `src/runtime/authority.rs`, mỗi lần xác nhận một nội dung KHÁC bản ghi trước (hoặc chưa có bản ghi) thì mọi lease chưa thu hồi của capability tương ứng (`web.search` hoặc `mcp.call`) bị thu hồi; phải cấp lại. Lease của capability khác không bị đụng; xác nhận lại đúng nội dung cũ không đổi gì.
- **Agent không ghi được kho:** kho nằm ngoài repo nên `file.write`/`file.patch` (bị khóa trong gốc repo) không với tới; thêm vào đó nó từ chối nằm trong repo. `run_command` do người duyệt vẫn có thể ghi vào thư mục home; hàng rào ở đó là chính lời nhắc duyệt, và `trust allow` không chạy được nếu không có người.
- **Chưa kiểm chứng:** nhập bằng bàn phím thật qua terminal thật (em chỉ chạy được bản có ống; phần xác nhận được test bằng đầu vào/ra truyền vào); Windows (quyền tệp 0600 chỉ có trên Unix); chống hai tiến trình xác nhận cùng lúc (ghi bằng tệp tạm rồi đổi tên, không khóa).

## 16. `mcp_call` trong hộp duyệt của chat, và các sửa sau đánh giá

Trạng thái: **Implemented và Tested** (đường TUI và đường từ xa/lưu `runtime::pending_approval`). Danh mục công cụ của chat chỉ có `web_search` khi đã cấu hình **và** đã xác nhận, và chỉ có `mcp_call` khi có `.yana-ai/mcp-servers.json`, đã xác nhận, và bản build có `mcp`. `mcp_call` luôn cần người duyệt từng lần (không có nhánh lease trong chat).
- **TUI:** hộp duyệt hiện `run:` (nguyên dòng lệnh, đã quote), `env:` (tên biến), `call:` (server và tool), `args:` (đối số mô hình chọn, cắt 70 ký tự, ký tự điều khiển và vô hình thành `?`), theo đúng thứ tự đó (cái chạy trước, cái mô hình chọn sau cùng). Lúc bấm `y` cấu hình được tính lại và so với bản đã duyệt, rồi bản đã duyệt được truyền vào `mcp_call`, nơi đọc lại lần nữa và so một lần nữa. Khác bản đã duyệt thì không khởi động gì.
- **Đường từ xa:** lý do lưu kèm dòng lệnh, tên biến, hạn thời gian và đối số (cắt 200 ký tự, che ký tự lạ); khi tiếp tục, bản tóm tắt dựng lại từ cấu hình hiện tại phải là phần đuôi của lý do đã lưu. Cấu hình không công bố được thì lỗi, không bao giờ tạm dừng để duyệt mù. `arguments` không phải đối tượng JSON thì từ chối (giống TUI).
- **Hộp là lưới cố định:** mỗi phần cắt thành hàng đúng bằng bề rộng (không ngắt theo từ, không bị cắt cuối), hộp cao 12 hàng, đủ cho giá trị dài nhất mà cấu hình cho phép ở terminal tối thiểu 70 cột. Terminal nhỏ hơn thì hộp chỉ báo "quá nhỏ để hiện đầy đủ" và `y` bị từ chối (kiểm bằng kích thước terminal thật; nếu không đọc được kích thước thì không chặn). Để một ký tự đúng bằng một cột, lệnh, đối số và tên biến trong cấu hình chỉ được là ASCII in được (ký tự rộng, dấu, NBSP đều bị từ chối).
- **Các sửa sau đánh giá của code-auditor và security-auditor:**
  - Băm và phân tích **cùng một lần đọc** (`config_trust::read_config`/`trusted_bytes`): `find_server` và `web_search` phân tích đúng các byte đã được kiểm, không đọc lại.
  - Điều người dùng được xem và băm được ghi là **cùng byte**: `confirm_and_allow` ghi `allow_hash_in(..., hash đã hiện)`; tệp bị sửa trong lúc người đó đọc thì từ chối, không ghi gì (có test chèn việc ghi đè vào đúng lúc đọc câu trả lời).
  - Đọc tệp cấu hình có **chặn kích thước** (64 KiB) và chỉ chấp nhận tệp thường; FIFO hoặc thiết bị không làm treo, tệp quá lớn không được đọc hết vào bộ nhớ.
  - Màn hình duyệt che thêm ký tự vô hình và đảo chiều (U+202E, U+200B, U+2028, U+FEFF).
  - Thu hồi lease **trước** khi ghi bản ghi; lỗi của kho lease được trả về và chặn việc xác nhận (trước đó bị nuốt).
  - Mọi lệnh do agent chạy (`spawn_command`) mang biến `YANA_AGENT_CHILD=1`; `yana-rt trust allow` từ chối khi thấy nó. Đây chỉ là phòng thủ nhiều lớp: một lệnh có thể bỏ biến này, và có thể mở pty để vượt kiểm tra terminal. Hàng rào thật vẫn là mọi lệnh cần người duyệt, và hộp duyệt lệnh chỉ cao 5 hàng.
- **Rủi ro còn lại (đã biết, chưa sửa):** `run_command` được người duyệt vẫn có thể ghi thẳng vào kho tin cậy hoặc dựng pty để gõ `yes`; hộp duyệt `run_command` 5 hàng có thể che phần quan trọng của một dòng lệnh rất dài (không có giới hạn độ dài trong `validate_command`); lease không gắn với băm cấu hình (chỉ thu hồi khi nội dung xác nhận đổi); tệp `mcp-servers.json` lớn hơn 8 KiB không xem hết được nên không xác nhận được; repo nằm ngay trong `$HOME` không xác nhận được (kho nằm trong repo); đổi tên hoặc di chuyển repo làm mất tin cậy; người đang dùng `web_search` sẽ thấy công cụ biến mất cho tới khi chạy `yana-rt trust allow web-search` (chưa có thông báo trong chat).

## 11. Chưa kiểm chứng
Hành vi thật của `rmcp` client với server thật; cây phụ thuộc đầy đủ của `tokio-stream`; Windows (tiến trình con, kill); phát hiện injection ngoài các mẫu đã biết; đường truyền `duplex` có phản ánh đủ hành vi stdio thật hay không (sẽ thêm một test chạy tiến trình con thật bằng `sh`).
