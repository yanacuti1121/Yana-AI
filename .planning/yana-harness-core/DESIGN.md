# Yana Harness Core: thiết kế

**Trạng thái:** DRAFT, chờ chủ dự án duyệt. Chưa có dòng code nào.
**Phạm vi:** một tính năng của lõi `yana-rt` (Rust), không phải skill.
**Nguồn tham khảo (chỉ học ý, viết lại độc lập):**
`NousResearch/hermes-agent` (`agent/curator.py`, MIT), `revfactory/harness` (skill `harness` và `evolve`, Apache-2.0),
`google-research/harness2` (Apache-2.0).

## 1. Vấn đề

Bộ agent, skill và quy tắc của Yana đang được giữ bằng lời dặn và con người nhớ:

- Skill `revfactory--harness` trong `core/skills/` là bản tóm tắt 2 KB, còn dạy `TeamCreate` (API upstream đã bỏ); ghi giấy phép MIT trong khi upstream là Apache-2.0. Ba skill khác cũng còn nhắc `TeamCreate`.
- `subagent-policy.md` quy định subagent chỉ đọc, nhưng nhiều file agent review khai báo quyền `Write, Edit`. Không có kiểm tra tự động nào bắt lệch này.
- Skill không dùng nữa nằm lại mãi; chưa có cách đưa chúng vào kho lưu trữ có thể khôi phục.
- Mọi thay đổi harness hiện là sửa tay, không có sổ lý do, không có kiểm tra "thay đổi này có đảo ngược lần sửa trước không".

## 2. Học gì, tránh gì

| Nguồn | Lấy điểm mạnh | Tránh điểm yếu |
|---|---|---|
| Hermes curator | Vòng đời skill (active, stale, archived); không bao giờ xoá, chỉ lưu trữ khôi phục được; skill ghim không bị đụng; trạng thái lưu bền | Agent phụ tự vá hoặc gộp skill không qua người duyệt; gắn với thời gian chạy của agent Python |
| Harness (revfactory) | Bước 0 đối chiếu thực tế với ghi chú; phát hiện API chết; agent chỉ đọc thì không có Edit/Write; chọn model theo tính chất việc; `evolve`: khái quát hoá phản hồi, ghi lý do, mỗi lần một thay đổi, chặn thay đổi đảo ngược, bảng lịch sử | Toàn bộ là văn bản dặn dò, không có gì kiểm tra; số liệu cải thiện do tác giả tự đo; sinh hàng loạt file |
| Harness² | Mỗi bản sửa kèm bằng chứng; bài học có cue, nội dung và bằng chứng | Tự sửa cả guardrails; mạng không hạn chế, Codex tắt sandbox; tốn tiền API; không có người duyệt |

## 3. Bất biến an toàn

Mọi bất biến có test riêng. Vi phạm một cái thì tính năng không được merge.

- **I1. Lõi không gọi mô hình.** Phần "nghĩ ra đề xuất" do agent trong phiên làm. Lõi chỉ kiểm tra, ghi sổ và áp dụng.
- **I2. Không tự áp dụng nội dung.** Mọi sửa nội dung là một đề xuất, và chỉ người chạy `harness apply` trên terminal mới áp dụng. Việc tự động chỉ được đi theo hướng thu hẹp (đánh dấu stale, hạ bậc, báo cáo), giống `skill_quality.rs` đang làm.
- **I3. Vùng cấm sửa.** Đề xuất chạm vào các đường dẫn sau bị từ chối ở bước kiểm tra, không có cờ ghi đè: `src/guard/`, `core/hooks/`, `core/gates/`, `core/config/core-lock.json`, quy tắc Tier 0 và Tier 1, cấu hình hook trong `.claude/settings.json`, file `.env*`, và chính `src/harness/`. Danh sách nằm ở một nơi duy nhất (`protected.rs`).
- **I4. Không xoá.** "Gỡ" nghĩa là chuyển vào `.yana-ai/harness/archive/` kèm manifest sha256; `restore` đưa về đúng chỗ cũ.
- **I5. Một lần một thay đổi,** có lý do, có liên kết bằng chứng, ghi vào sổ thay đổi và chuỗi audit băm.
- **I6. Không mạng.** Chỉ đọc và ghi trong workspace, đường dẫn đi qua `capability::resolve_existing` (Gate L5).
- **I7. Chặn đảo ngược.** Đề xuất làm ngược lại một thay đổi đã áp dụng thì bị gắn cờ xung đột và người phải quyết rõ.
- **I8. Quyền ghi đi qua chuỗi thẩm quyền hiện có** (`RuntimeAuthority`, lease). Qua MCP chỉ lộ phần chỉ đọc và phần tạo đề xuất; `apply` chỉ có trên CLI.
- **I9. Chống đua tay:** đề xuất ghi `base_sha256` của file đích; `apply` thất bại nếu file đã đổi sau đó.

## 4. Kiến trúc

Module mới `src/harness/`, mỗi file dưới 300 dòng:

| File | Việc |
|---|---|
| `inventory.rs` | Quét `core/` và `.claude/` lấy agent, skill, rule; đọc frontmatter (`name`, `description`, `tools`, `model`); tính sha256 |
| `audit.rs` | Các kiểm tra ở mục 5; trả danh sách phát hiện có mức độ |
| `lifecycle.rs` | Tính trạng thái active, stale, archived, pinned từ `skill_quality` và `audit-chain.log` |
| `protected.rs` | Danh sách vùng cấm, một nguồn duy nhất |
| `proposal.rs` | Định dạng đề xuất, kiểm tra, kiểm tra đảo ngược, áp dụng nguyên tử |
| `history.rs` | Sổ thay đổi (JSONL), nối vào chuỗi audit |
| `cli.rs` | `yana-rt harness audit, status, propose, review, apply, archive, restore, pin` |

Capability (đăng ký vào `capability::registry`, dùng chung cho chat và MCP):

- `harness.audit`: chỉ đọc, rủi ro thấp, không cần duyệt.
- `harness.propose`: ghi duy nhất vào `.yana-ai/harness/proposals/`, mỗi lần gọi cần người duyệt (`HumanApprovalPerCall`).
- `apply`, `archive`, `restore`: không đăng ký capability, chỉ CLI.

## 5. Các kiểm tra của `harness audit` (Giai đoạn 1)

| Mã | Kiểm tra | Mức |
|---|---|---|
| H001 | Agent hoặc skill thật khác với danh sách ghi trong `CLAUDE.md` | cảnh báo |
| H002 | Nhắc API đã chết (`TeamCreate`, `TeamDelete`, cờ `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) | lỗi |
| H003 | Agent chỉ đọc theo `subagent-policy.md` nhưng `tools` có `Write`, `Edit` hoặc `MultiEdit` | lỗi |
| H004 | Agent ghim cứng một model mà không có ghi chú lý do | cảnh báo |
| H005 | Hai skill trùng tên hoặc trùng từ khoá kích hoạt (theo `rule-consistency-policy.md`) | cảnh báo |
| H006 | Skill dài quá 220 dòng hoặc thiếu mục bắt buộc (`Output Contract` khi có số liệu) | cảnh báo |
| H007 | Bản sao `core/` và `.claude/` lệch nhau (đã có `verify-hook-mirrors.sh`, tái dùng logic) | cảnh báo |
| H008 | Skill có `source`/giấy phép ghi sai so với `LICENSE` của nguồn đã vendor | cảnh báo |

Mã thoát: 0 sạch, 1 có lỗi, 2 không đọc được dữ liệu. Kết quả có dạng `--json` ổn định để dùng trong CI.

## 6. Vòng đời (Giai đoạn 2)

- **Active:** có dùng trong 14 ngày gần nhất theo `audit-chain.log` (ngưỡng 14 và 30 ngày lấy theo Hermes, đặt ở hằng số có tên).
- **Stale:** không dùng trong 14 ngày. Chỉ hiện trong báo cáo.
- **Đề xuất lưu trữ:** không dùng trong 30 ngày, không ghim. Sinh một đề xuất `archive`; người duyệt mới lưu trữ.
- **Pinned:** bỏ qua mọi chuyển trạng thái tự động.
- Skill đã `Trusted` mà gặp chuỗi FAIL thì hạ bậc tự động (hành vi hiện có của `skill_quality.rs`, giữ nguyên).
- Hạn chế đã biết: gán skill cho tác vụ theo cửa sổ thời gian, không theo danh tính (nêu trong `skill_quality.rs`); báo cáo ghi rõ.

## 7. Đề xuất và áp dụng (Giai đoạn 3)

Đề xuất là một file JSON:

```
id, kind (edit | add | archive), target, base_sha256, diff,
why, generalization (phát biểu ở mức nguyên tắc, không phải một ca cụ thể),
evidence (danh sách: mã bằng chứng, dòng audit, kết quả eval), author_session, created_at
```

Luồng: agent gọi `harness.propose` → lõi kiểm tra (schema, vùng cấm I3, `base_sha256`, đảo ngược I7, kích thước diff) → người chạy `harness review <id>` để xem diff và lý do → `harness apply <id>` ghi file, ghi sổ lịch sử, ghi chuỗi audit. `apply` yêu cầu bản xem lại gần nhất khớp đúng sha256 của diff.

Với đường dẫn nằm trong `core/` bị `core-lock` ghim, `apply` dừng và in lệnh cập nhật khoá để người tự chạy; lõi không tự chạy `update-core-lock.sh`.

## 8. Bằng chứng

Mỗi lần `apply` ghi một biên nhận HMAC bằng cơ chế `src/evidence/` hiện có (khoá `YANA_EVIDENCE_KEY` mà mô hình không thấy), gồm sha256 trước và sau, mã đề xuất, người duyệt. Khi có `ObservationEvidence` (đề xuất riêng cho khả năng "mổ"), sổ này dùng lại cùng định dạng.

## 9. Kế hoạch kiểm thử

- Mỗi kiểm tra H001 đến H008: một ca đúng, một ca sai, một ca biên (tên có dấu, frontmatter hỏng, tệp rỗng).
- I3: đề xuất sửa `src/guard/x`, `core/hooks/x`, đường dẫn `..`, symlink trỏ vào vùng cấm, tên viết khác hoa thường: đều bị từ chối.
- I2: không có đường nào để một lời gọi MCP làm `apply` hoặc `archive`.
- I7: đề xuất đảo ngược lần sửa trước bị gắn cờ.
- I9: sửa file đích sau khi có đề xuất, `apply` phải từ chối.
- Kiểm thử đầu cuối bằng `tests/integration_harness.rs`, chạy trong CI; ca đỏ trước, xanh sau theo `verification.md`.

## 10. Giai đoạn và tiêu chí xong

1. **Giai đoạn 1:** `inventory`, `audit` (H001 đến H008), lệnh `harness audit`, capability `harness.audit`, test, bước CI. Chỉ đọc.
2. **Giai đoạn 2:** `lifecycle`, `harness status`, báo cáo stale, `pin`.
3. **Giai đoạn 3:** `propose`, `review`, `apply`, `archive`, `restore`, sổ lịch sử.
4. **Giai đoạn 4 (tuỳ chọn, sau cùng):** thử đề xuất trên một nhánh tạm bằng `eval judge`, so trước và sau.

Mỗi giai đoạn là một PR riêng, có thể dừng ở bất kỳ giai đoạn nào mà không để lại nửa tính năng.

## 11. Ngoài phạm vi (cố ý)

Tiến trình nền tự chạy; gọi mô hình trong lõi; sửa vùng cấm I3; truy cập mạng; tự nâng bậc skill; sinh hàng loạt agent từ mô tả lĩnh vực.

## 12. Câu hỏi cần chủ dự án quyết

1. Ngưỡng 14 và 30 ngày có hợp với nhịp dùng của anh không?
2. Thư mục `.yana-ai/harness/` nằm ngoài git (như `skill_quality.json`) hay được theo dõi để có lịch sử trong repo?
3. `harness.propose` có hiện ra qua MCP cho các client khác không, hay chỉ dùng trong `yana chat`?
4. Có làm riêng một PR sửa các skill lỗi thời trước (không phụ thuộc thiết kế này) không?

## 13. Tác động tới quy tắc hiện có

- Thêm `src/harness/` và đăng ký capability: cần cập nhật `registry_data.rs`, bảng trong `docs/` và số liệu `MANIFEST.json` nếu có thay đổi đếm.
- Không đổi hook, không đổi `guard`, không đổi `core-lock` ở các giai đoạn 1 và 2.
- Dự án đang ở chế độ chỉ vá bảo mật và tài liệu: đây là tính năng mới, cần chủ dự án chấp thuận rõ ràng trước khi bắt đầu Giai đoạn 1.
