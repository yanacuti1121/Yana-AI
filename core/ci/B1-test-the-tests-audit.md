# B1 — Test-the-tests audit (Workstream B / CI-CD Assurance)

Status: Known/Unknown, evidence-based per 70-context-faithfulness-law and
69-cognitive-reliability-law. Not a scorecard number — a categorical status
per target, per B1's own "Categorical scorecard" rule (never a fake numeric
safety score).

Method: for each of the 7 priority targets named in the Workstream B
document's "Test-the-tests" section, searched the actual source tree for a
regression test whose name/body demonstrably exercises that specific
failure mode (`grep` across `src/`, `tests/`, `tools/airllm-bridge/`; no
code was modified or reverted to attempt a live red/green proof, since
these subsystems belong to Workstream A's ownership — mutating them here
would be a scope violation under 64-scope-drift-law).

## Findings

| # | Priority target | Status | Evidence |
|---|---|---|---|
| 1 | receipt race | **COVERED** | `src/remote/lock.rs:133` `concurrent_lockers_serialize_instead_of_both_succeeding_at_once` — spawns concurrent lockers against the same receipts-file lock path and asserts they serialize instead of double-succeeding. |
| 2 | remote session race | **COVERED** | `src/remote/session.rs` `resolve_session_serializes_two_racing_first_writers_into_one_session` — two racing first-writers on session resolution, asserts one session results. |
| 3 | Discord queue bound | **CLOSED 2026-08-16 — Workstream A PR #218** | `src/remote/discord.rs` now uses a bounded `sync_channel(DISPATCH_QUEUE_CAPACITY)` + non-blocking `try_send` (was `std::sync::mpsc::channel` — genuinely unbounded, as this audit originally found). Real regression test `dispatch_queue_rejects_over_capacity_sends_without_blocking` fills the queue to capacity with nothing draining it and asserts `try_send` returns `Full` rather than blocking. Verified by reading PR #218's actual diff directly (`gh pr diff 218`), not inferred from its title — the diff shows the exact unbounded-channel code this audit originally cited (`src/remote/discord.rs:277,558,618`) replaced with the bounded version. PR #218 is OPEN, not yet merged to `main`. |
| 4 | multi-byte validator | **GAP** | No test found. `src/guard/portable.rs` — the module name suggests this is the home for a portable/multi-byte input validator — has **zero** `#[test]` entries (confirmed: `grep -n "#\[test\]" src/guard/portable.rs` returns nothing). `src/guard/mod.rs` has UTF-8-adjacent tests (`tokenize_key_splits_*`) but those test word-boundary tokenization, not multi-byte/UTF-8 boundary validation. Re-checked 2026-08-16 against Workstream A's currently open PRs (#211-#219) — none touch `src/guard/portable.rs`. Still open. |
| 5 | HALT authority | **COVERED** | `src/os/supervisor.rs:1659` `halt_still_engages_when_the_receipt_chain_is_already_corrupted` and `:2066` `new_dashboard_evidence_never_overrides_an_active_halt` — both directly test HALT-authority edge cases (corrupted receipt chain, evidence-vs-halt precedence). |
| 6 | Ollama truthful failure state | **CLOSED 2026-08-16 — Workstream A PR #215** | `src/chat/ollama_native.rs` now checks `response.status()` before parsing (a 4xx/5xx no longer silently becomes `Ok(vec![])`) and distinguishes a genuinely-empty install from a malformed body (missing/wrong-type `"models"` field is now its own `Err`, not silently defaulted). Verified by reading PR #215's actual diff (`gh pr diff 215`): real socket-level tests on a bound `TcpListener` (not string-mocked) cover a live 500 with an error body, a live 200 with valid data, and a live 200 with a malformed body — the exact "daemon reachable but lying" case this audit's original GAP finding named. PR #215 is OPEN, not yet merged. |
| 7 | AirLLM admission | **CLOSED 2026-08-16 — Workstream A PR #217** | `tools/airllm-bridge/server.py` now rejects a second concurrent request with `503` (non-blocking lock acquire, `ModelOverloaded`) instead of queueing indefinitely, rejects an over-length prompt with `400` before the GPU-bound `.generate()` call (`ContextTooLong`), and bounds socket reads (`Handler.timeout`) against a slowloris-style stalled client. `tools/airllm-bridge/test_server.py` (new, 276 lines) is a real regression suite — **actually run locally against PR #217's exact code before marking this closed** (not just read): extracted `server.py`/`test_server.py` from the PR's head commit via `git show <sha>:<path>` and ran `python3 test_server.py -v` directly — 8/8 tests pass, including a real-concurrency test (one thread genuinely holds the lock while a second real request is fired) and a real-timeout test (a stalled socket write, waits for the actual `SOCKET_READ_TIMEOUT_SECS`). No `airllm`/`torch` dependency needed — the model is faked at the `tokenizer`/`generate` surface. PR #217 is OPEN, not yet merged. |

## Summary

- **6 of 7** priority targets now have a real, verified regression test —
  up from 3 of 7 at this audit's original writing.
- **3 of the 4 originally-GAP targets closed 2026-08-16** by Workstream A
  (PRs #215, #217, #218), each independently verified against the PR's
  actual diff/code — not inferred from PR titles, per this refresh's own
  standing instruction to "mark each target only after reading/testing
  final code." All 3 are still OPEN PRs on `main`, not merged — this
  table reflects what the fix looks like once merged, not the current
  state of `main` itself. Re-verify after actual merge, since an open
  PR can still change before landing.
- **1 of 7** (multi-byte validator, `src/guard/portable.rs`) remains a
  genuine, unaddressed GAP — confirmed no open Workstream A PR touches
  this file.
- **2 of 7** (receipt race, HALT authority) were already COVERED at
  this audit's original writing and are unaffected by this refresh.

## Disposition

The one remaining gap (#4, multi-byte validator) is unchanged from the
original finding: it's a Runtime subsystem (Workstream A's ownership),
writing a test against `src/guard/portable.rs` without Workstream A's
involvement risks pinning behavior nobody has confirmed correct, and
`64-scope-drift-law` still applies. Recorded as the one item still open
for the eventual Workstream A/B reconciliation and B9's final report.

The 3 closures above are contingent on PRs #215/#217/#218 actually
merging as reviewed — if any changes materially before merge, this
table's evidence should be re-verified against the merged code, not
assumed to still hold from this snapshot.
