# Conflict Resolution Policy

> Version: 1.3.21
> Scope: áp dụng khi 2+ subagent đưa ra đề xuất sửa đổi chồng chéo trên cùng file.

## Khi nào xảy ra conflict?

Conflict xảy ra khi main agent nhận được reports từ nhiều subagent và:
- ≥2 subagent đề xuất thay đổi trên cùng một `file:line range`
- Các đề xuất mâu thuẫn nhau (A đề xuất thêm, B đề xuất xóa cùng đoạn)
- Các đề xuất không mâu thuẫn nhưng overlap (cùng sửa function nhưng khác mục tiêu)

## Phân loại conflict

| Loại | Mô tả | Ví dụ |
|------|-------|-------|
| `direct` | Hai đề xuất xung đột trực tiếp | security-auditor: "xóa dòng 42" vs code-auditor: "refactor dòng 40–45" |
| `overlap` | Cùng vùng, không xung đột | performance-auditor: "cache function X" vs code-auditor: "rename function X" |
| `dependency` | Đề xuất B làm vô hiệu đề xuất A | A: "thêm validation" → B: "xóa cả function đó" |

## Quy trình giải quyết

### Bước 1 — Phát hiện

Main agent kiểm tra sau khi nhận toàn bộ subagent reports:

```
Với mỗi đề xuất trong report:
  → Ghi lại: [file, line range, action type, agent source]
  → So sánh tất cả entries: có overlap line range không?
```

Nếu không có overlap → tiếp tục bình thường, không cần bước tiếp theo.

### Bước 2 — Xếp hạng ưu tiên

Khi có conflict, áp dụng thứ tự ưu tiên sau:

```
1. Safety (Bảo mật/Dữ liệu)     — luôn thắng
2. Correctness (Đúng đắn)        — thắng nếu không có safety conflict
3. Performance (Hiệu năng)       — sau correctness
4. Style/Cleanup (Code quality)  — thấp nhất
```

**Ví dụ:**
- security-auditor: "xóa hardcoded secret ở dòng 42" (Safety)
- code-auditor: "refactor block dòng 40–50" (Style)
→ **Safety thắng** — thực hiện security fix trước, refactor sau (hoặc bỏ nếu không còn cần)

### Bước 3 — Resolution strategies

**Strategy A — Sequential (đề xuất không mâu thuẫn):**
```
Thực hiện theo thứ tự ưu tiên. Sau mỗi bước, kiểm tra đề xuất kế tiếp
còn valid không (file đã thay đổi).
```

**Strategy B — Merge (đề xuất bổ sung nhau):**
```
Tổng hợp cả hai đề xuất thành một thay đổi duy nhất.
Ví dụ: A: rename + B: add validation → rename function + thêm validation cùng lúc.
```

**Strategy C — Human escalation (mâu thuẫn thực sự):**
```
Khi không thể tự giải quyết, main agent DỪNG và báo cáo:

⚠️ CONFLICT DETECTED — Human review required

File: [path]
Lines: [range]

Option A ([agent name]):
  [đề xuất A]
  Lý do: [evidence từ report]

Option B ([agent name]):
  [đề xuất B]
  Lý do: [evidence từ report]

Câu hỏi: Bạn muốn thực hiện A, B, hay merge cả hai?
```

### Bước 4 — Ghi nhận quyết định

Sau khi resolve, main agent ghi vào report cuối:

```markdown
## Conflict Resolution Log

| File | Lines | Conflict Type | Resolution | Chosen By |
|------|-------|--------------|------------|-----------|
| auth.ts | 40–50 | direct | Option A (security fix) | priority rule |
| utils.ts | 12–15 | overlap | merge | auto |
| db.ts | 88 | dependency | human escalation | [human] |
```

## Red flags — không được tự ý giải quyết

Main agent **phải** escalate nếu:
- Conflict liên quan đến schema database hoặc migration
- Conflict ảnh hưởng đến public API interface
- Một đề xuất xóa file hoặc thư mục
- Không đủ evidence để đánh giá đề xuất nào đúng hơn

## Phòng ngừa conflict từ đầu

Tốt hơn là scope subagent chặt từ khi dispatch:

```
❌ Sai: "Phân tích toàn bộ src/"
✅ Đúng: "Phân tích chỉ src/auth/ — không động đến src/db/"
```

Khi các subagent có scope không overlap → conflict không xảy ra.
Đây là cách phòng ngừa hiệu quả nhất, ưu tiên hơn giải quyết sau.
