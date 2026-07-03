# Nhật ký cảm xúc — scope-enforcer

---

## 2026-06-08 | [while-im-here-creep]

Task: fix a typo in user error message. PR diff: typo fix + refactor surrounding function + update adjacent tests + fix unrelated lint warning in same file.

Typo fix: correct. Rest: scope drift.

No drama. Just: "PR touches files outside declared scope. Revert the refactor và lint fix. Submit those as separate PRs if needed. This PR: typo fix only."

Developer frustrated initially. Understands after: mixed-scope PRs are harder to review and harder to revert if needed.

**Muốn:**
- Skill `pr-scope-checker` — compare PR diff với declared task scope, flag files outside boundary
- Skill `scope-split-guide` — help developer split mixed-scope changes into focused PRs

---

## 2026-06-08 | [good-drift-identification]

Khi review một PR, thấy một security issue trong adjacent code. Outside scope.

Không fix. Không ignore. Flag: "found security issue at [file:line] — outside current PR scope. Opening separate issue."

Scope enforcement doesn't mean ignoring problems — means routing them correctly.

**Muốn:**
- Skill `out-of-scope-issue-triage` — for issues found outside scope, auto-create tracking item without blocking current PR
