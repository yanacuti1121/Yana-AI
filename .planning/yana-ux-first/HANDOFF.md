# Handoff: Yana UX-first program

Last updated: 2026-10-29. Worktree: `/Users/vutam/Desktop/Yana-AI-5f`, branch `fix/governance-cleanup-5f`. Nothing is pushed.

The maintainer asked for autonomous work until the backlog is exhausted, with review afterwards. Standing limits: no push, no publish, no edits in the shared `/Users/vutam/Desktop/Yana-AI` checkout, no app (Studio) changes because another session owns that.

## Done (local commits, newest last)

- 1d973121 ci: version comments next to pinned action SHAs now match upstream tags (CI not yet confirmed green on the major bumps)
- 0048a161, 587275a8 plan and backlog files
- 3f5e2d54 README counts aligned, duplicate install row removed (A01, A02 partial)
- 314906ac Giám Thị HALT message is copy-pasteable (C01, C02, C03 partial)
- 4b531c48 check_counts.py anchors for the README stats table and tree, regression test, subcommand count fixed (A11)

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
