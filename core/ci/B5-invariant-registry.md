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

## Gap invariants (no test exists — carried forward from B1/B3, now registry-formalized)

| ID | Domain | Invariant (as named/implied by the priority target) | Canonical impl | Test | Failure severity | Platform scope | Failure policy |
|---|---|---|---|---|---|---|---|
| INV-A4-001 | A4 Model / Provider Protocols | Discord incoming-message queue is bounded — prevents unbounded memory growth under a message flood | **None.** `src/remote/discord.rs` uses an unbounded `std::sync::mpsc::channel` | None | MEDIUM-HIGH (resource exhaustion under adversarial/high-volume load; not a memory-safety bug, a liveness/DoS one) | N/A — no bound implemented | **UNDEFINED.** No policy decided (DROP oldest? DENY new senders? DEGRADE by widening the channel?) — this has to be decided before a test can pin behavior |
| INV-A4-002 | A4 | Ollama-daemon-unreachable returns a truthful failure to the caller rather than a silently mocked/misleading result | Unclear — `src/chat/ollama_native.rs`'s own doc comment admits fixture-only testing | None against a real/simulated unreachable daemon | MEDIUM (wrong agent decision from misleading state, not data loss) | All | **UNDEFINED** |
| INV-A2-001 | A2 Capability & Isolation | Multi-byte/UTF-8 input to the portable command-guard validator is handled without a detection bypass at a byte boundary | `src/guard/portable.rs::check_command()` and its helpers (`strip_tok`, `split_segments`, etc.) | None — file has zero `#[test]` entries | MEDIUM-HIGH (a bypass of a destructive-command detector is security-relevant, not cosmetic) | All | **UNDEFINED** |
| INV-A8-001 | A8 Release & Supply Chain | AirLLM bridge admits/rejects requests per a defined admission policy | `tools/airllm-bridge/server.py` | None — no test infrastructure of any kind exists for this component | UNKNOWN (not reviewed in depth; Workstream A territory) | Unknown | **UNDEFINED** |

## What's new in this pass vs. prior B1/B3 findings

The 4 gap rows restate B1's Test-the-tests gaps — not duplicated
analysis, just reformatted into the registry's required fields. The one
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

All 4 UNDEFINED failure-policy gaps require a policy decision (by
whoever owns that runtime subsystem) before a test can be written
against them — consistent with B3's finding that some of Test-the-
tests' gaps are implementation-decision gaps, not test-writing gaps.
INV-A3-001's Windows coverage gap is actionable independently of any
policy decision: it's a CI job scoping question (should `rust-tests`
run its full suite on a Windows leg, or should Windows-specific lock
tests move into `system-health-monitor`'s existing Windows leg?) — left
as an open item rather than decided unilaterally here, since widening
`rust-tests`' matrix is a real CI-time/cost tradeoff (see the companion
governance registry's CI-cost section).
