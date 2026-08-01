# Benchmarks

> All numbers below were measured directly on this machine and this repo
> on 2026-07-23, not carried forward from older claims. Methodology,
> hardware, and repo state are stated explicitly because these numbers
> drift — see "Why this file exists" for a concrete example of what
> happens when they don't get re-verified.

**Hardware:** macOS (Apple Silicon), local development machine — not a
cloud CI runner. Absolute numbers will differ on other hardware; the
*ratios* between Rust and Python for the same operation are the more
portable finding.

**Repo state:** 2,025 skills, 101 agents, 61 hooks, 113 scripts (see
`MANIFEST.json`), 19,023 total tracked files.

**Build:** `cargo build --release --bin yana-rt` (release, optimized —
debug builds are meaningfully slower, see the caveat under Methodology).

---

## Why this file exists

README.md has claimed `yana-ai audit` is **"1256x faster than the Python
equivalent"** since the framework's early history. That number was
**already found unverified and replaced once**, on 2026-05-31
(commit `fb6a0cd7`, "Replace unverified '1256x' claim with actual
measured numbers" — real numbers then: scan ~29x, doctor ~57x, ci ~15x).
It came back on 2026-07-07 (commit `086a5db1`) when an old long-form
README was restored wholesale and this specific fix wasn't among the
things re-checked before merging.

Re-measuring today, on this repo, with the same methodology as the
original fix: **the 1256x claim is not reproducible by any measured
command, then or now.** See the Results table below. This file exists so
the next time README.md's benchmark claim is edited, there's a dated,
reproducible reference to check it against — not tribal memory of "I
think someone measured this once."

## Methodology

- **Best of 3 consecutive runs**, wall-clock time via Python's
  `time.time()` around each subprocess call (not shell `time`, which
  lacks millisecond resolution for sub-second commands on this
  platform).
- Compared pairs are the actual current implementations, not synthetic
  microbenchmarks: `target/release/yana-rt <cmd>` vs. the specific
  `core/scripts/*.py` file each Rust subcommand's own `--help` text
  names as what it replaces.
- **Debug vs. release matters a lot.** The Rust `scan` command took
  ~26s on `core/skills` (5,515 files) as a debug build vs. **4.05s** as a
  release build — about 6.4x slower unoptimized. `cargo install yana-rt`
  (what real users run) always builds release, so release is the only
  fair comparison — but this is a real trap if anyone re-runs these
  numbers against `target/debug/` and gets confused about a regression.
- Commands run against real repo content (this repo itself), not an
  empty or synthetic fixture, and against two different scales
  (`core/skills/` at 5,515 files, and the full repo at 19,023 files) to
  show how the Rust-vs-Python gap changes with workload size.

## Results

### Full-scope scan (work-dominated — the gap shrinks at scale)

| Target | Python | Rust (release) | Speedup |
|---|---|---|---|
| `core/skills/` (5,515 files) | 6.83s | 4.05s | **~1.7×** |
| `.` (19,023 files) | 35.3s (avg of 3) | 32.5s (avg of 3) | **~1.09×** |

At this scale, both implementations spend nearly all their time doing
the same fundamentally similar per-file regex/pattern work — Rust's
startup advantage becomes a rounding error against 30+ seconds of actual
scanning, and the two converge toward parity rather than diverging.
Whatever produced a 1256x (or even the May-31 fix's own 29x for `scan`)
figure was not measuring this operation at this kind of scale.

### Bounded commands (startup-dominated — the gap is real and large)

| Command | Python | Rust (release) | Speedup |
|---|---|---|---|
| `doctor .` | 298ms (avg of 3) | 24ms (avg of 3) | **~12.4×** |
| `ci .` | 50ms (avg of 3) | 22ms (avg of 3) | **~2.3×** |

`doctor` and `ci` don't scale with repo file count (environment checks
and `.github/workflows/*.yml` checks respectively) — here almost the
entire Python cost is interpreter startup, which is exactly where Rust's
near-zero startup wins decisively. Directionally consistent with the
May-31 fix's own measurements (29×/57×/15× on different hardware, two
months of codebase change ago) — the exact multiples don't match either,
which is itself the point: these numbers are not stable over time and
need periodic re-verification, not one-time measurement.

### Startup time

100-iteration average, `yana-rt --version`: **~4.15ms**.

### Memory (peak RSS, `core/skills/` scan)

| | Peak RSS |
|---|---|
| Rust (release) | ~14.4 MB |
| Python | ~26.3 MB |

~1.8× less memory — a real, modest difference, not a dramatic one. This
is consistent with the scan-time results above: per-file work is not
radically more memory-efficient in Rust here, just faster to start.

### Hook latency

`core/hooks/giamthi-halt-check.sh` (a small bash hook), 50-run average
via stdin JSON: **~4.97ms** per invocation. Bash process spawn overhead
dominates for a hook this simple.

### Guard dispatch latency (yana-rt guard token-budget)

50-run average: **~65ms** per call — **higher than expected** for an
"in-process, no subprocess spawn" fast path (the whole design point of
`yana-rt guard <name>` per its own `--help` text). Not yet root-caused,
but the leading hypothesis: `guard token-budget` acquires the ADR-008
shared lock (`src/guard/lock.rs`), and that lock's `LockGuard::drop`
(added 2026-07-23, same day as this benchmark, to fix a separate
correctness bug — see `docs/adr/ADR-008-shared-locking-infrastructure.md`)
signals its background heartbeat thread to stop and then `join()`s it,
bounded by the heartbeat thread's `POLL_INTERVAL_MS` (50ms) poll
interval — meaning every lock release can add up to 50ms of pure
wait-for-thread-to-notice latency on top of the actual work. A 0–50ms
uniform join wait averages ~25ms, which combined with process spawn and
real file I/O is directionally consistent with the measured 65ms, but
this is a hypothesis stated honestly as unverified, not a confirmed root
cause — flagging for a follow-up investigation rather than fixing here,
since fixing it is a separate, scoped task (e.g., a channel/condvar wake
instead of polling) and this file's job is to report what's measured,
not to also fix what it finds mid-report.

## Anti-patterns for this file

```
❌ Copying a number forward from an old commit/README without
   re-measuring — this file exists because that exact mistake shipped a
   debunked claim for ~6 weeks (2026-07-07 to 2026-07-23)
❌ Benchmarking target/debug/ and comparing it to a "users run release"
   claim — 6.4x difference measured directly above
❌ One scale only — this file's own results show the Rust/Python gap
   inverts in character between small bounded commands (~12x) and large
   full-repo scans (~1.1x); either number alone is misleading about "how
   much faster is Rust"
❌ Presenting a number without stating hardware/date/repo-state — these
   are exactly the three things that make old numbers stop applying
```

## References

- `git log --all --oneline -S "1256x"` — the full history of this claim,
  including the 2026-05-31 fix and its 2026-07-07 regression
- `docs/RELEASE-CHECKLIST.md` — process for keeping bundled counts
  accurate at release time (a related but distinct drift class from
  performance claims going stale)
- `core/scripts/audit_scanner.py`, `doctor.py`, `ci_check.py` — the
  Python implementations benchmarked above
