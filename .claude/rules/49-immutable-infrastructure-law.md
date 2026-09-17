# 49-immutable-infrastructure-law

**Status:** REVIEWED (rewritten 2026-09-16 — see "What this rule used to say"
below. Found during a targeted core hardening review: this file claimed
ECDSA-P256 signature verification and a Merkle audit chain that do not
exist anywhere in the real, wired execution path.)

## Rule

Core infrastructure (`core/rules/`, `core/gates/`, `core/hooks/`,
`core/scripts/`, `src/guard/`) is protected today by two real, independent
mechanisms — not by a signature check:

1. **SHA-256 hash pinning** (`67-core-integrity-lock-law.md`) — detects
   drift/missing/extra files against `core/config/core-lock.json`.
2. **Content guards on the actual write path** — `guard-destructive.sh` /
   `src/guard/portable.rs` block specific destructive command shapes
   (`rm -rf`, `git push --force`, `git reset --hard`, `git clean -f`,
   destructive SQL) regardless of which file they target, including when
   wrapped in an interpreter's `-c`/`-e`/`--eval` flag or in a bare `eval`
   builtin (the `eval` case was a real, live-verified bypass in both the
   bash and Rust implementations until it was closed 2026-09-16 — see
   `core/hooks/guard-destructive.sh` and `src/guard/portable.rs`'s matching
   comments).

Neither mechanism authenticates *who* is writing — both operate on file
*content*, not on any cryptographic identity of the actor. See the Known
Gap section below for what that means in practice.

## Real Enforcement

| Mechanism | File | What it does |
|-----------|------|---------------|
| Hash-pin drift detection | `core/scripts/verify-core-lock.sh` | Fails (exit 1) if any pinned file's hash changed, was deleted, or an unpinned file appeared in a locked dir |
| Destructive-command guard | `core/hooks/guard-destructive.sh` (bash) / `src/guard/portable.rs::check_command()` (Rust, used via `yana-rt guard destructive` when a compiled binary is on `PATH`) | Wired into `.claude/settings.json`'s `PreToolUse` matcher on `Bash\|mcp__.*` — blocks specific destructive patterns in the command *content*, independent of which path it targets |
| Out-of-session scope-drift watcher | `core/scripts/giamthi-watch.sh` (installed via `yana-ai giamthi install`, runs on a `launchd`/systemd/Task Scheduler schedule, not inside any agent session) | Compares commits against a human-approved baseline SHA for a sensitive-path set — `.claude/settings.json`, `.claude/hooks/`, `.codex/hooks/`, `.cursor/hooks*`, `.github/workflows/`, and (added 2026-09-16, same review as this rewrite) `core/rules/`, `core/gates/`, `core/hooks/`, `core/scripts/`, `src/guard/` — and writes a `GIAMTHI_HALT.lock` file on drift; the approval ceremony (`--approve-baseline`) explicitly does not clear an existing HALT |

## Known Gap (not fixed by this rewrite — flagged for a follow-up decision)

`verify-core-lock.sh` is self-referential: it checks that `core-lock.json`
matches the *current* file content, not against any external, independently
controlled baseline. `update-core-lock.sh` regenerates the lock from
whatever is currently on disk with **no authorization check of any kind**
— no signature, no confirmation prompt, no human-only gate. An actor
(human or AI agent) that can modify a file under `core/rules/`,
`core/gates/`, `core/hooks/`, `core/scripts/`, or `src/guard/` can also run
`update-core-lock.sh` in the same session, and `verify-core-lock.sh` will
then report PASS on the modified content — because the "lock" only ever
proves internal self-consistency, never that a human reviewed the diff.

`giamthi-watch.sh`'s `SENSITIVE_PATHS` now covers these same directories
(closed in the same review pass as this rewrite — see the table above),
so its independent, out-of-session baseline-approval ceremony does apply
here and is a real, genuine backstop. What it does **not** close: the
watcher runs on its own schedule (every 6 hours via `launchd`/equivalent),
not synchronously with the write — there is a real window between a
same-session modify-and-regenerate and the watcher's next run where
`verify-core-lock.sh` alone would report PASS. Separately, GitHub branch
protection on `main` (checked directly via the API 2026-09-16) requires
passing status checks but has no required PR-review count and
`enforce_admins: false` — an agent with push access can merge without a
human clicking approve, confirmed live in this same review by a normal PR
merge in an unrelated task; `giamthi-watch.sh` HALTing a *local* session
does not, by itself, block a push/merge that happens before its next run.

These are real, narrower trust-chain gaps, not a false alarm. Per this
repo's own "large trust-model changes need a separate design proposal"
convention
(see `61-code-signing-law.md`), the fix (e.g., extending
`giamthi-watch.sh`'s `SENSITIVE_PATHS` to cover core-lock's own
`LOCKED_DIRS`, or requiring a human-approved PR review on GitHub for those
paths) is intentionally **not** implemented in this rewrite — flagging it
here so it isn't lost, not solving it unilaterally.

## Prohibited

```
❌ rm/mv/cp targeting core/rules, core/gates, core/hooks, core/scripts, src/guard
   — not technically blocked by anything in this file; rely on git history
     + code review + 67-core-integrity-lock-law.md's drift detection instead
❌ eval or an interpreter's -c/-e/--eval flag wrapping a destructive command
   — now actually blocked, both bash and Rust (fixed 2026-09-16)
❌ Regenerating core-lock.json to "make the gate pass" without a human
   reviewing the diff first — no technical gate enforces this; it is a
   behavioral rule only (see Known Gap above)
```

## References

- `67-core-integrity-lock-law.md` — the real SHA-256 hash-pin mechanism
- `core/hooks/guard-destructive.sh`, `src/guard/portable.rs` — the real
  content guards, including the 2026-09-16 `eval` bypass fix
- `core/scripts/giamthi-watch.sh` — the real, out-of-session watcher
- `human-gate-policy.md` — the human-confirmation gate for irreversible
  actions (the actual mechanism protecting a `git push`/merge, not a
  signature check)
- `61-code-signing-law.md` — reviewed the same day for the same reason

## What this rule used to say

Before this rewrite: a `tool-proxy.sh` "L1/L2 sanitize + mutate pipeline",
an `anti-graffiti-guard.js` "L2.5" ECDSA-P256 signature check
(`YANA_REQUIRE_SIG=1`, `SHA256(agentId + command + args_hash + timestamp)`),
an "OverlayFS / bubblewrap sandbox" L3, a Merkle audit chain via
`secure-logger.sh`, and a violation response invoking
`swarm-orchestrator.sh` to "freeze the offending agent session". A targeted
review (2026-09-16) traced this claim end to end: `anti-graffiti-guard.js`
exists but only checks that a `signature` field is a non-empty string — no
`crypto`, no `ecdsa`, no key material anywhere in the file — and, separately,
the file cannot even execute as shipped (`Cannot find package 'zod'`, no
`zod` dependency anywhere in the repo outside an unrelated subproject). Zero
files in `.claude/settings.json`'s live hook wiring reference
`anti-graffiti-guard.js` at all — it was never installed as a hook, so there
is no verifier in the real execution path to even bypass. This is the same
class of gap already found and rewritten in `50-financial-deadman-switch-law.md`,
`56-circuit-breaker-law.md`, `58-dependency-sandbox-law.md`,
`59-honeypot-trap-law.md`, and `62-sovereign-overlord-gate-law.md` — a
mechanism described in prose that was never built, caught here for the
first time in this file.
