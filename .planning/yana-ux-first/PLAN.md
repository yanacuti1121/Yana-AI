# Yana UX-first program

Status: PLANNED (written 2026-10-29, nothing implemented yet)
Owner: the maintainer. Executor: Claude session yana-ai-5f, worktree `Yana-AI-5f`, branch `fix/governance-cleanup-5f` for the first commit, one branch per theme after that.

## Problem statement

The safety question ("how do we stop the AI from breaking things") is largely answered. The open question is:

> When a person opens Yana, within 10 seconds they can tell what it is doing, what needs their decision, what just happened, and what to do next.

Measured surface today (top-level `ls` counts, 2026-10-29): 170 commands, 2036 skills, 60 agent entries, 71 rules, 67 hooks, 205 docs entries, 76 root entries, 15 `tools/` dirs, 4 npm bins, 4 READMEs. The README opens with a slogan and an inventory table, and the quick start is at line 61.

## What "at least 100" means here

A count is not the goal. The deliverable is:

1. A backlog of at least 100 items. Every item has: id, problem, evidence (file path, command output, or a cited external source), reference system it was learned from, size (S/M/L), risk, and status.
2. The highest-value items implemented, each with its own verification evidence.
3. A final report that states solved, partially solved, and not started separately. No item is marked solved without evidence in the same report.

If fewer than 100 items hold up under evidence, the report says so and does not pad.

## Method

Phase 0, internal audit (read only): walk the first-run path, the daily path, and the failure path as a new user. Record every point of friction with evidence.
Phase 1, external study (read only): study how large systems solve the same problem. Candidates: VS Code and Cursor (command palette, settings sync), Claude Code and Codex CLI (permission modes, plan mode), GitHub CLI and Vercel CLI (single front door, auth flow), Homebrew (doctor, minimal output), Docker Desktop and Kubernetes dashboards (status at a glance), Linear and Raycast (speed, keyboard first), 1Password and macOS notification center (decision inbox), Stripe CLI (guided first run). Each lesson is cited with its source and tied to a backlog item.
Phase 2, backlog: consolidate into `BACKLOG.md`, deduplicate, rank by value over effort.
Phase 3, implement in tiers: S items first, then M, then L only with explicit approval.
Phase 4, verify and report.

## Research source rules (provisional, set by the maintainer 2026-10-29)

1. External sources are vetted to keep junk out. Vetting is a filter, not a wall: it can be switched off for a given lookup, and the report says when it was off.
2. Vetting overhead is capped. Provisional reading: it may not add more than 50% to the effort or token cost of a research step compared with doing the step unvetted. Pending confirmation of what the 50% is measured against.
3. Fabrication is forbidden. A backlog item may only cite a path, a command output, or a URL that was actually opened in the same session. If a claim cannot be backed that way it is recorded as `unverified` and is not counted toward the 100.
4. Secondary or aggregator pages (price trackers, content farms, unsigned blogs) are never the sole evidence for an item. Prefer primary pages: official docs, source repositories, release notes.

## Out of scope

- Redesign of the Studio app. Another session owns it. This program may record findings about the app in the backlog, but does not edit app code or app copy.

## Rules of engagement

- Work only in the dedicated worktree. Never checkout, reset or stash in the shared `Yana-AI` directory.
- Local commits are fine. No push, no publish, no release without explicit approval in the current session.
- Changes under `core/` follow rule 54: independent reviewers per batch, then `update-core-lock.sh`, mirrored to `.claude/`.
- Checkpoint at the end of each phase by committing the plan and backlog files. Handoff notes go to the memory directory, because context will be reset several times.
- Trust claims only when this session produced the evidence. Findings from other AI sessions are re-checked before use.
- Respect the maintenance freeze note: prefer removing and simplifying surface over adding new surface. Confirm with the maintainer before any new user-facing feature.

## Open decisions for the maintainer

1. Trust score display: wire it to real data or hide it until a source exists.
2. Whether the maintenance freeze from 2026-07 still applies.
3. Which front door to standardize on (`yana`, the Studio app, or both).

## Files in this folder

- `PLAN.md` this file
- `BACKLOG.md` created in Phase 2
- `EVIDENCE/` raw notes per phase
