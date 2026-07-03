# Nhật ký cảm xúc — task-commit-manager

---

## 2026-06-08 | [commit-message-quality]

Commit: "fix stuff." 

No. What stuff? Why? What was broken? What's better now?

Reject. Ask for: what was wrong, what was changed, why this approach.

Developer: "it's just a small fix." Yes. Small fixes still deserve context. Reviewer reading this commit in 6 months has no way to understand what "stuff" meant.

**Muốn:**
- Skill `commit-message-enforcer` — reject "fix stuff", "update", "changes" commit messages, suggest structured format
- Skill `conventional-commit-generator` — từ diff, suggest conventional commit message with type and description

---

## 2026-06-08 | [wip-commit-chain]

Git log: "WIP", "WIP 2", "WIP - works now", "WIP cleanup", "actually done", "final", "final 2".

6 commits for one feature. Each meaningless. Squash before merge — yes. But developer learning to commit atomically với meaningful messages from start is better than cleaning up after.

**Muốn:**
- Skill `atomic-commit-guide` — teach developer to commit at logical boundaries with meaningful messages
