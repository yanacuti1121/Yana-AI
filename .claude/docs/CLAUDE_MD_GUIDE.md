# CLAUDE.md Architecture Guide

> Version: 1.3.26

## Nguyên tắc

CLAUDE.md là ngữ cảnh được nạp mỗi session. Nếu nặng → tốn context budget.
Nếu nhẹ quá → agent thiếu thông tin. Cân bằng bằng cách phân tầng.

## Tầng 1 — Root CLAUDE.md

**Chỉ chứa:**
- Pointer đến các tài liệu quan trọng (không copy nội dung vào đây)
- Gotcha toàn dự án — những cạm bẫy mà agent chưa biết sẽ sai
- Global rules áp dụng cho toàn bộ codebase

**Không chứa:**
- Chi tiết implementation của một module cụ thể
- Quy ước chỉ liên quan đến một subdirectory
- Nội dung có thể tra cứu được (copy từ README, docs)

**Ví dụ pointer đúng:**
```markdown
## Architecture
→ docs/technical/ARCHITECTURE.md

## Known footguns
- Không dùng `rm -rf` trong hooks — dùng `git clean -fd` thay thế
- Env var YAMTAM_ROOT phải là absolute path, tilde không expand

## Rules
→ core/rules/ (đọc khi liên quan)
```

## Tầng 2 — Subdirectory CLAUDE.md

**Chỉ tạo khi subdirectory có rule riêng** không áp dụng cho nơi khác.

Ví dụ nên tạo:
- `app/CLAUDE.md` — product code có convention riêng về component naming
- `core/hooks/CLAUDE.md` — hook có format header bắt buộc

Ví dụ không nên tạo:
- `docs/CLAUDE.md` — docs không có rule code, không cần
- `releases/CLAUDE.md` — chỉ chứa zip, không cần rule

**Nội dung subdirectory CLAUDE.md:**
```markdown
# [Directory] — Local Rules

> Scope: chỉ áp dụng trong thư mục này.
> Global rules vẫn có hiệu lực, xem root CLAUDE.md.

[Quy ước local]
[Test command cho thư mục này]
[Forbidden patterns trong thư mục này]
```

## Tầng 3 — Khởi tạo trong subdirectory

Khi Claude Code được khởi động từ một subdirectory (ví dụ: `cd core/hooks && claude`):

- CLAUDE.md của subdirectory đó được ưu tiên
- Root CLAUDE.md vẫn được đọc (nếu Claude Code tìm thấy)
- Agent phải biết mình đang ở đâu trong repo

**Rule:** subdirectory CLAUDE.md phải ghi rõ:
```markdown
> Repo root: ../../  (hoặc đường dẫn tương đối)
> Root CLAUDE.md: ../../CLAUDE.md
```

## Tầng 4 — Scope test và lint per-dir

Mỗi subdirectory CLAUDE.md nên ghi lệnh test cho riêng nó:

```markdown
## Test command (scope to this dir)
bash ../../core/tests/hooks/run-hook-tests.sh
# Hoặc lệnh riêng nếu có
```

Điều này giúp Claude Code biết cách verify thay đổi trong subdirectory mà không cần chạy full test suite.

## Checklist trước khi tạo CLAUDE.md mới

- [ ] Thư mục này có rule KHÔNG áp dụng ở nơi khác không?
- [ ] Rule này không thể đặt trong root CLAUDE.md được không?
- [ ] Nếu xóa file này, agent sẽ thiếu thông tin quan trọng gì?

Nếu câu trả lời cho cả 3 không rõ ràng → không tạo.
