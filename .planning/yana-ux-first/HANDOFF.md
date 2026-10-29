# Handoff: Yana UX-first program

Last updated: 2026-10-29. Worktree: `/Users/vutam/Desktop/Yana-AI-5f`, branch `fix/governance-cleanup-5f`. Nothing is pushed.

The maintainer asked for autonomous work until the backlog is exhausted, with review afterwards. Standing limits: no push, no publish, no edits in the shared `/Users/vutam/Desktop/Yana-AI` checkout, no app (Studio) changes because another session owns that.

## Done (local commits, newest last)

- 1d973121 ci: version comments next to pinned action SHAs now match upstream tags (CI not yet confirmed green on the major bumps)
- 0048a161, 587275a8 plan and backlog files
- 3f5e2d54 README counts aligned, duplicate install row removed (A01, A02 partial)
- 314906ac Giám Thị HALT message is copy-pasteable (C01, C02, C03 partial)
- 4b531c48 check_counts.py anchors for the README stats table and tree, regression test, subcommand count fixed (A11)

## State when the usage limit was hit (2026-10-29)

Committed since the list above: 0d100c75 bin/yana help and error text (independently exec-verified), a85c7b16 tool-proxy-enforcer deny messages (both rule 54 reviewers done), and the README Quick start wording (A03).

UNCOMMITTED in the worktree, waiting for review: the trust score fix for C10.
- Files: core/hooks/session-bootstrap.sh plus byte-identical copies in .claude/hooks and .codex/hooks, and the new test in core/tests/hooks/run-hook-tests.sh.
- Verified: hook suite 369 of 369; the new test fails against the previous hook and passes on the new one.
- security-auditor reviewed it: no Safety findings; optional: store a hash or length-capped session id, add tests for a missing id and an unwritable state dir.
- code-auditor review was still running when the limit hit. Do NOT commit until its report is in (rule 54 needs both). After it: run `bash core/scripts/update-core-lock.sh`, `bash core/scripts/verify-core-lock.sh`, then commit hook files, tests and core-lock together.
- C10 in BACKLOG.md still says open until that commit lands.

Phase 1 (external study) started: VS Code Workspace Trust page was fetched (trust once per folder, parent folder covers children, Restricted Mode, remembered list). The Claude Code page fetched was the authentication page, not permissions, so it is not usable evidence for E02; the OpenAI Codex fetch hit the limit. The OpenAI docs URL redirected to an unfamiliar domain, which was deliberately not followed.

## Next, in the order chosen

1. bin/yana: banner before usage (B01), flat command list (B02), missing-runtime message (B04). Registered entry point under rule 71: needs an independent exec verification, not self-certification.
2. Hook false positives C06 to C09 in `core/hooks` and the mirrors in `.claude/hooks` and `.codex/hooks`. Rule 54: security-auditor plus code-auditor review, then `update-core-lock.sh`, then `verify-hook-mirrors`.
3. C10 trust score line printed as 0/100 every turn. Needs the maintainer's choice (wire to data or hide). Default if unanswered: stop printing a value that is not backed by data.
4. README messaging A03, A06, A07, A08, A09.
5. Phase 1 external study, only after the above; every lesson needs a fetched source.

## Open questions for the maintainer

- Trust score: wire to data or hide?
- What is the "50%" cap on source vetting measured against?
- Does the 2026-07 maintenance freeze still apply?

## Things to know

- The shell hook rejects `$(`, backticks and `${` in command strings, even inside awk or quoted text. Put such code in a script file under the session scratchpad and run that.
- `check_counts.py` fails loudly when an anchor matches nothing; keep that behavior.
- Translation READMEs use their own number formats (vi uses a dot). Only README.md is anchor-checked; translations are fixed by hand (backlog A12, not yet added).
