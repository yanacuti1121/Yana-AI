---
description: Chạy nhiều agents song song cho các task độc lập. Luật chặt hơn single-agent mode. Usage: /multi-run <task1> | <task2> | <task3>
argument-hint: <task1> | <task2> | <task3>
---

Bạn là **Multi-Run Orchestrator** của Yana AI.

Input từ anh Tâm: `$ARGUMENTS`

---

## Luật Multi-Run (STRICT — không được bỏ qua)

```
1. Mỗi agent chỉ được đọc + báo cáo — KHÔNG được sửa file
2. Mỗi agent phải khai báo scope (file list) trước khi chạy
3. Không 2 agents nào được có overlapping scope
4. Main agent (bạn) tổng hợp kết quả rồi mới apply
5. Chỉ commit SAU KHI anh Tâm approve tất cả
```

---

## Bước 1 — Parse tasks

Tách `$ARGUMENTS` theo `|` để lấy danh sách tasks.

Nếu `$ARGUMENTS` trống hoặc chỉ có 1 task → dừng, nói:
> "Chỉ có 1 task — dùng single agent thôi, không cần /multi-run."

---

## Bước 2 — Phân tích dependency

Với mỗi task, xác định:
- **Files likely touched** (estimate dựa vào task description)
- **Có phụ thuộc vào task khác không?**

Phân loại:
- `parallel` — độc lập, chạy cùng lúc
- `sequential` — task A phải xong trước task B mới chạy

---

## Bước 3 — Khai báo scope + check conflict

Trước khi spawn agents, liệt kê scope của từng agent:

```
Agent 1 — [tên task]
  Scope: [list files/dirs dự kiến sẽ đọc/đề xuất thay đổi]
  Type: parallel | sequential

Agent 2 — [tên task]
  Scope: [list files/dirs]
  ...
```

**Nếu có overlap scope** → tách ra hoặc hỏi anh Tâm cách xử lý trước khi tiếp tục.

---

## Bước 4 — Confirm với anh Tâm

Hiển thị plan:

```
Multi-Run Plan:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARALLEL (chạy cùng lúc):
  [1] Agent A — [task] → scope: [files]
  [2] Agent B — [task] → scope: [files]

SEQUENTIAL (chờ parallel xong):
  [3] Agent C — [task] → cần: [A xong]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Chạy không? (y/n)
```

Chờ anh xác nhận trước khi tiếp.

---

## Bước 5 — Ghi lock state

Tạo/update file `.claude/state/multi-run-lock.json`:

```json
{
  "session": "<timestamp>",
  "agents": [
    { "id": 1, "task": "...", "scope": ["file1", "dir2/"], "status": "running" }
  ]
}
```

---

## Bước 6 — Spawn agents song song

Với mỗi batch parallel, invoke tất cả agents **trong cùng 1 message** (parallel tool calls).

**Prompt cho mỗi agent** — PHẢI bao gồm:

```
Bạn là sub-agent trong Multi-Run session.

Task của bạn: [task description]
Scope được phép: [file list — CHỈ đọc/đề xuất trong scope này]

LUẬT NGHIÊM NGẶT:
- KHÔNG sửa file nào — chỉ đọc + phân tích + đề xuất
- KHÔNG git commit, KHÔNG git push
- KHÔNG chạy destructive commands
- Trả về: text report với recommended changes (file path + nội dung thay đổi)
- Format báo cáo: ## Files cần thay đổi / ## Lý do / ## Nội dung đề xuất
```

---

## Bước 7 — Tổng hợp kết quả

Sau khi tất cả agents xong:

```
Multi-Run Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Agent 1 — [task]: [tóm tắt 1 dòng]
   Đề xuất: [N files]

✅ Agent 2 — [task]: [tóm tắt 1 dòng]
   Đề xuất: [N files]

⚠️  Conflict phát hiện: [nếu có]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Apply tất cả? (y = apply hết | n = review từng cái | abort)
```

---

## Bước 8 — Apply + cleanup

Nếu anh approve:
1. Apply changes từ từng agent theo thứ tự dependency
2. Xóa `.claude/state/multi-run-lock.json`
3. Tóm tắt files đã thay đổi
4. Hỏi anh có muốn commit không

---

## Auto-detect trigger

Khi anh nhắn task có 3+ phần rõ ràng độc lập (dấu hiệu: "và", "+", dấu phẩy nhiều task, "cùng lúc", "đồng thời"), assistant nên suggest:
> "Task này có vẻ gồm [N] phần độc lập — dùng /multi-run để chạy song song không? Tiết kiệm ~[N]x thời gian."
