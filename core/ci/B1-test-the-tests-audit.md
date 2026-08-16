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
| 3 | Discord queue bound | **GAP** | `src/remote/discord.rs:277,558,618` all use `std::sync::mpsc::channel::<Incoming>()` — an **unbounded** channel. No capacity limit, no test asserting the queue is bounded or that backpressure/drop occurs under overload. If "queue bound" was meant as an enforced invariant, it does not currently exist in the implementation, so there is nothing a test could pin. |
| 4 | multi-byte validator | **GAP** | No test found. `src/guard/portable.rs` — the module name suggests this is the home for a portable/multi-byte input validator — has **zero** `#[test]` entries (confirmed: `grep -n "#\[test\]" src/guard/portable.rs` returns nothing). `src/guard/mod.rs` has UTF-8-adjacent tests (`tokenize_key_splits_*`) but those test word-boundary tokenization, not multi-byte/UTF-8 boundary validation. |
| 5 | HALT authority | **COVERED** | `src/os/supervisor.rs:1659` `halt_still_engages_when_the_receipt_chain_is_already_corrupted` and `:2066` `new_dashboard_evidence_never_overrides_an_active_halt` — both directly test HALT-authority edge cases (corrupted receipt chain, evidence-vs-halt precedence). |
| 6 | Ollama truthful failure state | **GAP (self-documented)** | `src/chat/ollama_native.rs`'s own module doc comment (lines 17-20) states: "the parsing/formatting logic here is fixture-tested ... not live-tested against a real Ollama daemon — this environment has none reachable at startup." No test exercises the actual "daemon unreachable → does the caller get a truthful failure, not a silent/mocked success" path — the property the priority target names. |
| 7 | AirLLM admission | **GAP** | `tools/airllm-bridge/` contains only `server.py` — no test file of any kind (`find tools/airllm-bridge -iname "test*"` returns empty). No admission-control test exists because no test infrastructure exists for this component at all. |

## Summary

- **3 of 7** priority targets have a real, named regression test that
  matches the failure mode.
- **4 of 7** are gaps, and they're not uniform in kind:
  - #3 (Discord queue bound) and #6 (Ollama truthful failure) are cases
    where the underlying *implementation* may not actually provide the
    property the target name assumes — the test gap may be downstream of
    an implementation gap, not just a missing test.
  - #4 (multi-byte validator) is a missing-tests-for-existing-module gap.
  - #7 (AirLLM admission) is a missing-test-infrastructure gap — the
    whole component has no tests, not just this one.

## Disposition

This audit does not attempt to close these 4 gaps in this pass:
- All 4 targets are Runtime subsystems (Workstream A's declared
  ownership per the program's ownership contract), and #3/#6 may need an
  implementation decision (should the Discord queue actually be bounded?
  should Ollama-unreachable return a typed error?) before a test can be
  written against them.
- Writing tests against code this workstream doesn't own, without that
  ownership decision, risks pinning behavior nobody has actually
  confirmed is correct.

Recorded here as Workstream B's evidence-based input for Workstream A's
handoff (see "WORKSTREAM B — INPUT REQUIRED FROM A BEFORE FINAL VERDICT"
in the program document) and for this workstream's own B9 final report,
which must state these as either resolved or explicit accepted debt —
not omitted.
