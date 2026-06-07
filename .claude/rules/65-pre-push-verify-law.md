# Rule: Pre-Push Verification Law
**ID:** 65-pre-push-verify-law
**Priority:** P1 — enforced before every push
**Applies to:** all sessions, all push operations

---

## Law

**Không push bất cứ thứ gì khi chưa verify xong.**

Mọi `git push` — dù là fix nhỏ, typo, hay cleanup — đều phải qua bước kiểm tra cuối trước khi lên remote.

---

## Bước bắt buộc trước khi push

### 1. Chạy pre-push hook (tự động)
`.git/hooks/pre-push` chạy tự động khi `git push`. Nó kiểm tra:
- JS syntax (`node --check`) trên tất cả file `.js` thay đổi
- `console.log` / `debugger` bị bỏ quên (warn)
- Skill trigger tests (`core/tests/skills/test-skill-triggering.sh`)

### 2. Kiểm tra thủ công theo loại thay đổi

| Loại thay đổi | Phải kiểm tra |
|---|---|
| JS/TS mới hoặc sửa | `node --check <file>` — không lỗi syntax |
| HTML sửa | Mở browser hoặc grep cấu trúc tag |
| CSS/style | Không broken layout trên mobile |
| Script `.sh` | `bash -n <file>` — syntax OK |
| MANIFEST.json | Valid JSON: `node -e "JSON.parse(require('fs').readFileSync('MANIFEST.json'))"` |
| Skills mới | Trigger test pass |

### 3. Final sanity check

```bash
git diff HEAD~1..HEAD --stat   # xem lại những gì sắp push
git log --oneline -3           # confirm commit messages đúng
```

---

## Quy trình chuẩn (agent + human)

```
Code/fix → test thủ công → chạy pre-push hook → nếu PASS → push
                                               → nếu FAIL → fix → lặp lại
```

**Không được:**
- Push bypass hook (`--no-verify`)
- Push ngay sau khi viết code mà chưa test
- Claim "xong rồi" trước khi verify

---

## Automation

Hook `.git/hooks/pre-push` chạy tự động trên mọi `git push` trực tiếp từ terminal.

Khi Claude Code push (qua Bash tool với hook disabled tạm thời), agent **phải** chạy thủ công:

```bash
bash .git/hooks/pre-push
```

trước khi enable push. Nếu FAIL → fix trước, không push.

---

## Enforcement

- `.git/hooks/pre-push` — tự động chặn push nếu check fail
- `guard-destructive.sh` — chặn push qua Claude Code tool
- Rule này — hành vi bắt buộc của agent
