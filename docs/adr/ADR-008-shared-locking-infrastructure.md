# ADR-008: Shared Locking Infrastructure (RFC-001)

## Status

Implemented — 2026-07-22. Design was revised once after security-auditor
and architecture-auditor design review (see "What this ADR used to say"),
then a live code review of the implementation caught a 6th unlocked
writer neither the original audit nor this ADR's migration table ever
named: `core/hooks/budget-sentinel.sh`, a PostToolUse hook that also
read-modify-writes `token-budget.json`'s `total_tokens_used` field with
no lock at all. Fixed the same way as the other Python site
(`core/lib/py/file_lock.py`'s `FileLock`), verified by racing it against
`token-budget-guard.sh` on the same file (10+10 concurrent processes,
zero lost updates). All 5 real sites (4 originally listed +
`budget-sentinel.sh`) are migrated and verified under real multi-process
concurrency, including the cross-language pair
(`risk-scorer.sh` vs. `token-budget-guard.sh`'s Rust fast path racing the
identical file: 10+10 concurrent processes, both languages' fields
persisted correctly, zero lost updates).

**Second implementation-time finding, more fundamental than the first:**
the permanent regression test (`mission_done_survives_concurrent_completions_across_processes`,
`tests/integration_runtime.rs`) was intermittently flaky under real CI-like
load (~1-in-6 to 1-in-8 runs failed when run alongside this repo's ~60
other integration tests under `cargo test`'s default `--test-threads=4`;
0-in-8 in isolation). Root cause was NOT lock contention — increasing the
lock's wait timeout from 10s to 30s did not help. The actual bug: every
`save()`/`write_json()` in this ADR's implementation used a plain
`fs::write`/`writeFileSync`/`json.dump(open(path,'w'))`, none of which are
atomic — each truncates the target file before writing the new content.
The *lock* (this ADR's whole subject) correctly serializes writer against
writer, but does nothing for a reader that never takes the lock at all —
and several call sites have exactly that kind of unlocked reader by
design (`src/mission/mod.rs`'s own `resolve()`, `core/scripts/session-checkpoint.sh`
reading `token-budget.json`). An unlocked reader landing mid-truncation
sees an empty or partial file — in `resolve()`'s case, a JSON parse
failure that silently excludes the (real, on-disk, complete-a-moment-ago)
mission from its results, producing "no mission matching" for a mission
that unambiguously exists. **Fixed by making every write in this ADR's
scope atomic** (write to `<path>.tmp.<pid>` in the same directory, then
`rename`/`os.replace`/`renameSync` — atomic on every filesystem this repo
targets) — `src/mission/mod.rs::save()`, `src/guard/token_budget.rs::write_json()`,
the Node `writeJson()` in `core/hooks/token-budget-guard.sh`, and every
`json.dump`/`write_text` in `risk-scorer.sh`/`budget-sentinel.sh`/
`intent-inference.sh`. Verified: 30 consecutive full-suite runs (≈1,830
individual test executions) with zero failures after the fix, versus
reproducible intermittent failure before it. This is the correct
complement to locking, not a substitute for it — the fix doesn't relax
anything about the writer-vs-writer guarantee locking provides; it closes
the separate reader-vs-writer gap that guarantee was never scoped to
cover in the first place.

## Context

**Corrected count: 4 confirmed-open race sites, not 5.**
`core/hooks/per-tool-circuit-breaker.sh` — originally listed as site #1
— already has `fcntl.flock(f, fcntl.LOCK_EX)` (line 107), added in the
same commit (`5b8364c6`, 2026-07-19) that fixed ADR-009's
`tool-proxy-enforcer.sh`. This doesn't weaken this ADR's thesis — it
strengthens it: there are now **three independent lock implementations**
in this repo (`audit-log.sh`'s `mkdir` lock, `tool-guardrails-detector.sh`'s
`fcntl.flock`, and now `per-tool-circuit-breaker.sh`'s own separate
`fcntl.flock`), each written in response to a separate incident, none
generalized. Three rediscoveries of the same fix is stronger evidence for
"build this once" than the original four-vs-five count was.

Confirmed still open, unchanged from original draft:

| # | File | Runtime | Shared state file |
|---|---|---|---|
| 1 | `core/hooks/risk-scorer.sh` | Python | `core/memory/L2_session/token-budget.json` |
| 2 | `core/hooks/token-budget-guard.sh` (bash/Node fallback path) | Node | `core/memory/L2_session/token-budget.json` |
| 3 | `core/hooks/intent-inference.sh` | Python (invoked from a `.sh` file) | `$STATE_DIR/tool-sequence.json` |
| 4 | `src/mission/mod.rs` `save()` | Rust | `.yana-ai/missions/<id>.json` |
| 5 | `core/hooks/budget-sentinel.sh` (found via implementation-time code review, not the original audit) | Python | `core/memory/L2_session/token-budget.json` |

#1, #2, and #5 are a confirmed live 3-way cross-language race on the
identical file, on overlapping PreToolUse/PostToolUse events — the pairing
that most
directly motivates a cross-language-safe design.

**This repo already has a working delegation pattern this ADR didn't
check against.** `command -v yana-rt >/dev/null 2>&1 && exec yana-rt
guard <subcommand>` (fall through to a bash-native implementation only
when `yana-rt` isn't on `PATH`) is used in four existing hooks —
`guard-destructive.sh`, `guard-blast-radius.sh`,
`entry-point-verify-reminder.sh`, and **`token-budget-guard.sh` itself**
(migration target #2 above). The original draft rejected "a shared
binary" in one sentence without weighing this precedent. See revised
Decision below.

## Decision

Same core mechanism as the original draft — atomic `mkdir` as the
mutex, cross-language-safe by deriving the lock name from the target
file's path — with three material changes from review.

### 1. Hybrid delegation, not four independent full ports

Adopt this repo's own established pattern instead of diverging from it:
**one canonical implementation in Rust (`src/guard/lock.rs`)**, exposed
as `yana-rt lock acquire/release/with <name> <timeout>`, which bash/
Python/Node hooks call via the same `yana-rt`-present-else-fallback
pattern already used in four sibling hooks. A minimal, *not*
semantically-complete, native fallback lock (same `mkdir` primitive,
same lock-name derivation, but without the fencing-token reclaim logic
in point 2 below — see tradeoff note) covers the rare case `yana-rt`
isn't built/installed, matching how the existing four hooks already
degrade. This cuts "four full ports to keep semantically identical
forever" down to "one canonical implementation + thin call-sites,"
which is the same shape this repo already trusts for an adjacent
problem (guard delegation).

Tradeoff, stated explicitly per review: the native bash/Python/Node
fallback paths, by skipping the full reclaim logic, are correctness-
degraded relative to the Rust path — acceptable because they only
activate when `yana-rt` is absent, which is already a degraded mode by
this repo's own existing convention (the four sibling hooks accept the
same tradeoff today).

### 2. Lock scope = the entire read-decide-write unit, not the final write

Stated explicitly because review found a site where a mechanical
"wrap the write call" migration would leave the race open:
`token-budget-guard.sh`'s bash/Node fallback path currently does its
read-decide-write across **five separate `node -e` subprocess
invocations** interleaved with bash `if` control flow, not one
contiguous block. Locking only the write calls leaves the TOCTOU gap
between a concurrent process's read and this process's write wide open.
**Migrating this site correctly means restructuring it into one locked
critical section** (single process, load → decide → write, one
`with_lock` call) — a real rewrite of that file's control flow, not a
like-for-like port. `risk-scorer.sh` and `src/guard/token_budget.rs`'s
`cmd_token_budget`, by contrast, are already contiguous read-mutate-write
blocks and genuinely are simple wraps.

`src/mission/mod.rs` needs the same explicit callout for a different
reason: it's a **CLI process per invocation** (`mission done`/`fail`/
`cancel`/`retry`), not a long-lived hook — the lock must wrap
`resolve()` (read) through `save()` (write) as one unit inside a single
process's execution, which the `with_lock<T>(name, timeout, f:
FnOnce() -> T)` signature already supports, but the migration must not
copy the "hook" mental model verbatim onto a structurally different
call shape.

### 3. Fencing-token reclaim, not unconditional `rmdir`

Review identified a real race in the reclaim step the original draft
copied verbatim from `audit-log.sh`: unconditional "if lock dir is older
than timeout, `rmdir` it" has no guarantee the holder is actually dead
— a merely *slow* holder (disk contention, loaded CI runner, a debugger
breakpoint) can be reclaimed by a second process while still alive and
still intending to write, producing two simultaneous lock holders. This
matters concretely here: `audit-log.sh`'s own header documents a real
2026-07-09 incident (two audit-chain entries sharing a `prev_hash`) from
exactly this class of unsynchronized-write bug, so treating a fixed
timeout as safely conservative isn't a hypothetical concern for this
codebase.

**Fix:** atomic single-winner reclaim via `rename(lock_dir, lock_dir +
".stale." + reclaimer_pid)` before removing. `rename()` is atomic — if
two reclaimers race, only one succeeds (the loser gets `ENOENT` on the
already-renamed source and backs off to retry acquisition from scratch).
Same "no new dependency" property as the rest of this ADR (native
`rename` syscall in every language here).

### Lock-name derivation — collision-resistant, length-capped

Original draft's "sanitize the path" idea (`/` → `_`) can collide
(`a/b_c` and `a_b/c` both sanitize to `a_b_c`) and has no length cap
against `ENAMETOOLONG` on deep paths. **Fix:** append an 8-hex-char
prefix of `SHA-256(canonical_path)` to the human-readable sanitized name
— keeps debuggability (the point of a readable name) while eliminating
both the collision and length concerns. Low-risk for the 4 fixed sites
above; matters once this becomes, as intended, the default primitive
future hooks reach for.

### Interface (unchanged in shape from original draft)

```rust
// src/guard/lock.rs — canonical implementation
pub fn with_lock<T>(lock_name: &str, timeout: Duration, f: impl FnOnce() -> T) -> Result<T>
```

```bash
# core/lib/locking.sh — thin call-site: yana-rt-present, else minimal native fallback
with_lock <lock_name> <timeout_sec> -- <command...>
```

Python/Node call-sites (`core/lib/py/file_lock.py`, planned
`core/lib/js/file-lock.js`) follow the same pattern: prefer shelling out
to `yana-rt lock`, minimal native fallback otherwise. `core/lib/py/`
does not exist yet — this ADR and ADR-009 (which also wants a
`core/lib/py/`-adjacent home for `match_regex.sh`'s Python side) share
this scaffolding; whichever lands first establishes the import-root
convention (matching `tool-guardrails-detector.sh`'s existing
`from core.lib.hermes_adapted...` pattern) for the other to reuse.

### Concrete file paths and size budget

Per `core/rules/agent-code-constraints.md`'s 300-line/file, 50-line/
function hard limits, stated explicitly per new file (the original draft
only cited the rule, didn't apply it):

- `src/guard/lock.rs` — new file, canonical implementation + fencing-token
  reclaim; budget: under 300 lines including tests, split `reclaim.rs`
  out if the fencing-token logic alone approaches 150
- `core/lib/locking.sh` — thin `yana-rt`-present-else-fallback wrapper;
  budget: well under 100 lines, it's a call-site, not a reimplementation
- `core/lib/py/file_lock.py` — same shape, Python
- Migration diffs to the 4 target files — `token-budget-guard.sh`'s
  control-flow restructuring (point 2 above) is the one likely to need
  its own size review, since consolidating 5 subprocess calls into 1
  locked block changes the file's structure, not just adds a wrapper

### Migration targets (this ADR's scope)

The 4 confirmed-open sites in the corrected table above.
`per-tool-circuit-breaker.sh` needs no migration (already correct via
its own `fcntl.flock`) — worth a follow-up note pointing it at the new
canonical primitive once it exists, so a fourth independent
implementation doesn't get maintained in parallel indefinitely, but not
blocking this ADR.

## Consequences

**Easier:** unchanged from original draft (one audited implementation,
cross-language race closed by construction) — plus: matches this repo's
own existing architectural convention instead of introducing a new one,
which should mean less review friction and no need to justify a novel
pattern.

**Harder / costs:** unchanged from original draft (four call-sites to
migrate correctly, stale-lock timeout tuning) — plus: the native
fallback paths are correctness-degraded relative to the `yana-rt` path
(stated tradeoff, point 1) and `token-budget-guard.sh`'s migration is a
real restructuring, not a mechanical wrap (point 2, likely the largest
single piece of implementation work in this ADR).

## Regression test requirement (before merge)

Original requirements retained (N parallel writers same language,
cross-language pair on the same lock name, kill-a-holder-mid-write
stale-lock recovery), plus from review:

- **A second stale-lock scenario distinct from "killed holder":** a
  *slow-but-alive* holder past the timeout, contended by a second
  process — proves the fencing-token reclaim (point 3) actually prevents
  double-acquisition, which the original single "killed holder" test
  cannot prove (a dead holder never contests the reclaim; a slow-alive
  one does).
- **CI wiring, explicitly**: `.github/workflows/ci.yml`'s only
  `cargo test` invocation is scoped to `--test integration_runtime`
  (line 118) — a named integration binary, not a bare `cargo test` that
  would also pick up `#[cfg(test)] mod tests` blocks. New unit tests in
  `src/guard/lock.rs` must be either added to that integration binary or
  the CI job's test invocation explicitly extended — "add
  `#[cfg(test)]`" alone will not run in CI under current wiring.

## References

- `core/hooks/audit-log.sh` — original `mkdir`-lock pattern; its header's
  2026-07-09 incident note is why the reclaim race (point 3) is treated
  as a real risk here, not a theoretical one
- `core/hooks/tool-guardrails-detector.sh`,
  `core/hooks/per-tool-circuit-breaker.sh` — two more independent
  `fcntl.flock` fixes, reinforcing this ADR's "reinvented repeatedly"
  thesis (the second was found only during this revision)
- `core/hooks/guard-destructive.sh`, `guard-blast-radius.sh`,
  `entry-point-verify-reminder.sh`, `token-budget-guard.sh` — the
  existing `yana-rt`-delegation pattern this ADR now follows instead of
  diverging from
- `core/rules/54-bft-consensus-law.md` — review requirement before this
  lands in `core/hooks/`
- `core/rules/44-supply-chain-vetting.md` — why this ADR still adds zero
  new external dependencies
- `core/rules/agent-code-constraints.md` — file/function size limits,
  now applied per new file above
- `.github/workflows/ci.yml:118` — the `--test integration_runtime`
  scoping that makes explicit CI wiring necessary, not optional
- Audit + design-review session, 2026-07-21

## What this ADR used to say

The original draft's migration-target table listed 5 open race sites,
including `per-tool-circuit-breaker.sh` as unlocked. Both independent
design reviews (security-auditor and architecture-auditor) found it
already fixed via `fcntl.flock`, in the same commit that fixed ADR-009's
`tool-proxy-enforcer.sh`. The original draft also rejected a shared-
binary/single-implementation design in one sentence without checking
whether this repo already had a working precedent for that shape — it
does (`yana-rt guard <subcommand>` delegation, used in four other
hooks) — and didn't distinguish "lock the write call" from "lock the
whole read-decide-write unit," which review found would leave
`token-budget-guard.sh`'s actual race open even after a mechanical
migration. Kept here rather than silently corrected, matching
ADR-009's own record of its correction and this repo's established
convention for documenting revisions.
