---
description: Create a handoff document — capturing current state, open tasks, and root-cause context so work can be resumed by another agent, another Claude session, or a human teammate. Usage: /handoff [topic]
argument-hint: [topic or feature being handed off]
---

You are writing a handoff document. The goal is to let someone else — another
Claude session, a different specialist agent, or a human teammate — pick up
exactly where the current work left off, without needing to re-read the whole
repository.

Handoff documents are different from commit messages and PR descriptions:
- **Commit messages** explain what changed in one diff.
- **PR descriptions** explain what a branch accomplishes.
- **Handoff documents** explain *the current state of the world* — what's done,
  what's in flight, what's blocked, what the root causes are, and what the
  next reader should do next.

---

## Phase 1 — Ground Yourself

Read these before writing anything:

1. `TODO.md` (if present) — what's in-progress, what's up next, what's blocked
2. `docs/technical/DECISIONS.md` (if present) — recent ADRs that may be mid-implementation
3. `git log --oneline -20` — recent commits on the current branch
4. `git status` — uncommitted changes (these are the in-flight work)
5. `git diff HEAD` — what's been changed but not committed
6. Any open PRs related to the topic (`gh pr list --author @me`)
7. The relevant GitNexus context if code is involved (`gitnexus query <topic>`)

If `$ARGUMENTS` names a specific topic or feature, narrow the scope to that.
Otherwise, cover the current branch's full in-flight work.

---

## Phase 2 — Structure of the Handoff

Write the document to `docs/handoff/YYYY-MM-DD-<short-slug>.md`
(create the directory if it doesn't exist). Use today's date.

Use **this exact structure** — every section is mandatory; if a section doesn't apply,
write "N/A" with one sentence explaining why.

```markdown
# Handoff — [Topic]

> Written by: [agent or "Claude (main)"] · [YYYY-MM-DD]
> Branch: `[current branch]` · Last commit: `[short sha] [subject]`
> Next reader: anyone picking up this work

## TL;DR

[Two to four sentences. What is the state of the world? What is the single
most important thing the next reader needs to know? If they only read this
paragraph, they should still know whether to proceed, pause, or escalate.]

## Tasks (P0 / P1 / P2)

Each task gets: priority, current status, root cause, affected files, repro
steps (if it's a bug), fix plan, and scope of change.

### Task 1 — [P0] [One-sentence title]

**Status**: [not started | in progress | blocked | done pending review]
**Related**: [PR #XXX, issue #YYY, or "none"]

**Problem**
[2–4 sentences. What's actually wrong or what's needed. Be concrete.]

**Root cause**
[If known: the underlying reason, not just the symptom. Cite file:line
references wherever possible. Example: `src/auth.ts:42` — token expiry
not checked on refresh path.]

**Reproduction** (for bugs only)
[Steps that actually trigger the issue. Note any that *don't* reproduce it
and why — those false leads save the next reader real time.]

**Fix plan**
[The proposed approach. Include alternatives considered and why they were
rejected. If a decision is still open, mark the open question explicitly.]

**Scope of change**
[List of files/modules likely to change. Note any cross-cutting concerns
(hooks, shared types, migrations) that mean the fix isn't purely local.]

### Task 2 — [P1] [Title]
...

## What's Already Done

[Bullet list of work completed in this session or branch. Link to commits
where possible. This prevents the next reader from redoing finished work.]

## What's In Flight (uncommitted)

[If `git status` shows uncommitted work, describe it here. Include:
- What's changed
- Why it's not yet committed (WIP? waiting on review? blocked?)
- Whether the next reader should commit, discard, or continue it]

## Blockers and Open Questions

[Things the next reader cannot resolve alone:
- External dependencies (waiting on API from team X)
- Decisions needing human input
- Missing information]

## Files to Read First

[An ordered list — the minimum reading path for the next reader. Usually 3–6
files. Saves hours of codebase spelunking.]

1. `path/to/file.ts` — [one-sentence reason it matters]
2. ...

## Commands That Matter

[Specific commands for this work — test runners, migration scripts, local
repro setup. Not general project commands (those are in CLAUDE.md).]
```

---

## Phase 3 — After Writing

1. Show the path of the file you created.
2. If `TODO.md` exists, add a one-line entry under "In Progress" linking to the handoff file.
3. Do **not** mark any tasks complete just because a handoff was written.
4. Do **not** commit the handoff automatically — let the human decide.

---

## Style Notes

- Write in prose, not bullet soup. Handoffs are read once, carefully.
- Use `file:line` references obsessively — they are the single highest-value artifact a handoff produces.
- Be honest about what's uncertain. "I believe X but haven't verified" is more useful than confident guesses.
- If the situation is genuinely bad (production broken, data at risk, security issue), say so in the TL;DR. Don't bury the lede.
