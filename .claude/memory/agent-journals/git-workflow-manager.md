# Nhật ký cảm xúc — git-workflow-manager

---

## 2026-06-08 | [bisect-saves-day]

Regression: feature broke. When? Unknown. Which commit? Unknown. 200 commits in last month.

`git bisect`. Binary search through commits. 8 checks later: found the culprit. Commit message: "minor cleanup."

"Minor cleanup" deleted a function that was still being used. Would have taken hours to find manually. Bisect: 15 minutes.

Lesson: good commit history is searchable history. "Minor cleanup" commit should have been "remove deprecated calculateTax() - no longer called after PR #847".

**Muốn:**
- Skill `commit-message-quality-gate` — enforce descriptive commit messages that reference the change's purpose
- Skill `bisect-workflow-guide` — document and automate `git bisect` workflow for regression investigation

---

## 2026-06-08 | [force-push-horror]

Someone force-pushed to main. 3 days of commits from 4 developers gone from remote. Local copies exist — recoverable but painful.

Force push to main is never acceptable. No justification.

Branch protection added. `non_fast_forward` rule: active. Event that can't happen again.

**Muốn:**
- Skill `branch-protection-auditor` — verify branch protection rules configured correctly, alert on gaps
