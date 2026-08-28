# Yana AI Architecture Health Report (2026-08)

> **Resolution note (2026-08-26):** this report is a dated diagnosis, not the
> current architecture contract. Its top capability/runtime duplication items
> led to `src/capability/`, the unified `src/runtime/` turn loop, canonical chat
> tool delegation, governed Desktop/packaged-Web adapters, Discord plain chat,
> and expanded MCP adapters. See
> [`ADR-014`](adr/ADR-014-unified-runtime-authority-hierarchy.md) for the current
> authority and interface boundaries. Remaining findings below should be read as
> historical evidence unless a current code audit confirms them again.
>
> **Closure note (2026-08-28):** this report's 5 named priorities are tracked
> live in [`CURRENT-MILESTONE.md`](../CURRENT-MILESTONE.md), not here. This
> file itself gets marked CLOSED/SUPERSEDED once that file's exit gate is
> fully checked — at which point
> [`docs/MILESTONE-AUTHORITY-DEPTH.md`](MILESTONE-AUTHORITY-DEPTH.md) becomes
> the current milestone. It is not there yet as of this note.

**Nguồn:** anh Tâm, 2026-08-07 — báo cáo tự đánh giá sức khỏe kiến trúc
toàn dự án, lưu nguyên văn theo yêu cầu. Chưa qua Phase/review nào,
chưa đối chiếu với code thật — đây là bản LƯU, không phải bản đã xác
minh từng mục.

Chia 4 nhóm:
- 🔴 Vấn đề cần xử lý ngay (Blocker)
- 🟠 Technical Debt
- 🟡 Thói quen phát triển
- 🟢 Điểm mạnh cần giữ

---

## 🔴 I. BLOCKER (đang làm cậu chững lại)

### 1. Chưa có Capability Runtime canonical ⭐⭐⭐⭐⭐

Hiện có nhiều nơi làm việc riêng: Chat, Tool, MCP, Desktop, Future
Vision, Future Memory => dễ duplicate logic.

Mục tiêu:

```
src/capability/
  repo
  git
  host
  process
  port
    ↓
  Chat
  MCP
  Desktop
```

### 2. Tool Calling chưa nối Local Model ⭐⭐⭐⭐⭐

Model local vẫn: Chat → "Tôi không đọc được file." — thay vì Tool Call
→ Capability → Result. Đây là blocker lớn nhất.

### 3. Chưa có Vertical Slice hoàn chỉnh ⭐⭐⭐⭐⭐

Ví dụ mong muốn: Desktop → Gemma → repo.read → Cargo.toml → Gemma trả
lời. Hiện mới có từng mảnh.

### 4. Chưa có Current Milestone ⭐⭐⭐⭐☆

Ý tưởng quá nhiều. Không có `CURRENT-MILESTONE.md` => AI lẫn chính cậu
đều không biết "2 tuần này làm gì."

### 5. Nhiều Source of Truth ⭐⭐⭐⭐☆

Version, Skill count, Provider, Manifest, Generated output, Docs — đều
có khả năng lệch nhau.

### 6. Mutation Pipeline chưa canonical ⭐⭐⭐⭐☆

Hiện: Chat → run_command. Sau này Desktop cũng sẽ cần, MCP cũng sẽ
cần. Nếu không extract sớm: 3 executor.

### 7. MCP vẫn là Spike ⭐⭐⭐⭐☆

Program J muốn: Capability Runtime → MCP. Nhưng code hiện tại mới chỉ:
check_command.

### 8. State Concurrency ⭐⭐⭐⭐☆

Sau này sẽ có: Memory, Vision, Session, Approval, Audit. Nếu vẫn: JSON
→ Read → Write => race.

### 9. Adapter Parity ăn quá nhiều thời gian ⭐⭐⭐⭐☆

Claude, Codex, Generator, Parity — trong khi Local AI chưa đọc được
repo.

### 10. Desktop nhanh hơn Runtime ⭐⭐⭐⭐☆

UI: ★★★★★. Runtime: ★★☆☆☆.

---

## 🟠 II. TECHNICAL DEBT

### 11. Capability Registry chưa tồn tại

Nên có: Capability Registry → Manifest → Runtime → MCP.

### 12. Typed Error chưa thống nhất

Hiện nhiều nơi: String. Nên: CapabilityError, GuardError, RuntimeError.

### 13. Audit chưa End-to-End

Cần trace: Prompt → Model → Tool → Guard → Command → Result.

### 14. Tool Result chưa có Evidence

Ví dụ: Path, Hash, Bytes, Modified, Session.

### 15. Capability chưa typed

Không nên: `metadata: String`. Nên: Evidence, Capability, Observation.

### 16. Chưa có Capability Manifest

AI không biết: Có tool nào. Read-only? Approval? Risk?

### 17. Chưa có Session Context

AI không biết: Repo, Workspace, Provider, Permission...

### 18. Versioning nhiều axis

Desktop, Rust, Python, Product, Release...

### 19. Distribution còn phân tán

GitHub, npm, PyPI, crate, Desktop...

### 20. Compatibility Surface quá lớn

JS shim, Python, Generator...

### 21. Generated Files nhiều

AI dễ sửa nhầm.

### 22. Chưa có Architecture Debt Register

Hiện nợ nằm: Chat, PR, Docs, Trí nhớ.

### 23. Chưa có Definition of Done chung

Ví dụ: Compile, Test, Live Verify, Docs, Source Truth.

### 24. Thiếu Golden E2E

Quan trọng nhất là: Open → Chat → Tool → Execute → Answer.

### 25. Local Model chưa có Tool Selection

Sau này có 50 capability → AI chọn sai.

### 26. Context Budget

26B local → không chịu nổi 100 capability.

### 27. Approval còn đơn giản

Sau này cần: Approve Once, Approve Session, Approve Scope...

### 28. Cloud/Local Policy

Execution ≠ Disclosure.

### 29. MCP dễ thành God Module

Không nhét logic vào: mcp.rs.

### 30. Docs quá lớn

Program J, History, Roadmap, Spec... => AI đọc khó.

---

## 🟡 III. THÓI QUEN PHÁT TRIỂN

Đây mới là phần quan trọng nhất.

### 31. Thấy hay là nhảy vào

Điểm mạnh trước. Điểm yếu bây giờ.

### 32. Thích mở subsystem mới

Ví dụ: Vision, Memory, Desktop... trong khi subsystem cũ chưa hoàn
thiện.

### 33. Khó bỏ ý tưởng

Cái nào cũng "Hay."

### 34. Đo tiến độ bằng Feature

Thực ra giờ phải đo: Integration, Stability, Canonical.

### 35. Làm nhiều hướng cùng lúc

Desktop, Runtime, Docs, CI, Codex, Claude, Vision...

### 36. Có xu hướng giữ lại quá nhiều

Old Desktop, Shim, Generated...

### 37. Thiếu cơ chế "Không"

Không phải: Ý tưởng hay → Làm. Mà: Hay → Có đúng milestone? → Không →
Backlog.

### 38. Thích tự nhớ

Thay vì: Architecture Debt, Current Milestone, Backlog.

### 39. Thích giải quyết pain ngay

Điểm mạnh. Nhưng sau này: Pain → Subsystem → Pain → Subsystem.

### 40. Chưa có Freeze Rule

Ví dụ: Không Vision, Không Memory, Cho đến khi Capability hoàn thành.

---

## 🟢 IV. ĐIỂM MẠNH (KHÔNG ĐƯỢC MẤT)

Đây là phần không nên sửa.

41. **Local-first.** Giữ.
42. **Provider Agnostic.** Giữ.
43. **Safety-first.** Giữ.
44. **Audit.** Giữ.
45. **Không thích Duplicate.** Giữ.
46. **Luôn nghĩ Governance.** Giữ.
47. **Thực chiến.** Không làm vì trend. Làm vì pain. Giữ.
48. **Dám bỏ.** npm, Wrapper... Sai là bỏ. Đây là điểm rất hiếm.
49. **Luôn tìm Canonical.** Đây là DNA của Yana.
50. **Có tầm nhìn Runtime.** Đây là điểm đánh giá cao nhất. Nhiều người
    xây IDE. Yana lại đang xây Runtime. Đó là hướng khác hẳn.

---

## 🎯 5 việc quan trọng nhất (2–3 tháng tới)

1. Capability Runtime canonical (`src/capability`) và mọi client dùng
   chung.
2. Local model tool calling để Gemma/Qwen/... đọc được repo thật qua
   runtime.
3. Mutation pipeline thống nhất để Chat, MCP và Desktop không có
   executor riêng.
4. Source of Truth cleanup (version, provider, manifest, generated
   output).
5. `CURRENT-MILESTONE` + `ARCHITECTURE-DEBT` để khóa phạm vi và không
   bị kéo sang các ý tưởng mới.

Nếu 5 việc này hoàn thành, tin rằng Yana sẽ vượt qua giai đoạn "chững"
và có một lõi đủ vững để sau đó thêm Vision, Memory hay các capability
khác mà không phải trả giá bằng việc kiến trúc ngày càng phức tạp.

## Liên quan

- `docs/YANA-CONTROL-PLANES.md` — kiến trúc 3 khối (Challenger /
  Governor / Local Embodiment Runtime) trả lời trực tiếp cho nhóm
  blocker + thói quen phát triển ở trên (Challenger giải quyết mục 31,
  32, 33, 37; Governor giải quyết mục 4, 22, 34, 38; Embodiment Runtime
  giải quyết mục 1, 2, 3, 6, 7)
- `docs/programs/PROGRAM-J-SKELETON.md` — Program J (Universal
  Capability Runtime), phần lớn mục 🔴 1/2/3/6/7 nằm trong scope này
