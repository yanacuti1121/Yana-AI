# Yana Assistant: danh sách tính năng và hợp đồng vỏ / phần trong

Mục đích: anh Tâm muốn một trợ lý trong Yana Studio giống Codex (đọc, sửa code, chạy lệnh có duyệt, nhiều chế độ, nói chuyện bằng giọng nói, làm tài liệu văn phòng). Việc chia như sau:

- **Vỏ (Gemini / thiết kế):** toàn bộ giao diện và mọi trạng thái của nó.
- **Phần trong (Claude):** dữ liệu thật, runtime, an toàn, kiểm thử.

Cập nhật 2026-10-13. Nguồn sự thật về tình trạng là mã đã kiểm tra, không phải ảnh thiết kế.

## Luật chung (vỏ phải tuân thủ)

1. **Không có dữ liệu giả và nút giả.** Chỗ nào chưa có phần trong thì ghi "Not available yet" hoặc ẩn đi, không vẽ số liệu mẫu. Tình trạng từng tính năng nằm ở cột "Trạng thái" bên dưới.
2. **Mọi hành động làm thay đổi máy (ghi file, chạy lệnh) phải có người bấm duyệt.** Vỏ không được tự duyệt thay người dùng, không được có chế độ "tự duyệt hết" nếu phần trong không cung cấp lease tương ứng.
3. **Giao diện chỉ dùng tiếng Anh.** Tiếng Hàn và Việt dịch sau.
4. **Mỗi tính năng phải có đủ trạng thái:** trống, đang tải, lỗi (nói rõ lý do và cách sửa), thành công, bị vô hiệu (vì chưa tin cậy thư mục, thiếu key, thiếu runtime).
5. **Hiệu năng:** không vòng lặp chạy nền, không cập nhật theo từng token (gom 120 ms), không hoạt ảnh liên tục. Máy anh dễ nóng.
6. **Không bí mật trong webview.** API key không bao giờ về tới giao diện; chỉ có "đã lưu / chưa lưu".
7. Mọi chữ do model viết ra là **dữ liệu không tin cậy**: dựng bằng `textContent`, không `innerHTML`.

## Chú thích trạng thái

- **CÓ**: phần trong đã chạy và đã kiểm tra.
- **CÓ-MỘT-PHẦN**: có nhưng thiếu việc đã nêu.
- **CẦN-LÕI**: cần sửa runtime Rust (`yana-rt`) trước, vỏ chưa dùng được.
- **CẦN-EXT**: làm được ở phía tiện ích, không cần sửa Rust.
- **CHƯA**: chưa có gì.

## Hợp đồng dữ liệu hiện có giữa khung chat và tiện ích

Khung chat (`media/panel.js`) và tiện ích nói chuyện bằng `postMessage`.

**Webview gửi lên tiện ích:** `ready`, `send {text, images}`, `stop`, `reset`, `history`, `decide {approvalId, decision}`, `pickModel`, `setKey`, `settings`, `home`, `openSettings`.

**Tiện ích gửi xuống webview:**
- `state` (runtime, model, thư mục, token).
- `event {event}`: chuyển tiếp nguyên sự kiện của runtime (xem bên dưới).
- `intent {text, at, images}`, `conversation {title, messages}`, `prefill {text}`, `attachImage`, `insertText`.

**Sự kiện runtime (`yana-rt chat --headless`, mỗi dòng một JSON):**
- `text_delta {text}`, `metrics {input_tokens, output_tokens, cache_read_tokens, cache_write_tokens}`.
- `runtime_event {kind}` với kind ∈ `tool_requested`, `tool_approved`, `tool_denied {reason}`, `human_approval_required`, `tool_started`, `tool_completed {ok, denied}`, `turn_completed {tool_rounds}`.
- `awaiting_approval {approval_id, capability, expires_at, reason}` (lượt dừng, chờ người duyệt, hết hạn sau 30 phút).
- `authority_denied {authority, reason}`, `cancelled {partial}`, `error {message}`, `completed {message}`.

**Thêm ngày 2026-10-13 (cần yana-rt ≥ 1.5.1 bản mới build; bản cài sẵn 1.5.0 chưa có):**
- `human_approval_required` cho `write_file`/`write_config` có `summary` = "Writing: <path>" và `preview`:
  `{ path, kind: "create"|"overwrite"|"patch", existed_before, before_sha256, after_bytes, additions, deletions, lines: ["- cũ", "+ mới", "  ngữ cảnh", "  …"], truncated, edits?: [{ match: "exact"|"trailing_space"|"trimmed", replacements }] }` (`edits` chỉ có với `patch`; `match` khác `exact` nghĩa là khớp có bỏ qua khoảng trắng, nên hiện cho người duyệt thấy),
  hoặc `{ path?, error }` khi yêu cầu không thể áp dụng (đường dẫn ra ngoài dự án, file đã tồn tại khi `create`, thiếu thư mục cha, quá lớn). Các tool khác không có `preview`.
- `tool_completed` của `write_file`/`write_config`/`patch_file` có thêm `tool` và `summary`. Với `patch_file`, `summary` bắt đầu bằng `patched <path>`; một sửa không khớp trả `ok: false` và **không ghi gì**.
- Giao diện phải xử lý được cả khi runtime cũ không gửi các trường này (bỏ qua, như trước).

**Công cụ model dùng được** (đọc từ `yana-rt capability list`):

| Tool | Quyền | Duyệt |
|---|---|---|
| `repo_tree`, `read_file`, `search_code` | chỉ đọc | không |
| `git_status`, `git_diff`, `host_summary`, `list_processes`, `process_details`, `validate_command` | chỉ đọc | không |
| `run_command` | ghi | **người duyệt từng lần** |
| `write_file` | ghi (tạo hoặc ghi đè một file) | **người duyệt từng lần**, tự sao lưu trước khi ghi đè, kiểm tra băm sau khi ghi |
| `write_config` | ghi (chỉ `core/config/*.json`) | người duyệt từng lần |
| `patch_file` | ghi (sửa file có sẵn bằng các cặp tìm-và-thay `edits: [{old, new, replace_all?}]`) | **người duyệt từng lần**, sao lưu, kiểm băm. Khớp chính xác trước, rồi bỏ khoảng trắng cuối dòng, rồi bỏ thụt lề; nhiều hơn một chỗ khớp thì từ chối (trừ `replace_all`) |

**Lưu ý:** danh mục công cụ mà model được trao trong chat (đã đọc `src/chat/tools/mod.rs`) là `read_file`, `run_command`, `write_file`, `write_config`, `patch_file`, cộng `web_search`, `mcp_call`, `lsp_query` khi người dùng đã cấu hình. **Từ 2026-10-14, `repo_tree`, `search_code`, `git_status`, `git_diff` cũng được trao cho model** (chỉ đọc, không cần duyệt). Mục E5 bên dưới.

## Danh sách tính năng

### A. Hội thoại cốt lõi

| ID | Tính năng | Vỏ làm gì | Phần trong làm gì | Trạng thái |
|---|---|---|---|---|
| A1 | Gửi tin, trả lời phát trực tiếp | Ô nhập, nút Send/Stop, hiển thị Markdown, cuộn | `send`, `stop`, sự kiện `text_delta` | CÓ |
| A2 | Nhiều hội thoại, lịch sử | Danh sách, mở lại, đổi tên, xoá, tìm | Lưu theo thư mục dự án, tối đa 100 hội thoại, 400 tin mỗi hội thoại | CÓ (đã có test) |
| A3 | Tiêu đề tự đặt bằng model nhỏ | Hiện tiêu đề, cho sửa tay | Hiện lấy 45 ký tự đầu. Cần chạy một lượt model nhỏ ở nền | CHƯA |
| A4 | Ảnh đính kèm, kéo thả file | Ô đính kèm, xem trước, xoá | `payload.images` đã gửi lên runtime. Chưa kiểm tra runtime đọc ảnh đúng | CÓ-MỘT-PHẦN |
| A5 | Đồng hồ token của hội thoại | Hiện số vào/ra | `metrics` đã có. Chưa có giá tiền | CÓ-MỘT-PHẦN |
| A6 | Xuất hội thoại ra file | Nút Export | Ghi Markdown ra nơi người dùng chọn (hộp thoại lưu = đồng ý) | CHƯA (CẦN-EXT) |
| A7 | Hội thoại chạy nền, nhiều hội thoại cùng lúc | Chấm trạng thái ở danh sách | Hiện chỉ một lượt chạy tại một thời điểm | CHƯA |

### B. Hành động cần duyệt (cổng Yana)

| ID | Tính năng | Vỏ | Phần trong | Trạng thái |
|---|---|---|---|---|
| B1 | Thẻ chờ duyệt | Hiện tên công cụ, **nội dung sẽ làm**, nút Approve/Deny, đếm ngược hết hạn | `awaiting_approval` + `decide`. **Đã sửa 2026-10-13:** sự kiện `human_approval_required` của `write_file`/`write_config` giờ có `summary` ("Writing: <path>") và `preview` (xem bên dưới). Giao diện đã đọc `preview`; **chưa xem trong cửa sổ app thật** (cần một lượt chat thật) | CÓ-MỘT-PHẦN |
| B2 | Hiện thay đổi trước khi duyệt (diff) | Thẻ diff: +/- dòng, tên file, thống kê | Có (`preview.lines/additions/deletions`, rút gọn quanh dòng đổi, tối đa 200 dòng, dòng giống bí mật bị che). Đã thử đầu-cuối với model thật | CÓ-MỘT-PHẦN |
| B3 | Kết quả sau khi ghi | Hiện "Applied", đường dẫn, số byte, bản sao lưu | `tool_completed` của file ghi giờ có `tool` và `summary` ("wrote <path> (<n> bytes, sha256 ...), backup at ..."). Lệnh khác không gửi kết quả | CÓ-MỘT-PHẦN |
| B4 | Hoàn tác / khôi phục bản sao lưu | Nút Undo trên thẻ | Runtime đã sao lưu trước khi ghi đè. Cần đường đọc danh sách bản sao lưu và khôi phục | CẦN-LÕI |
| B5 | Danh sách lệnh đang chờ duyệt, lease | Màn Permissions | `authority pending-approvals`, `lease list/grant/revoke` | CÓ |
| B6 | Nhật ký kiểm toán | Màn xem, lọc ALLOW/DENY/WARN, xuất | `.claude/state/audit-chain.log` (chuỗi băm). Chưa có màn xem | CÓ-MỘT-PHẦN |
| B7 | Từ chối kèm lý do gửi lại cho model | Ô lý do khi Deny | Hiện `decide` chỉ có true/false | CẦN-LÕI |

### C. Sửa code

| ID | Tính năng | Vỏ | Phần trong | Trạng thái |
|---|---|---|---|---|
| C1 | Model đề xuất sửa file và người duyệt | Thẻ diff + Apply/Reject (xem B1-B3) | Dùng `write_file` của runtime, **không làm đường ghi riêng ở tiện ích**. `write_file` thay **toàn bộ nội dung** (tối đa 256KB, không tự tạo thư mục cha). **Từ 2026-10-13 có thêm `patch_file`** (sửa theo kiểu tìm-và-thay, không phải gửi lại cả file; đi qua đúng đường duyệt, sao lưu, kiểm băm). Đã thử đầu-cuối với model thật 3/3 lần. Chưa thấy trong cửa sổ app thật | CÓ-MỘT-PHẦN |
| C2 | Mở diff song song trong IDE | Nút "Review diff" | Mở trình so sánh của VS Code | CẦN-EXT, sau C1 |
| C3 | Sửa nhiều file một lượt, duyệt từng file hoặc cả lượt | Danh sách file thay đổi + chọn | Gom các `write_file` của một lượt | CHƯA |
| C4 | Điểm lưu (checkpoint) trước mỗi lượt, quay lại | Mốc thời gian, nút Restore | Dựa vào bản sao lưu của runtime và git | CHƯA |
| C5 | Kết quả kiểm tra và lỗi hiện ở bảng Problems | (dùng bảng sẵn có của IDE) | Đưa kết quả `hunt/scan` vào Problems | CHƯA |

### D. Chế độ làm việc và tinh chỉnh

| ID | Tính năng | Vỏ | Phần trong | Trạng thái |
|---|---|---|---|---|
| D1 | Chế độ: Plan (chỉ lập kế hoạch), Act, Careful | Bộ chọn chế độ ở khung chat, mô tả từng chế độ | Plan: chặn công cụ ghi. Cần cờ ở runtime. Act: như hiện nay | CẦN-LÕI |
| D2 | Mức suy luận (reasoning effort) cho Claude và GPT | Bộ chọn low/medium/high | Đã kiểm tra mã: runtime **không có** tham số suy luận cho bất kỳ nhà cung cấp nào (không có `reasoning`, `thinking` trong `src/chat/*` và `src/model/provider.rs`) | CẦN-LÕI |
| D3 | Nhiệt độ, số token tối đa | Thanh trượt, ô số | Không có tham số nhiệt độ. **Số token trả lời tối đa của Claude cố định 4.096** (`src/chat/anthropic.rs:22`), thấp cho việc viết code, nên cần làm chỉnh được | CẦN-LÕI |
| D4 | Mẫu cài sẵn (preset) lưu theo tên | Danh sách preset, tạo, sửa, xoá | Lưu trong cài đặt IDE | CẦN-EXT, sau D1-D3 |
| D5 | Chỉnh system prompt, luật dự án (AGENTS.md, Project Memory) | Trình sửa với xem trước | Project Memory đã có. Chụp một lần khi bắt đầu hội thoại | CÓ-MỘT-PHẦN |
| D6 | Auto model, Mixture of Agents trong chat | Hiện model nào được chọn và vì sao | Cài đặt lưu được, nhưng chưa dùng cho chat (cố tình từ chối lưu `auto`) | CÓ-MỘT-PHẦN |

### E. Ngữ cảnh

| ID | Tính năng | Vỏ | Phần trong | Trạng thái |
|---|---|---|---|---|
| E1 | `@file`, `@folder`, `@git diff` | Gõ `@` ra danh sách gợi ý | Gợi ý bằng `repo_tree` và `search_code`. Đưa nội dung vào tin (có giới hạn kích thước) | CHƯA (CẦN-EXT) |
| E2 | Thanh ngữ cảnh: đã dùng bao nhiêu / giới hạn | Thanh hiển thị, cảnh báo gần đầy | Cần biết giới hạn từng model (danh mục có `context`) | CÓ-MỘT-PHẦN |
| E3 | Nén ngữ cảnh khi dài | Thông báo "đã nén N tin" | Runtime chưa có bước nén | CHƯA |
| E4 | Tìm trong hội thoại cũ | Ô tìm | Tìm trong kho hội thoại đã lưu | CHƯA (CẦN-EXT) |
| E5 | Model tự xem cấu trúc dự án và tìm trong mã mà không cần xin duyệt | (không có giao diện riêng, thấy ở dòng vết công cụ) | Đã trao `repo_tree`, `search_code`, `git_status`, `git_diff` (chỉ đọc, không cần duyệt) vào danh mục chat và bộ thực thi (`src/chat/tools/mod.rs`, `tool_dispatch.rs`, `read_only_result`). Đã có test đơn vị; **chưa thử với model thật** (cần yana-rt build mới và Ollama hoặc key cloud) | XONG (chưa thử model thật) |

### F. Giọng nói

| ID | Tính năng | Vỏ | Phần trong | Trạng thái |
|---|---|---|---|---|
| F1 | Bấm giữ để nói, thả để gửi | Nút micro, biểu tượng đang ghi, **chỉ báo riêng tư rõ ràng** khi micro đang bật | Webview của VS Code không tự dùng được micro, nên ghi âm phải làm ở phía tiện ích (công cụ dòng lệnh như `sox`) | CHƯA |
| F2 | Chuyển giọng thành chữ | Hiện chữ vừa nghe trong ô nhập để người dùng sửa **trước khi gửi** | Hai đường: đám mây (OpenAI, **âm thanh đi ra ngoài**) hoặc whisper.cpp tại máy (riêng tư, nặng máy). Người dùng chọn | CHƯA |
| F3 | Đọc to câu trả lời | Nút loa, dừng, tốc độ | `say` của macOS (tại máy) hoặc API đám mây | CHƯA |
| F4 | Cài đặt giọng nói | Chọn đám mây hay tại máy, chọn micro, ngôn ngữ, thử | Lưu cài đặt, kiểm tra thiết bị | CHƯA |
| F5 | Thoại hai chiều thời gian thực | (để sau) | Codex mới có nền móng (`voice-host`), chưa dùng được | CHƯA, để sau |

### G. Nhiệm vụ dài và kế hoạch

| ID | Tính năng | Vỏ | Phần trong | Trạng thái |
|---|---|---|---|---|
| G1 | Bảng Tasks có phụ thuộc, bằng chứng khi xong | Màn Tasks | `yana-rt task *` | CÓ |
| G2 | Kế hoạch của trợ lý hiển thị như danh sách bước, tích dần | Thẻ kế hoạch trong chat | Cần chế độ Plan (D1) và gắn bước với task | CHƯA |
| G3 | Chạy nhiều bước tự động có điểm dừng để duyệt | Thanh tiến độ, nút Pause/Stop | Vòng lặp công cụ của runtime đã có | CÓ-MỘT-PHẦN |
| G4 | Giao thiết kế Canvas cho trợ lý làm thành code | Nút "Build this screen" trên Canvas | Gửi HTML của màn hình sang chat kèm hướng dẫn, qua C1 | CHƯA (cần C1) |

### H. Tài liệu văn phòng

| ID | Tính năng | Vỏ | Phần trong | Trạng thái |
|---|---|---|---|---|
| H1 | Slide từ Markdown, xem trước, xuất PDF/PPTX | Màn xem slide + nút Export | Marp (MIT). Cần kiểm tra gói theo luật chuỗi cung ứng trước khi cài | CHƯA |
| H2 | Tài liệu và báo cáo PDF | Xem trước, Export | Typst (Apache-2.0). Chưa tìm đúng gói tiện ích | CHƯA |
| H3 | File PowerPoint thật | Export .pptx | PptxGenJS (MIT) | CHƯA |
| H4 | Word, Excel | Export .docx/.xlsx | **Chưa tìm và chưa kiểm tra thư viện nào** | CHƯA |
| H5 | AI dựng cả bộ slide | Màn "Generate deck" | Presenton (Apache-2.0) nặng: cần Docker và cơ sở dữ liệu. Để sau | CHƯA, để sau |

Luật cho H: AI chỉ viết nội dung vào thư mục dự án hoặc thư mục tạm; xuất ra ngoài chỉ khi người dùng chọn nơi lưu.

### I. Model và khoá

| ID | Tính năng | Vỏ | Phần trong | Trạng thái |
|---|---|---|---|---|
| I1 | Chọn nhà cung cấp và model (41 nhà cung cấp) | Bảng chọn, nhóm cloud và local | Danh mục trong `host/model-catalog.cjs` | CÓ |
| I2 | Lưu key vào Keychain, xoá key | Nút Key, nhãn "key saved" | `SecretStorage`. Key không về webview | CÓ |
| I3 | Lấy danh sách model thật sau khi lưu key | Danh sách "from your account" | `discoverModels`. Chưa thử với key thật | CÓ-MỘT-PHẦN |
| I4 | Quét máy chủ local (Ollama, LM Studio...) | Thẻ trạng thái | `inspectLocalModels` | CÓ |
| I5 | Dùng gói thuê bao ChatGPT/Claude để đăng nhập | **Không làm.** Đã chốt: Anthropic chặn, OpenAI rủi ro khoá tài khoản. Chỉ dùng API key | | KHÔNG LÀM |

### J. Chạy lệnh, kiểm tra, quan sát

| ID | Tính năng | Vỏ | Phần trong | Trạng thái |
|---|---|---|---|---|
| J1 | Lệnh ghim, chạy bằng một nút | Danh sách | `.yana-ai/studio-run-commands.json` | CÓ |
| J2 | Doctor, Scan, Hunt, Score, Map, CI, Cost | Màn kết quả có định dạng thay cho terminal | `yana-rt doctor/scan/hunt/...`. Hiện chỉ chạy trong terminal | CÓ-MỘT-PHẦN |
| J3 | Thống kê token và chi phí | Màn Usage | `usage.js` (token do nhà cung cấp báo). Chưa có giá tiền | CÓ-MỘT-PHẦN |
| J4 | Trạng thái thời gian thực (runtime, thư mục tin cậy, key) | Thanh trạng thái | Kênh `changes.js` đã có (cấu hình, key, tin cậy, task, lease, token) | CÓ |

### K. Đã chốt: an toàn và riêng tư

| ID | Quy tắc | Ghi chú |
|---|---|---|
| K1 | Thư mục chưa tin cậy: vô hiệu mọi thao tác chạy và ghi | `vscode.workspace.isTrusted` |
| K2 | File được bảo vệ, model không sửa được: `.env*`, khoá (`*.pem`, `*.key`), `.git/`, `.ssh/`, `.claude/`, `core/rules|hooks|gates|scripts/`, `node_modules/` | Phía runtime phải chặn cả hai lớp |
| K3 | Thu thập số liệu của bên thứ ba phải tắt mặc định | Đặc biệt khi gắn tiện ích ngoài (đã quyết **không** gắn Cline nguyên bản vì nó có PostHog/OpenTelemetry riêng và đi vòng cổng duyệt) |
| K4 | Giọng nói: luôn có chỉ báo khi micro bật, và nói rõ âm thanh có rời máy hay không | Quy tắc bảo mật thông tin chủ sở hữu (68) |
| K5 | Không cài gói mới khi chưa qua báo cáo kiểm tra chuỗi cung ứng và người dùng xác nhận | Luật dependency-vetting |

## Thứ tự phần trong (Claude) làm

1. **Lõi Rust:** B1-B3 (gửi đường dẫn và diff kèm sự kiện duyệt; kết quả sau ghi). Mở khoá C1, C2, B4, G4.
2. **Chế độ và tham số model:** D1-D3 (cần runtime gửi `reasoning_effort`, nhiệt độ, `max_tokens`; chế độ Plan chặn công cụ ghi).
3. **Ngữ cảnh `@`:** E1.
4. **Giọng nói:** F1-F4 (người dùng cần chọn đám mây hay tại máy).
5. **Văn phòng:** H1, H2 (kiểm tra gói trước).

Mỗi mục: viết, chạy test, mở cửa sổ app thật và chụp, rồi mới báo xong.

## Việc vỏ (Gemini) có thể làm ngay, không phụ thuộc phần trong

- Thẻ diff có Apply/Reject, thẻ chờ duyệt có đếm ngược: dựng theo dữ liệu mẫu **chỉ trong môi trường thử**, không đưa dữ liệu mẫu vào bản dùng.
- Bộ chọn chế độ, thanh trượt tham số, nút micro, chỉ báo riêng tư, nút Export: dựng sẵn, **ẩn đến khi phần trong báo sẵn sàng** (cờ `capabilities` trong thông điệp `state`, phần trong sẽ thêm).
- Màn xem nhật ký kiểm toán, màn xem kết quả Doctor/Scan.

Mọi thay đổi vỏ phải giữ nguyên tên thông điệp ở mục "Hợp đồng dữ liệu hiện có"; thông điệp mới thì ghi vào tệp này trước khi dùng.

---

## L. Tạo và quản lý trợ lý (hồ sơ trợ lý)

Người dùng tạo nhiều "trợ lý" với cấu hình riêng (ví dụ "Người rà soát cẩn thận" dùng Claude, "Viết nhanh" dùng GPT nhỏ), chọn một trợ lý cho khung chat, chạy thật. Mỗi hồ sơ chỉ lưu cấu hình, không lưu bí mật. API key vẫn nằm ở Keychain theo nhà cung cấp.

**Dạng dữ liệu** (extension lưu ở `globalState`, khoá `yana.assistants.v1`, tối đa 30 hồ sơ, validate phía extension):

```json
{
  "id": "uuid",
  "name": "Careful reviewer",
  "description": "Plans first, asks before every change",
  "provider": "anthropic",
  "model": "claude-...",
  "mode": "plan",
  "params": { "reasoningEffort": null, "temperature": null, "maxTokens": null },
  "instructions": "text appended to the system prompt, up to 8000 characters",
  "tools": { "write": true, "run": true },
  "voice": { "input": "off", "output": "off" }
}
```

**Trường nào là thật ngay bây giờ (đã kiểm tra mã) và trường nào chưa:**

| Trường | Hôm nay | Cần gì |
|---|---|---|
| `name`, `description`, `provider`, `model` | Thật: dùng cho `yana.provider` và `yana.model` | Không |
| `instructions` | Thật nhưng **chỉ có hiệu lực từ lúc bắt đầu hội thoại** (system prompt chụp một lần để giữ prompt cache). Đổi trợ lý giữa chừng = phải mở hội thoại mới, giao diện phải nói rõ | Không |
| `mode` (plan/act/careful) | **Chưa thật.** Plan cần runtime chặn công cụ ghi | Sửa Rust (D1) |
| `params.reasoningEffort`, `temperature` | **Chưa thật.** Runtime không có tham số này | Sửa Rust (D2, D3) |
| `params.maxTokens` | **Chưa thật.** Claude đang cố định 4.096 | Sửa Rust (D3) |
| `tools.write`, `tools.run` | **Chưa thật.** Chưa có danh sách cho phép công cụ theo từng lượt | Sửa Rust |
| `voice.*` | **Chưa thật** | Phần giọng nói (F) |

**Việc của vỏ (Gemini):** màn danh sách trợ lý (tạo, nhân bản, sửa, xoá, chọn), biểu mẫu tạo/sửa, bộ chọn trợ lý ở khung chat. Các trường "chưa thật" phải **hiện nhưng bị vô hiệu kèm chữ "Not available yet"**, bật lên khi cờ `capabilities` tương ứng là `true` (xem mục N). Không cho lưu giá trị mà phần trong chưa dùng được.

**Việc của phần trong (Claude):** lưu và kiểm tra hồ sơ, áp dụng vào lượt chat, phát cờ, và từng bước nối các trường còn lại sau khi sửa Rust. Trạng thái: **CHƯA** (hồ sơ chưa tồn tại; cần quyết định có dùng chung preset D4).

---

## M. Phụ thuộc: cái gì mở khoá cái gì

```
yana-rt (Rust) ──► file.patch vào chat ─► C1 sửa file bằng patch ─► G4 Canvas → code
              ├──► D1-D3 chế độ/tham số ─► L (các trường mode, params, tools thật)
              └──► (đã xong) B1-B3 duyệt có diff
extension ─────► E1 @mention
              ├──► F1-F4 giọng nói (cần quyết: đám mây hay tại máy)
              ├──► H1-H2 Marp, Typst (cần anh xác nhận gói)
              └──► L lưu hồ sơ trợ lý, cờ capabilities
```

Gemini không phải chờ các mũi tên: dựng vỏ cho từng mục, ẩn bằng cờ.

---

## N. Hợp đồng thông điệp MỚI (đề xuất, vỏ có thể code theo từ bây giờ)

Đây là thông điệp **chưa tồn tại** ở extension. Claude sẽ cài đặt đúng tên và dạng dưới đây; Gemini dựng giao diện theo đó. Muốn đổi tên hay dạng thì sửa tài liệu này trước.

**Cờ khả năng.** Extension thêm `capabilities` vào thông điệp `state` đang có. Giao diện **chỉ hiện điều khiển khi cờ là `true`**:

```json
"capabilities": {
  "approvalPreview": true,
  "filePatch": false,
  "modes": false,
  "reasoningEffort": false,
  "temperature": false,
  "maxTokens": false,
  "toolAllowlist": false,
  "mentions": false,
  "assistants": true,
  "voice": { "input": false, "output": false },
  "office": { "slides": false, "pdf": false }
}
```

`approvalPreview` = `true` khi yana-rt từ 1.5.1 trở lên (có `preview` trong sự kiện duyệt).

**Webview → extension:**

| Thông điệp | Dạng | Ý nghĩa |
|---|---|---|
| `assistants.list` | `{}` | Xin danh sách hồ sơ |
| `assistants.save` | `{ assistant }` | Tạo hoặc sửa (có `id` là sửa). Extension kiểm tra và trả lỗi từng trường |
| `assistants.delete` | `{ id }` | Xoá |
| `assistants.select` | `{ id }` | Chọn trợ lý cho khung chat |
| `mention.query` | `{ text }` | Gõ `@xyz`: xin gợi ý file/thư mục |
| `voice.start` / `voice.stop` | `{}` | Bấm giữ để nói, thả để dừng |
| `voice.speak` | `{ messageId }` | Đọc to một câu trả lời |
| `office.export` | `{ kind: "slides"\|"pdf", source }` | Xuất tài liệu (người dùng chọn nơi lưu) |

**Extension → webview:**

| Thông điệp | Dạng | Ý nghĩa |
|---|---|---|
| `assistants` | `{ items, selectedId }` | Danh sách hồ sơ |
| `assistants.result` | `{ ok, id?, errors? }` | Kết quả lưu/xoá, `errors` = `{ field: "lý do" }` |
| `mentions` | `{ query, items: [{ kind: "file"\|"folder"\|"diff", label, path }] }` | Gợi ý |
| `voice.state` | `{ phase: "idle"\|"recording"\|"transcribing"\|"speaking", cloud: bool, error? }` | `cloud: true` = âm thanh đang rời máy (phải hiện chỉ báo rõ) |
| `voice.transcript` | `{ text }` | Chữ vừa nghe, đưa vào ô nhập để người dùng sửa **trước khi gửi** |
| `office.result` | `{ ok, path?, error? }` | Kết quả xuất |

Mọi thông điệp có thể kèm `error` ngắn gọn (một câu, nói cách sửa), giao diện hiện nguyên văn.

---

## O. Cách hai bên làm việc cùng một repo mà không giẫm chân

1. **Gemini sở hữu:** giao diện và kiểu dáng (`media/*.css`), bố cục, thành phần giao diện mới. Hãy đặt thành phần mới vào **file riêng** trong `media/` (ví dụ `media/assistants.js`, `media/voice.js`) thay vì dồn vào `panel.js` (hiện trên 500 dòng, vượt giới hạn 300).
2. **Claude sở hữu:** `extension.js`, `features/*`, `host/*`, giao thức thông điệp, mã Rust (`src/`), kiểm thử, kiểm tra an toàn.
3. **Chỗ chung duy nhất** là `panel.js` và `panel.css`: chỉnh nhỏ, rõ ràng, không viết lại cả file. Em đã dùng cách thêm hàm riêng và nối đúng một dòng.
4. **Không đổi tên thông điệp đang có** (mục "Hợp đồng dữ liệu hiện có") mà không ghi vào tài liệu trước.
5. **Không commit, không push** nếu anh Tâm chưa bảo.
6. **Báo "xong" chỉ khi đã nhìn cửa sổ app thật** (không chỉ trang thử trong trình duyệt): `screencapture -x -l <id cửa sổ> file.png`. Hồ sơ sạch `--user-data-dir test-profile-N` để thấy màn khởi động.
7. Sau **mỗi** lần build lại giao diện hoặc sửa tiện ích, kiểm tra lại các màn cũ (đã từng hỏng Settings vì build thêm màn mới).

---

## P. Việc còn lại, theo bên

### Claude (phần trong)
1. Nối `file.patch` vào chat (cần anh Tâm đồng ý, liên quan quyền hạn). Mở khoá C1, G4.
2. D1-D3: chế độ Plan/Act/Careful, mức suy luận, nhiệt độ, số token tối đa, danh sách công cụ cho phép (sửa Rust).
3. L: lưu và kiểm tra hồ sơ trợ lý, thông điệp `assistants.*`, cờ `capabilities`.
4. E1: `@file`, `@folder`, `@git diff`.
5. F1-F4: giọng nói (cần anh Tâm chọn đám mây hay chạy trên máy).
6. H1-H2: slide Marp, PDF Typst (cần anh Tâm xác nhận gói; Word/Excel chưa tìm thư viện).
7. G4 nút giao thiết kế Canvas cho trợ lý làm thành code (sau 1).
8. Việc nhỏ: A3 tiêu đề hội thoại do model nhỏ đặt, A6 xuất hội thoại, B4 hoàn tác từ bản sao lưu, B7 lý do khi Deny, C3 sửa nhiều file, C4 điểm lưu, C5 kết quả quét vào bảng Problems, J2 kết quả Doctor/Scan định dạng đẹp.
9. Phát hành: yana-rt 1.5.1 (bản cài sẵn 1.5.0 chưa có phần xem trước), biểu tượng app vào repo, đóng gói và ký, tự cập nhật.
10. Chưa kiểm tra bao giờ: chat và Canvas với model cloud thật, lấy danh sách model thật sau khi nhập key, Hunt.

### Gemini (vỏ)
1. Thẻ duyệt: đồng hồ đếm ngược (đã làm), thẻ diff Apply/Reject (đã đọc `preview`); thêm lý do khi Deny (cần B7), nút Undo (cần B4).
2. Màn **danh sách và biểu mẫu trợ lý** (mục L), bộ chọn trợ lý ở khung chat.
3. Bộ chọn chế độ, thanh tham số suy luận/nhiệt độ/token, danh sách công cụ cho phép: dựng sẵn, ẩn bằng cờ.
4. Gợi ý `@` trong ô nhập.
5. Nút micro, trạng thái đang ghi, **chỉ báo riêng tư rõ ràng** (âm thanh có rời máy hay không), chữ vừa nghe sửa được trước khi gửi, nút đọc to.
6. Màn xem slide/PDF và nút Export.
7. Màn nhật ký kiểm toán (lọc ALLOW/DENY/WARN, xuất), màn kết quả Doctor/Scan.
8. Canvas: màu tối cho Canvas cũ, nút "Build this screen".
9. Dọn: `panel.js` trên 500 dòng, tách thành file riêng.

### Anh Tâm (cần quyết hoặc làm)
1. Đồng ý nối `file.patch`.
2. Giọng nói: đám mây hay chạy trên máy.
3. Xác nhận gói Marp (đã tải, mã băm khớp, chưa cài); cho phép xoá bản cũ lỗi ở `test-exts`; giữ hay xoá file đề xuất sửa ở phía tiện ích em đã gỡ khỏi chat.
4. Thử thẻ duyệt trong app thật (nạp lại cửa sổ, bật Ollama, gửi một yêu cầu ghi file).
5. Khi nào cài yana-rt mới, khi nào commit (hiện hơn 170 thay đổi chưa có trong git).
6. Dán API key để thử với model cloud (máy chưa có key nào).
