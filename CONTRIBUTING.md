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

## Discuss First, or Just Send a PR?

Most contributions don't need a discussion first: fork, fix, PR. Use the table below to check whether yours is one of the exceptions.

| Your change | Discuss first? | Where |
|---|---|---|
| Bug fix, single skill, single hook, small doc fix | No, just send the PR | N/A |
| New skill, new agent definition, new adapter | No, the format itself is the spec | N/A |
| New rule that doesn't conflict with an existing one | No, send the PR, reviewers will flag conflicts | N/A |
| New subsystem, or a change touching 5+ files across module boundaries | Yes | GitHub Discussion or an Issue tagged `design-proposal` |
| Breaking change to the CLI surface, config file format, or a public API | Yes | Same as above |
| Anything touching `core/rules/`, `core/hooks/`, `core/gates/`, or `core/agents/` | Not a discussion: a **mandatory dual-review dispatch** | See below |

This is separate from [`54-bft-consensus-law.md`](.claude/rules/54-bft-consensus-law.md)'s reviewer requirement. That rule is a hard gate keyed on *file path*, not size: touch `core/rules/`, `core/hooks/`, `core/gates/`, or `core/agents/` and the change needs two independent reviewer dispatches (security-auditor plus an architecture- or code-auditor) before it can land, no matter how small the diff. The table above is about *before you write any code at all*: whether the idea itself needs sign-off before you spend time implementing it. A one-line fix to `core/hooks/audit-log.sh` skips the discussion step but still needs rule 54's reviewer dispatch at merge time; a new cross-cutting subsystem needs a discussion first, and then rule 54's dispatch too if it touches those directories.

When in doubt, open the Discussion. A design conversation that turns out to be unnecessary costs a few messages; a large PR built on a premise nobody agreed to costs a rewrite.

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

### Thảo luận trước, hay gửi PR luôn?

Phần lớn đóng góp không cần thảo luận trước: fork, sửa, gửi PR. Dùng bảng dưới để biết đóng góp của bạn có nằm trong nhóm ngoại lệ không.

| Loại thay đổi | Cần thảo luận trước? | Ở đâu |
|---|---|---|
| Sửa lỗi, một skill, một hook, sửa doc nhỏ | Không, gửi PR luôn | N/A |
| Skill mới, agent mới, adapter mới | Không, định dạng đã là spec | N/A |
| Rule mới không xung đột với rule hiện có | Không, gửi PR, reviewer sẽ báo nếu xung đột | N/A |
| Subsystem mới, hoặc thay đổi chạm 5+ file xuyên nhiều module | Có | GitHub Discussion hoặc Issue gắn nhãn `design-proposal` |
| Thay đổi phá vỡ tương thích với CLI, định dạng file config, hoặc API công khai | Có | Như trên |
| Bất cứ gì chạm `core/rules/`, `core/hooks/`, `core/gates/`, hoặc `core/agents/` | Không phải thảo luận: là **yêu cầu dual-review bắt buộc** | Xem bên dưới |

Đây là hai cơ chế khác nhau, không thay thế cho nhau. [`54-bft-consensus-law.md`](.claude/rules/54-bft-consensus-law.md) là cổng chặn cứng dựa trên *đường dẫn file*, không dựa trên độ lớn: chạm vào `core/rules/`, `core/hooks/`, `core/gates/`, hoặc `core/agents/` thì cần hai reviewer độc lập (security-auditor cộng với architecture- hoặc code-auditor) trước khi merge, bất kể diff nhỏ đến đâu. Bảng ở trên nói về việc *trước khi viết bất kỳ dòng code nào*: ý tưởng có cần được đồng thuận trước khi bỏ công triển khai hay không. Một fix một dòng trong `core/hooks/audit-log.sh` bỏ qua bước thảo luận nhưng vẫn cần dual-review của rule 54 khi merge; một subsystem mới cần thảo luận trước, và nếu chạm các thư mục trên thì vẫn cần dual-review sau đó.

Khi không chắc, cứ mở Discussion. Một cuộc thảo luận thừa chỉ tốn vài tin nhắn; một PR lớn xây trên tiền đề chưa ai đồng ý thì tốn cả một lần viết lại.

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
