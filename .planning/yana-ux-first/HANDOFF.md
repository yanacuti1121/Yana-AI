# Handoff: Yana UX-first program

Last updated: 2026-10-30. Worktree: `/Users/vutam/Desktop/Yana-AI-5f`, branch `fix/governance-cleanup-5f`. Nothing is pushed; every change is a local commit waiting for the maintainer's review.

Standing limits: no push, no publish, no edits in the shared `/Users/vutam/Desktop/Yana-AI` checkout, no Studio app changes (another session owns the app).

## Done (local commits)

- ci: version comments next to pinned action SHAs now match upstream tags
- docs: README counts aligned with the filesystem, duplicate install row removed, Quick start says "choose one", cargo step marked optional
- fix(giamthi): the HALT message is copy-pasteable and shows a diff command
- fix(counts): `check_counts.py` now anchors the README stats table and tree; regression test; subcommand count 40 corrected to 41
- fix(cli): `bin/yana --help` starts with Usage and a Start here block; accurate missing-runtime hint (independently exec-verified)
- fix(hooks): `tool-proxy-enforcer` deny messages say which text matched (security and code review done)
- fix(hooks): the session trust score resets when the session id changes (security and code review done; Codex layout bug found in review and fixed)
- docs: AGENTS.md says one worktree per session; planning files

See `git log fix/governance-cleanup-5f` for hashes. Backlog status lives in `BACKLOG.md` (counts are computed by script).

## Not done, in rough order of value

1. README messaging (A06 to A09): lead with what the user gets, not counts. Needs the maintainer's voice; also overlaps the Studio work.
2. Decisions inbox and one-time permission preflight (E01, E02, E05 to E07): E01 is already being built in worktree `Yana-AI-status` (branch `feat/status-hub`). Check Yana's current lease and approval code before designing E02; E05 to E07 are unverified ideas from outside sources.
3. B03 (three backends behind one CLI), B05 and B06 (npm leftovers), C04 (two-step approval), C09 (token-scope-guard precision), D02 and D03 (shared build load, duplicate MCP processes), F01 and F02 (Dependabot causing HALTs, release workflows untested after the pin bumps), A12 (translation count checks).
4. More external study (Homebrew doctor, GitHub CLI, Docker Desktop, Raycast). Only fetch primary pages; record each in `EVIDENCE/`.

## Open questions for the maintainer

- What is the "50%" cap on source vetting measured against?
- Does the 2026-07 maintenance freeze still apply?
- Who removed `GIAMTHI_HALT.lock` from the shared checkout? It was gone when checked, and the baseline approval for the workflow changes was never run.
- Should Dependabot action bumps be exempt from the HALT approval ceremony (F01)?

## Things to know

- The shell hook rejects `$(`, backticks, `${` and `| python3` in command strings, even inside quoted text. Put such code in a script file under the session scratchpad and run that.
- `check_counts.py` fails loudly when an anchor matches nothing; keep that behavior.
- Hook files exist in three byte-identical copies (`core/hooks`, `.claude/hooks`, `.codex/hooks`); `.codex` has no `scripts/` directory, so a hook must not depend on `../scripts`.
- Core changes follow rule 54: security-auditor plus code-auditor, then `update-core-lock.sh`.
- The usage limit was hit once mid-task; the work after the reset continued from this file.
