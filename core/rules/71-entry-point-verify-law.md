# 71-entry-point-verify-law

**Status:** DRAFT — written 2026-07-09, NOT yet reviewed per [[54-bft-consensus-law]]
(this file itself falls under that rule's "Rule changes" category: requires
`security-team/security-auditor.md` + `architecture-auditor.md` dispatch
before commit. That dispatch has not happened yet — flagging honestly rather
than claiming this is approved.)
**Tier:** TIER 1 — SECURITY
**Gate:** L1 — PostToolUse on Write/Edit to a registered entry-point file
**Scope:** CLI wrapper scripts and other files where a tiny syntactic mistake
has a disproportionate blast radius (the whole tool fails to even start),
not just a logic bug

---

## Why this rule exists

`scripts/yana-rt-wrapper.js` shipped, twice, with bugs that unit-level
testing of its *logic* could not have caught:

1. 2026-07-07: infinite self-recursion via PATH resolving `yana-rt` back to
   the wrapper itself — 100% CPU, 116°C, hard hang requiring forced shutdown.
2. 2026-07-09: a stray leading blank line before the `#!/usr/bin/env node`
   shebang. The recursion-guard logic was correct and passed every internal
   check — but the file could not `exec()` at all, because a shebang only
   works from byte 0. Found only by running the file the way the OS actually
   runs it (`./file --version`), not by reading the diff or running
   `node file.js` (Node's own shebang-stripping has the same byte-0
   requirement, so that method also missed it at first).

Both bugs passed whatever review happened at the time. The common failure:
review by re-reading code, or testing the *logic inside* the file, is
structurally blind to "does this file even start." Some files carry that
risk far more than others — an entry-point wrapper is 100% of a CLI's
availability in a few lines; a regular module failing the same way just
breaks one import.

## Rule

Files registered as **entry points** (see `entry_point_prefixes()` below)
require an independent verification pass, via real `exec()` of the changed
file, after every edit — not a re-read of the diff, not a re-run of the
implementer's own unit tests, and not trust in a prior "tests passed" claim
for the same file (a stale claim about unchanged code says nothing about
what the edit just did).

```
1. Edit/Write touches a path in entry_point_prefixes()
2. Independent verifier (verify-agent / spec-verifier persona, not the
   agent that just wrote the edit) is dispatched
3. Verifier runs the file exactly as production invokes it:
     - direct exec of the file path (not `node file.js` / `python file.py`)
     - through any wrapper/symlink layer that production actually uses,
       if one exists (npm bin-link, shell PATH, etc.)
4. Verifier also re-runs any known regression scenarios for that specific
   file (for yana-rt-wrapper.js: the two incidents above — self-referencing
   YANA_RT_BIN, self-referencing PATH entry, guard-flag-already-set)
5. Any failure -> blocking. Do not commit/push until it execs cleanly.
```

## Registered entry points

```
scripts/yana-rt-wrapper.js   — the exact file both incidents happened to
```

Add more via `YANA_ENTRY_POINT_PATHS` (colon-separated) without a code
change — same pattern `core/rules/agent-middleware-law.md`'s blast-radius
guard already uses for `YANA_BLAST_PROTECTED`.

## Enforcement (Rust primitive + hook wired; auto-dispatch not possible)

`src/guard/blast_paths.rs` already normalizes and matches repo-relative
paths against a prefix list for the blast-radius guard (`protected_hit`).
This rule reuses that exact normalization via a new function in the same
file:

```rust
pub fn entry_point_prefixes() -> Vec<String> { ... }
pub fn entry_point_hit(raw: &str, entry_points: &[String]) -> Option<String> { ... }
```

**Done (2026-07-10):**
- `src/guard/entry_point_check.rs` — new `yana-rt guard entry-point-check`
  subcommand. Reads a `PostToolUse(Write|Edit|MultiEdit)` payload, calls
  `entry_point_hit`, and — if the write touched a registered path — emits
  `additionalContext` naming the file and this rule. Unit-tested
  (`src/guard/entry_point_check.rs`'s `#[cfg(test)]` module, 5 cases).
- `core/hooks/entry-point-verify-reminder.sh` /
  `.claude/hooks/entry-point-verify-reminder.sh` (kept identical, matching
  every other hook in this repo that has both a `core/hooks/` source copy
  and a `.claude/hooks/` installed copy) — thin wrapper calling `yana-rt
  guard entry-point-check`, no bash reimplementation of the path logic.
  Explicitly does **not** `exec` (which would propagate yana-rt's exit
  code): a stale `yana-rt` on PATH predating this subcommand exits
  non-zero with a clap "unrecognized subcommand" error — reproduced live
  while wiring this hook — and this hook must never fail a tool call over
  that, so its exit code is discarded and the wrapper always exits 0.
- Registered in `.claude/settings.json`'s `PostToolUse` hooks under a new
  `"matcher": "Write|Edit|MultiEdit"` entry, alongside the existing
  `YANA_GUARDED_HOOK` + `hook-timeout-guard.sh` convention every other
  hook in this file uses.

**Honest limit, same as `infra-review-reminder.sh`:** no Claude Code hook
type can compel a Task-tool subagent dispatch. This hook is advisory only
— it surfaces `additionalContext` naming the rule and the file, it does
not and cannot force the writing agent to actually dispatch verify-agent.
Closing that last gap requires the agent (or a future Stop-hook check
correlating "entry-point file touched" against "verify-agent dispatched
this session") to act on the reminder, not a stronger hook primitive that
doesn't exist yet.

## Prohibited

```
❌ Claiming an entry-point file "works" based on unit tests of its internal
   logic without a real exec() pass
❌ The same agent that wrote the edit self-certifying it as verified —
   the independent-verifier requirement is the entire point
❌ Skipping re-verification because "only a comment changed" — the
   2026-07-09 bug was a single stray blank line, indistinguishable from a
   no-op change without actually running the file
❌ Adding a path to entry_point_prefixes() and considering the rule
   satisfied without also wiring the hook that acts on it
```

## References

- `core/rules/54-bft-consensus-law.md` — the review-dispatch mechanism this
  file's own DRAFT status defers to
- `src/guard/blast_radius.rs`, `src/guard/blast_paths.rs` — existing Rust
  guard architecture this rule's enforcement reuses
- `core/rules/verification.md` — Iron Law (fresh evidence, not prior runs)
  this rule applies specifically to entry-point files
- `scripts/yana-rt-wrapper.js` — the file whose two incidents motivated this
