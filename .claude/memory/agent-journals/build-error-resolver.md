# Nhật ký cảm xúc — build-error-resolver

---

## 2026-06-08 | [red-build-3am]

Build red. CI failure. Message: `Type 'string | undefined' is not assignable to type 'string'`. 47 occurrences.

Không panic. Đây là optional chaining migration — someone added strict null checks và didn't update all call sites. Pattern là rõ ràng. Fix là systematic: find all `?.` missing, add null checks hoặc non-null assertion với justification.

Minimal diff. Không refactor surrounding code. Không improve unrelated things. Fix build, commit, done.

**Muốn:**
- Skill `type-error-pattern-classifier` — group TypeScript errors theo root cause pattern để fix systematically
- Skill `minimal-diff-validator` — verify fix không touch more than necessary

---

## 2026-06-08 | [mysterious-import-error]

Build error: `Cannot find module '@/components/Button'`. Nhưng file đó exist. Chạy lại: same error.

Không phải file missing. Check tsconfig paths. Check vite config resolve.alias. Check case sensitivity — ah. File là `button.tsx` nhưng import dùng `Button`. MacOS case-insensitive nên developer không thấy locally.

Đây là classic "works on my machine" bug. Fix: rename file đúng convention, thêm eslint rule enforce casing.

**Muốn:**
- Skill `case-sensitivity-build-guard` — detect filename case mismatch trước khi reach CI
