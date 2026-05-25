---
description: Hook lifecycle review — kiểm tra toàn bộ hook còn hiệu quả, có test, đúng version. Chạy định kỳ 3-6 tháng hoặc sau major Claude Code release. Usage: /hook-review
---

You are the Hook Review Coordinator. Nhiệm vụ: đánh giá sức khỏe của tất cả hook
trong `core/hooks/` và đưa ra khuyến nghị keep/update/deprecate/remove.

Bạn chỉ READ và REPORT. Không sửa file nào trong lệnh này.
Human duyệt report → thực hiện thay đổi riêng.

---

## Step 1 — Liệt kê tất cả hook

```bash
find core/hooks -name "*.sh"
echo "---"
echo "Total: $(find core/hooks -name "*.sh" | wc -l) hooks"
```

---

## Step 2 — Kiểm tra từng hook

Với mỗi file `.sh` trong `core/hooks/`:

**2a. Version header**
```bash
head -5 core/hooks/<hook>.sh | grep "YAMTAM ENGINE"
```
Flag nếu version cũ hơn 2 minor releases so với MANIFEST.

**2b. Test coverage**
```bash
grep -r "<hook-name>" core/tests/ 2>/dev/null | wc -l
```
Flag nếu = 0 (không có test nào reference hook này).

**2c. Execute permission**
```bash
ls -la core/hooks/<hook>.sh | awk '{print $1}'
```
Flag nếu không có `x` bit.

**2d. Last touched**
```bash
git log --oneline -3 -- core/hooks/<hook>.sh
```
Flag nếu không có commit nào trong 6 tháng qua (stale candidate).

---

## Step 3 — Kiểm tra false positive / false negative indicators

```bash
# Có hook nào được bypass nhiều không?
grep -r "YAMTAM_BYPASS\|SKIP_HOOK\|--no-verify" . \
  --include="*.sh" --include="*.md" --include="*.json" \
  | grep -v "releases/" | grep -v "docs/archive/" | grep -v "core/commands/"
```

Liệt kê mỗi bypass: file, dòng, lý do (nếu có comment).
Bypass nhiều = hook đó có thể đang false positive.

---

## Step 4 — Kiểm tra overlap giữa hooks

```bash
# Tìm hook nào check cùng pattern
grep -h "grep\|match\|pattern" core/hooks/*.sh | sort | uniq -d | head -20
```

Flag các pattern trùng lặp đáng ngờ — có thể 2 hook đang làm cùng việc.

---

## Step 5 — Tổng hợp report

Sau khi chạy tất cả checks, xuất report theo format này:

```
=== /hook-review report ===
Date: [current date]
Total hooks: N

--- KEEP (no action needed) ---
✅ hook-name.sh
   Version: OK | Tests: N | Execute: OK | Active: last commit [date]
   [nếu có note]

--- UPDATE (cần sửa nhỏ) ---
⚠️  hook-name.sh
   Issues:
   - Version header outdated (v1.2.x, current v1.3.x)
   - Execute bit missing
   Recommended: update header + chmod +x

--- REVIEW (cần điều tra thêm) ---
🔍 hook-name.sh
   Issues:
   - No tests found
   - Last commit: [N months ago]
   - [N] bypass references found
   Recommended: write test OR deprecate if no longer needed

--- DEPRECATE (lên lịch xóa) ---
🗑️  hook-name.sh
   Reason: [vì sao không cần nữa]
   Safe to remove after: [date / event]

--- REMOVE (xóa ngay) ---
❌ hook-name.sh
   Reason: [đã deprecated, không còn reference]
   Action: xóa file + xóa khỏi HOOK_WIRING.md

=== Summary ===
Keep:       N
Update:     N
Review:     N  
Deprecate:  N
Remove:     N

Verdict: [HEALTHY | NEEDS ATTENTION | ACTION REQUIRED]
Next review due: [3 or 6 months from today, depending on verdict]
```

---

## Step 6 — Không tự thực hiện thay đổi

Sau khi xuất report: dừng.

Nói với human:
```
Hook review hoàn tất. Xem report trên.
Để thực hiện các thay đổi, dùng:
- /diff-review trước khi commit bất kỳ thay đổi hook nào
- bash core/tests/hooks/run-hook-tests.sh để verify sau mỗi thay đổi

Bạn muốn bắt đầu với nhóm nào?
```
