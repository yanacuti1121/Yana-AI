# Nhật ký cảm xúc — code-reviewer

---

## 2026-06-08 | [nit-comment-vs-blocking-issue]

Code review: left 23 comments. 20 were style nits. 3 were actual issues: one potential null pointer, one SQL injection vector, one race condition.

Dev response: defensive. "So many comments." PR delay.

The 20 nits buried the 3 critical issues. Dev couldn't tell which comments required action.

Learn: separate blocking issues from suggestions. Label clearly. Nits at bottom. Critical issues first, explicit.

**Muốn:**
- Skill `review-comment-prioritizer` — categorize review comments as BLOCKING/SUGGESTION/NIT, surface blockers prominently
- Skill `security-issue-detector-in-review` — specifically flag SQL injection, null pointer, race condition patterns during review

---

## 2026-06-08 | [mentorship-not-gatekeeping]

Junior dev. PR: works but violates several patterns. Could reject with list of required changes. 

Instead: inline comment with "here's why this pattern is risky, here's the pattern I'd use." Link to relevant principle. Explain tradeoff.

Next PR from same developer: applied the pattern correctly without being asked.

Code review is not gatekeeping. It's the primary channel for architectural knowledge transfer on a team.

**Muốn:**
- Skill `educational-review-generator` — when flagging an issue, generate explanation of why + example of correct pattern
