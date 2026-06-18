# Contributing to Yana AI · Đóng góp cho Yana AI

> **[Tiếng Việt bên dưới / Vietnamese below](#tiếng-việt)**

Thank you for helping build the most comprehensive AI agent safety framework.

---

## Quick Start

```bash
git clone https://github.com/yanacuti1121/yana-ai
cd yana-ai
bash core/tests/skills/test-skill-triggering.sh  # should show Result: PASS
bash core/tests/hooks/run-hook-tests.sh          # should show all passing
```

---

## What We Accept

| Type | Welcome? | Notes |
|---|---|---|
| New skills | ✅ | Must follow skill format (see below) |
| Bug fixes in hooks/scripts | ✅ | Include failing test case |
| New rules | ✅ | No conflicts with existing rules |
| Cross-engine adapters | ✅ | Add to `adapters/` |
| Performance improvements | ✅ | Benchmark before/after |
| New agent definitions | ✅ | Must be generic, no product coupling |
| Product-specific code | ❌ | Keep Yana AI engine-agnostic |
| Credentials / secrets | ❌ | Hard rejected at PR stage |

---

## Adding a New Skill

### Full Frontmatter Spec

Every `SKILL.md` must begin with this frontmatter block:

```markdown
---
name: your-skill-name
description: >
  One-line summary including key trigger phrases Claude uses to load this skill.
  Example: "Use when working with Redis caching, cache-aside pattern, or TTL tuning."
version: 1.0.0
compatibility: "Claude 4.5+, Sonnet 4.6, Haiku 4.5"
origin: source/repo-url (License name)   # required if adapted from external source
license: MIT                             # license of the adapted content
deprecated: false                        # set true + add `replaced_by` when deprecating
replaced_by: new-skill-name              # only if deprecated: true
---
```

**Field rules:**

| Field | Required | Notes |
|---|---|---|
| `name` | ✅ | kebab-case, must match directory name |
| `description` | ✅ | include trigger phrases; used by Claude to decide when to load |
| `version` | ✅ | semver, bump on any content change |
| `compatibility` | ✅ | minimum Claude model that works with this skill |
| `origin` | if adapted | URL or repo name + license in parens |
| `license` | if adapted | SPDX identifier (MIT, Apache-2.0, etc.) |
| `deprecated` | optional | default false; set true when replacing a skill |
| `replaced_by` | if deprecated | name of the replacement skill |

### Deprecation Policy (350+ skill set)

When a skill becomes outdated or is superseded:

1. Add `deprecated: true` and `replaced_by: <new-skill>` to the old skill's frontmatter.
2. Add a `> ⚠️ Deprecated in vX.Y.Z — use [new-skill](../new-skill/SKILL.md) instead.` notice at the top of the file body.
3. Keep the deprecated file for **2 minor versions** before deletion (grace period for users with the old pack installed).
4. Do NOT delete the skills-lock entry until the file is deleted.
5. Update `CHANGELOG.md` with the deprecation notice.

### Registration Steps

1. Create `core/skills/<name>/SKILL.md` with the frontmatter above.

2. Auto-register in `core/config/skills-lock.json`:
```bash
bash core/scripts/update-skills-lock.sh   # updates hashes for existing entries
# For new skills, register them in the lockfile (auto-add is opt-in):
bash core/scripts/verify-skills-lock.sh --auto-add
```

3. Add trigger phrases to `core/tests/skills/test-skill-triggering.sh`:
```bash
check_skill "your-skill-name"   "trigger phrase 1"
check_skill "your-skill-name"   "trigger phrase 2"
```

4. Run the gate:
```bash
bash core/tests/skills/test-skill-triggering.sh
# Must show Result: PASS
```

5. Update counts in `MANIFEST.json`, `plugin.json`, `marketplace.json`

---

## Commit Format

```
type(scope): short description

Types: feat, fix, chore, docs, refactor, test, perf
Examples:
  feat(skills): add redis-patterns skill (caching + pub/sub)
  fix(hooks): token-scope-guard false positive on .env.example
  docs(readme): update skill count to 145
```

---

## Pull Request Checklist

```
□ Trigger tests pass: bash core/tests/skills/test-skill-triggering.sh → PASS
□ Hook tests pass: bash core/tests/hooks/run-hook-tests.sh → all pass
□ Skills-lock updated: bash core/scripts/verify-skills-lock.sh → no drift
□ No secrets in diff: bash core/skills/leak-check/ pattern applied
□ Skill ≤ 220 lines (if adding a skill)
□ MANIFEST + plugin.json + marketplace.json counts updated
□ No hardcoded hex colors in any frontend code
□ Attribution: origin field in frontmatter if adapted from external source
```

---

## License

By contributing, you agree your contributions are licensed under MIT.
All adapted content must retain original attribution in the `origin` frontmatter field.

---

## Questions?

Open a GitHub Issue with label `question`. Response within 48h.

---

## Tiếng Việt

Cảm ơn bạn đã giúp xây dựng framework an toàn cho AI agent toàn diện nhất.

### Bắt đầu nhanh

```bash
git clone https://github.com/yanacuti1121/yana-ai
cd yana-ai
bash core/tests/skills/test-skill-triggering.sh  # phải hiện Result: PASS
bash core/tests/hooks/run-hook-tests.sh          # phải hiện tất cả đạt
```

### Những gì chúng tôi chấp nhận

| Loại | Được chào đón? | Ghi chú |
|---|---|---|
| Skills mới | ✅ | Phải theo đúng định dạng skill (xem bên dưới) |
| Sửa lỗi hooks/scripts | ✅ | Kèm test case thất bại |
| Rules mới | ✅ | Không xung đột với rules hiện có |
| Adapter đa engine | ✅ | Thêm vào `adapters/` |
| Cải thiện hiệu năng | ✅ | Benchmark trước/sau |
| Định nghĩa agent mới | ✅ | Phải generic, không gắn với product cụ thể |
| Code gắn với product | ❌ | Giữ Yana AI engine-agnostic |
| Thông tin nhạy cảm / secret | ❌ | Bị từ chối cứng ở giai đoạn PR |

### Thêm Skill mới

Mỗi `SKILL.md` phải bắt đầu bằng frontmatter:

```markdown
---
name: ten-skill-cua-ban
description: >
  Tóm tắt một dòng bao gồm cụm từ trigger Claude dùng để tải skill này.
version: 1.0.0
compatibility: "Claude 4.5+, Sonnet 4.6, Haiku 4.5"
origin: nguồn/repo-url (Tên giấy phép)   # bắt buộc nếu chuyển thể từ nguồn ngoài
license: MIT
deprecated: false
---
```

**Các bước đăng ký:**

1. Tạo `core/skills/<name>/SKILL.md` với frontmatter ở trên.
2. Tự đăng ký vào `core/config/skills-lock.json` (auto-add là opt-in):
```bash
bash core/scripts/verify-skills-lock.sh --auto-add
```
3. Thêm trigger phrases vào `core/tests/skills/test-skill-triggering.sh`
4. Chạy kiểm tra: `bash core/tests/skills/test-skill-triggering.sh` → PASS
5. Cập nhật số đếm trong `MANIFEST.json`, `plugin.json`, `marketplace.json`

### Định dạng commit

```
type(scope): mô tả ngắn

Types: feat, fix, chore, docs, refactor, test, perf
Ví dụ:
  feat(skills): thêm skill redis-patterns (caching + pub/sub)
  fix(hooks): token-scope-guard false positive trên .env.example
```

### Checklist Pull Request

```
□ Test trigger đạt: bash core/tests/skills/test-skill-triggering.sh → PASS
□ Test hook đạt: bash core/tests/hooks/run-hook-tests.sh → tất cả đạt
□ Skills-lock đã cập nhật: bash core/scripts/verify-skills-lock.sh → không drift
□ Không có secret trong diff
□ Skill ≤ 220 dòng (nếu thêm skill)
□ MANIFEST + plugin.json + marketplace.json đã cập nhật số đếm
□ Không có màu hex cứng trong code frontend
□ Attribution: trường origin trong frontmatter nếu chuyển thể từ nguồn ngoài
```

### Câu hỏi?

Mở GitHub Issue với nhãn `question`. Phản hồi trong 48 giờ.
