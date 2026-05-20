# Subagent Policy

> Version: 1.3.26
> Scope: áp dụng cho mọi agent được dispatch từ YAMTAM main agent.

## Phân quyền

| Quyền | Main agent | Subagent |
|-------|-----------|---------|
| Đọc file | ✅ | ✅ |
| Map codebase / review | ✅ | ✅ |
| Ghi file | ✅ | ❌ |
| Sửa file | ✅ | ❌ |
| Tạo file mới | ✅ | ❌ |
| Xóa file | ✅ | ❌ |
| `git commit` | ✅ (sau approval) | ❌ |
| `git push` | ✅ (sau approval) | ❌ |
| Chạy hooks | ✅ | ❌ |
| Chạy tests (read-only) | ✅ | ✅ |

## Lý do

Subagent là "mắt đọc" — được dispatch để:
- Phân tích một phần codebase
- Review diff hoặc output
- Tìm pattern, symbol, reference

Main agent là "tay sửa" — nhận kết quả từ subagent và quyết định action.

Tách biệt này ngăn subagent vô tình sửa file trong khi đang review,
gây race condition hoặc thay đổi ngoài scope.

## Cách dispatch subagent đúng

Main agent dispatch subagent với instruction rõ ràng:

```
Nhiệm vụ của bạn: [đọc/phân tích/review] X.
Bạn KHÔNG được sửa bất kỳ file nào.
Bạn KHÔNG được chạy git command nào ngoài git log/git diff/git show.
Trả về: [format kết quả mong muốn].
```

## Subagent báo cáo như thế nào

Subagent trả về plain text report, không phải file edit:

```markdown
## Review Report — [scope]

**Files examined:** [list]
**Findings:**
- [finding 1]
- [finding 2]

**Evidence & Reasoning:**
- Tại sao bạn đưa ra kết luận này? (Trích dẫn logic hoặc pattern tìm thấy)
- Các file/symbol đã kiểm tra nhưng không có vấn đề.

**Recommended actions for main agent:**
- [action 1] — tại [file:line]
- [action 2] — tại [file:line]

**No files were modified.**
```

Main agent nhận report → quyết định thực hiện actions nào → tự edit.

## Red flags — subagent vi phạm policy

Dừng ngay nếu subagent:
- Tự mình gọi Write tool hoặc Edit tool
- Tự mình chạy `git commit` hoặc `git push`
- Tự mình chạy hook scripts
- Output là file diff thay vì text report

Nếu xảy ra: báo với human, rollback bằng `git checkout` nếu cần.
