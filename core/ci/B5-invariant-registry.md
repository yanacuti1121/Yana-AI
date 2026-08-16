# B5 — Invariant / failure-policy registry (Workstream B / CI-CD Assurance)

Compact high-value invariant registry per the program document's field
set (ID, Domain, Invariant, Canonical implementation, Tests, Failure
severity, Platform scope) plus a failure-policy classification (DENY /
FAIL CLOSED / DEGRADE / RETRY / DROP / HALT / HUMAN REVIEW / CONTINUE
WITH WARNING) per entry. Built directly from the tests already located
during B1's Test-the-tests audit and B3's Miri/Fuzzing audit — this
registry doesn't re-derive that evidence, it structures it.

## Confirmed invariants (real test exists)

| ID | Domain | Invariant | Canonical impl | Test | Failure severity | Platform scope | Failure policy |
|---|---|---|---|---|---|---|---|
| INV-A3-001 | A3 State & Evidence Integrity | Concurrent processes racing to acquire the receipts-file lock serialize instead of both succeeding | `src/remote/lock.rs::acquire()` (3 `cfg` arms: unix, windows, unsupported-fallback) | `src/remote/lock.rs:133` `concurrent_lockers_serialize_instead_of_both_succeeding_at_once` | HIGH (double-write / receipt corruption risk) | **Unix only, verified in CI.** The `#[cfg(windows)]` arm exists in source but is never exercised — `rust-tests` (the job that runs this test) is `runs-on: ubuntu-latest` only. Windows lock behavior for this specific invariant has zero CI execution today. | FAIL CLOSED + RETRY (racer blocks on the lock rather than proceeding) |
| INV-A3-002 | A3 | Two racing first-writers resolving a remote session collapse into exactly one session | `src/remote/session.rs::resolve_session()` | `resolve_session_serializes_two_racing_first_writers_into_one_session` | HIGH (duplicate session state) | All (pure Rust, no `unsafe`/syscalls per B3's audit — genuinely portable, unlike INV-A3-001) | FAIL CLOSED (second racer reuses the first's result, never creates a competing session) |
| INV-A1-001 | A1 Authority & Governance | HALT still engages even when the receipt chain is already corrupted | `src/os/supervisor.rs::halt()` | `src/os/supervisor.rs:1659` `halt_still_engages_when_the_receipt_chain_is_already_corrupted` | **CRITICAL** — this is the safety backstop itself | All (no platform-conditional compilation on this path) | HALT (fail-closed by definition) |
| INV-A1-002 | A1 | New dashboard evidence never overrides an active HALT | `src/os/supervisor.rs` | `:2066` `new_dashboard_evidence_never_overrides_an_active_halt` | CRITICAL | All | HALT (precedence: an active HALT outranks incoming evidence) |
| INV-A1-003 | A1 | `self_test()` never creates a production HALT (test/production isolation) | `src/os/supervisor.rs::self_test()` | `:1830` `self_test_never_creates_production_halt` | HIGH (a false HALT from a self-test run in production would be a real operational incident, not just a test artifact) | All | DENY (self-test path is structurally barred from writing production HALT state) |

## Closed 2026-08-16 (Workstream A, pending merge)

| ID | Domain | Invariant | Canonical impl | Test | Failure severity | Platform scope | Failure policy |
|---|---|---|---|---|---|---|---|
| INV-A4-001 | A4 Model / Provider Protocols | Discord incoming-message queue is bounded — prevents unbounded memory growth under a message flood | `src/remote/discord.rs::run_gateway()` — bounded `sync_channel(DISPATCH_QUEUE_CAPACITY)` + non-blocking `try_send` (PR #218) | `dispatch_queue_rejects_over_capacity_sends_without_blocking` — fills to capacity, asserts `try_send` returns `Full` rather than blocking. Verified by reading PR #218's real diff. | MEDIUM-HIGH (resource exhaustion under adversarial/high-volume load) | All (pure Rust `std::sync::mpsc`, no platform-conditional code) | DROP (a full queue drops the incoming message with a log line; gateway thread never blocks) |
| INV-A4-002 | A4 | Ollama-daemon-unreachable returns a truthful failure to the caller rather than a silently mocked/misleading result | `src/chat/ollama_native.rs::list_installed_from()`/`running_models_from()` — HTTP status checked before parsing; missing/wrong-type `"models"` field is a distinct `Err` (PR #215) | 3 real socket-level tests (`TcpListener`, not string-mocked): live 500 with an error body → `Err`, live 200 with valid data → `Ok`, live 200 with a malformed body → `Err`. Verified by reading PR #215's real diff. | MEDIUM (wrong agent decision from misleading state) | All | FAIL CLOSED (any non-2xx or malformed-200 body is a typed `Err`, never silently `Ok(vec![])`) |
| INV-A8-001 | A8 Release & Supply Chain | AirLLM bridge admits/rejects requests per a defined admission policy | `tools/airllm-bridge/server.py::generate()`/`do_POST()` — non-blocking lock acquire (`ModelOverloaded` → 503), context-length ceiling check before GPU work (`ContextTooLong` → 400), bounded socket read timeout (PR #217) | `tools/airllm-bridge/test_server.py` (new, 8 tests) — **actually executed**, not just read: extracted from PR #217's real head commit and ran locally, 8/8 pass, including a genuine concurrency test (real thread holding the lock) and a genuine timeout test (waits for the real configured timeout) | MEDIUM-HIGH (unbounded wait queue / slowloris were real DoS vectors) | All (pure Python, `ThreadingHTTPServer`) | DENY (503 on overload, 400 on over-length prompt — both checked before expensive GPU work, not queued) |

All 3 above are contingent on PRs #215/#217/#218 merging as currently
written — re-verify against `main` after merge, don't assume this
snapshot still holds if the PR changes further.

## Gap invariants (no test exists)

| ID | Domain | Invariant (as named/implied by the priority target) | Canonical impl | Test | Failure severity | Platform scope | Failure policy |
|---|---|---|---|---|---|---|---|
| INV-A2-001 | A2 Capability & Isolation | Multi-byte/UTF-8 input to the portable command-guard validator is handled without a detection bypass at a byte boundary | `src/guard/portable.rs::check_command()` and its helpers (`strip_tok`, `split_segments`, etc.) | None — file has zero `#[test]` entries. Re-confirmed 2026-08-16: no currently-open Workstream A PR touches this file. | MEDIUM-HIGH (a bypass of a destructive-command detector is security-relevant, not cosmetic) | All | **UNDEFINED** |

## What's new in this pass vs. prior B1/B3 findings

The original 4 gap rows restated B1's Test-the-tests gaps — not
duplicated analysis, just reformatted into the registry's required
fields. **Updated 2026-08-16**: 3 of those 4 (INV-A4-001, INV-A4-002,
INV-A8-001) closed via Workstream A PRs #218/#215/#217 respectively,
each independently verified against real diffs/test execution before
being moved to the "Closed" section above — only INV-A2-001 remains.
The one
genuinely new finding in this document is **INV-A3-001's platform-scope
column**: the receipt-lock race test was already known to exist and
pass (B1 marked it COVERED), but tracing *where* it actually runs
(`rust-tests`, `runs-on: ubuntu-latest`, confirmed by reading the
workflow file directly) surfaces that its Windows `cfg` arm has never
been exercised by CI, despite "locks" and "receipts" both being named
explicitly in the program document's own "critical paths [that] always
escalate" list. A test that only proves the invariant holds on one of
two implemented platforms is a materially different claim than "the
invariant holds," and the registry format is what made that distinction
visible — a plain pass/fail CI badge would not have.

## Disposition

**Updated 2026-08-16**: 3 of the original 4 UNDEFINED failure-policy
gaps are now resolved (see "Closed" section above) — Workstream A made
the implementation decisions this registry originally said were needed
before a test could be written (bound the Discord queue via DROP,
fail-closed Ollama's HTTP-status/malformed-body handling, DENY-via-503
for AirLLM admission). Only INV-A2-001 still requires a policy decision
before a test can be written against it — consistent with B3's finding
that some of Test-the-tests' gaps are implementation-decision gaps, not
test-writing gaps.
INV-A3-001's Windows coverage gap is actionable independently of any
policy decision: it's a CI job scoping question (should `rust-tests`
run its full suite on a Windows leg, or should Windows-specific lock
tests move into `system-health-monitor`'s existing Windows leg?) — left
as an open item rather than decided unilaterally here, since widening
`rust-tests`' matrix is a real CI-time/cost tradeoff (see the companion
governance registry's CI-cost section).
