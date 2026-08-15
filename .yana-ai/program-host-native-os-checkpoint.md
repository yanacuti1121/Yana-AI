# Host-Native OS Program — Checkpoint

**PROGRAM COMPLETE.** All 20 phases resolved: 18 implemented and checkpointed, Phase 14 explicitly deferred with a documented reason, none silently skipped.

## Closure pass (post-Phase-20, anh Tâm's explicit continuation instruction)

**Correction to Phase 20's own finding, made with evidence:** Phase 20's checkpoint entry said
`os::service::*` had "zero live callers anywhere." That was **wrong** for `os::service::manager`
and `os::service::runtime` — grep against `src/os/mod.rs` shows `OsAction::Service` already
dispatches to `dispatch_resident_service()`, which calls `service::runtime::manager()`/`preflight()`/
`run()` for real, for every one of `install`/`start`/`stop`/`restart`/`status`/`uninstall`/`run`.
The error came from generalizing from `os::service::watchdog.rs`'s genuine dead code (confirmed:
nothing calls `Watchdog::new`) to the whole `os::service` tree, without checking `manager.rs`/
`runtime.rs` individually. Corrected here rather than left standing, per this program's own
"never claim without verification" discipline applied to its own prior claims.

**What was actually true, and what this closure pass did about it:**
- `os::service::manager` (`ServiceManager` — cross-platform install/start/stop/restart/status/
  uninstall, atomic definition writes, rollback-on-activation-failure) — **live, correct, kept as-is.**
- `os::service::runtime` (`run()` — the real resident payload: single-instance `flock-v1` lock,
  HALT-aware — checks the halt lock every loop iteration and sleeps through it rather than
  ticking or exiting, never clears it — calls `os::supervisor::tick_resident` directly, in-process,
  in a loop) — **live, correct, kept as-is.** Live-verified this closure pass: started the real
  binary's `os service run` in the background on a scratch dir, confirmed the process stays alive
  and ticks silently with zero errors for several seconds, then terminates cleanly on `SIGTERM`.
  Also verified `os service status` end-to-end against the real macOS `launchd` path resolution.
- `os::service::watchdog` (`Watchdog`/`WatchdogConfig` — restart a separate governed CHILD
  process with exponential backoff) — **confirmed genuinely dead, not merely unwired: an
  abandoned alternate design.** The real resident service (`runtime::run()`) does not spawn or
  supervise an inner child at all; it performs the supervised work directly in its own process,
  relying on the OS service manager's own restart policy (`KeepAlive`/`Restart=always`) if the
  resident process itself exits. Nothing in the live-wired path ever constructs a `Watchdog`.
  **Removed** (`git rm src/os/service/watchdog.rs`) — 6 tests removed with it, all of them real
  and well-written, but testing a design that was never the one actually running.
- `src/monitor/health.rs` (`HealthRegistry`/`ComponentHealth`/`HealthState`/`ServiceHealthSnapshot`)
  — used **only** by the now-removed `watchdog.rs` (confirmed by grep: zero other references
  anywhere in the crate). **Removed** — 4 tests removed with it. `BoundedBackoff` (same
  `src/monitor/` tree, a different file — `backoff.rs`) is genuinely live (`os::service::runtime::
  run()`'s own error-backoff) and was **kept**, along with its own file and tests untouched.
- `os::service::attribution`'s governed-spawn machinery (`spawn`/`GovernedChild`/`ProcessAttribution`
  and helpers) — **kept, not removed.** `attribution::spawn` has two callers: the now-removed
  `watchdog.rs`, and `os::platform::process::spawn_plan` (Phase 10's own, separately and
  correctly disclosed, not-yet-CLI-wired groundwork — a real, different, already-documented
  deferral, not obsolete). `ProcessAttribution` is also used as a type by `os::identity::actor`
  (Phase 12). Deleting this would have broken legitimate, already-scoped Phase 10/12 work to
  clean up an unrelated Phase 4 design that happened to share one function call.
- `src/os/service/mod.rs` and `src/monitor/mod.rs` doc comments rewritten to describe the real
  design (in-process resident loop, not a child-process watchdog) accurately.

**Verification after this consolidation:** `cargo build --features cli` succeeds (105 warnings,
down from 121 pre-closure — consistent with removing genuinely dead code, not a regression).
Full suite: **519 passed, 0 failed** (529 pre-closure − 10 removed tests, exactly accounted for:
6 from `watchdog.rs`, 4 from `monitor/health.rs`). No other test suite size change — nothing else
was touched.

**`docs/programs/PROGRAM-K-YANA-OS-SKELETON.md`'s Phase-20 addendum (written before this
correction was known) is also now inaccurate** where it named `os::service::*` as entirely
dead pending a human decision — being corrected in the same file as part of this closure pass
(see that file directly; not duplicated here).

**Receipt-rotation continuity anchor — DONE.** Phase 17's rotation produced independently-
verifiable segments, not one continuous chain across the archive boundary — a real gap between
the "tamper-evident receipt chain" claim and the mechanism. Fixed with an explicit anchor, not by
weakening the claim:
- `RotationAnchor{previous_hash, previous_sequence, archived_path}` written (atomically, via the
  file's existing `write_json_atomic`) to a sibling `.anchor` file **before** the rename in
  `maybe_rotate_receipts_over` — ordering is deliberate: a crash between anchor-write and rename
  just retries the rotation idempotently; the reverse ordering could silently start a disconnected
  chain.
- `append_receipt_at` now seeds every append from `active_segment_seed()` (the anchor if one
  exists for this file, `GENESIS`/1 otherwise) instead of hardcoding `GENESIS`. The first entry
  written into a new segment after rotation therefore has `previous_hash` equal to the archived
  segment's REAL last entry's hash, and `sequence` continues rather than resetting to 1 — live,
  in-data continuity, not a separately-trusted claim.
- `verify_receipts` (what `dashboard()`/`os status` report as `receipt_chain_valid`/`receipt_count`)
  now walks EVERY archived segment (oldest first, via `archived_segments()`) plus the active file,
  **re-deriving** each segment's continuation seed from the real previous segment's actual last
  entry rather than trusting the anchor's stored copy — so a tampered `.anchor` file can at worst
  cause a future append to later fail full verification, never a silently-accepted forged chain.
- `verify_receipts_at`/`verify_active_segment` (single-file view, used by `append_receipt_at`'s own
  pre-append tamper check) also became anchor-aware — a real bug caught by this closure pass's own
  first-draft tests: checking a post-rotation active file against a hardcoded `GENESIS` always
  failed, since that file's real first entry correctly does NOT start at `GENESIS` anymore.
- 2 new tests, both passing on first correct implementation (after fixing the above bug):
  `the_entry_written_after_rotation_cryptographically_references_the_archived_segments_last_entry`
  and `tampering_with_an_archived_segment_is_caught_by_the_full_chain_walk_even_though_the_active_
  segment_alone_looks_fine` (proves the exact property asked for: full-chain verify catches archive
  tampering that a single-segment check cannot). One pre-existing test's assertion was corrected
  to match the new, intentionally-correct full-chain count (was asserting the old, narrower
  single-segment semantics). Full suite: **521 passed, 0 failed** (519 + 2 new). `rustfmt`/`clippy`
  clean.

**Full gate matrix + invariant audit — DONE.** All re-run fresh, after the `os::service`
correction and the receipt-rotation anchor fix, not reused from earlier in the session:
- `cargo build`/`cargo test` (default features): 6+521+521+64(1 ignored)+3+0 — 0 failures.
- `cargo build`/`cargo test --features cli`: 521/521 (+ same integration suites) — 0 failures.
- `cargo build`/`cargo test --features mcp`: 523/523 (2 mcp-only tests included) — 0 failures.
- `cargo check --no-default-features --features wasm`: succeeds on native target (actual wasm32
  cross-compile still blocked by a missing local rustup target — unrelated environment gap, not
  this program's code, not fixed since installing a new toolchain component is out of scope).
- `rustfmt --check` on every file this closure pass touched: clean.
- `cargo clippy` under `--features cli`/`--features mcp`/`--no-default-features --features wasm`:
  **0 errors** in all three.
- `bash core/scripts/verify-core-lock.sh`: **PASS**, 0 drift/missing/extra (confirms nothing under
  `core/` was touched — correct, this closure pass only touched `src/`/`docs/`/`.yana-ai/`).
- `bash core/tests/hooks/run-hook-tests.sh`: **315/315 PASS, 0 skipped** (a `cargo build --release`
  was run specifically to stop 4 `guard-blast-radius.sh` cases from being skipped for lack of a
  release binary — closing that gap rather than leaving it silently skipped). One real, caused-by-
  this-session failure was found and fixed here: `git rm`-ing `watchdog.rs`/`health.rs` had staged
  those deletions, breaking `commit-gate.sh`'s "Allow empty staged list" test, which probes this
  repo's real git index rather than an isolated fixture — fixed with `git restore --staged` (keeps
  the working-tree deletion, matches how every other change this session has stayed unstaged
  until the deliberate commit step, does not touch the file content itself).
- Invariant audit, all re-verified with fresh live evidence against the real compiled CLI (not
  reused from earlier phases' evidence):
  - **Lease cannot escalate actor authority / Sovereign non-overridable**: issued a lease covering
    `merge_protected_branch`'s exact scope name, `os autonomy classify` still returned
    `human_approval_required`/`sovereign`, reason `"sovereign operations are never automatic"`.
    Attempting to issue a `sovereign`-scoped lease directly still fails at construction.
  - **HALT precedence**, now specifically against the newly-corrected `os service run` (the real
    resident service, not previously live-tested under an active HALT this session): set a real
    HALT, started `os service run` in the background, confirmed via `os supervisor status --json`
    that `mode: "halted"` and `heartbeat: null` — the resident process stayed alive but performed
    zero supervised ticks while halted, then a human `unlock` ceremony cleared it. Exactly the
    documented, intended behavior.
  - **Secret redaction**: `secrets::`/`service::attribution::` test suites re-run fresh — 5/5 and
    10/10 respectively, including the live macOS Keychain round-trip and the argv-redaction tests.
  - **Duplicate host probing / duplicate authority / host-specific logic leaking above the
    platform boundary**: unaffected by this closure pass's actual edits (doc-comment rewrites and
    dead-code removal only in `os::service`/`monitor`; the receipt-rotation anchor is pure logic
    inside `os::supervisor`, no new host probing). Phase 16/18/20's own audits already covered
    these; nothing in this closure pass reopens them.
  - **Dead/unwired production abstractions**: re-surveyed post-consolidation. Remaining
    intentionally-unwired-but-legitimate items, all previously disclosed, none new:
    `os::platform::process::spawn_plan`/`attribution::spawn` (Phase 10), `model::placement`
    (Phase 7), `Actor::human`/`from_process_attribution`/`as_receipt_actor` (Phase 12).
  - **Receipt rotation continuity / archive verification across the rotation boundary**: see the
    anchor section above — 2 new tests prove exactly this property, both passing.

## Phase-count reconciliation (exact, written once so no future session has to re-derive it from conversation context)

The program actually spans **Phase 0 through Phase 20 — 21 phases total.** An earlier status
report said "18/20 phases implemented," which is accurate only if Phase 0 is folded into the
implemented count while the "20" label refers loosely to "Phases 1–20." That ambiguity is
resolved here, explicitly, once. Phase 0's existence is never dropped — it is listed below,
outside the mandated Phase 1–20 table, so the table itself has exactly 20 rows as required.

**Phase 0 (outside the 1–20 table):**

| Phase | Name | Status | Evidence path |
|---|---|---|---|
| 0 | Platform Contract | IMPLEMENTED | `src/os/platform/contract.rs` — small per-concern traits (`TelemetryBackend`, `AcceleratorBackend`, `ProcessBackend`, `IsolationBackend`, `SecretBackend`), no per-OS implementation yet (the file's own doc comment: "Nothing here is implemented per-OS yet; that starts Phase 2") |

**Phase 1–20 (the mandated table, exactly 20 rows):**

| Phase | Name | Status | Primary evidence path | Justification |
|---|---|---|---|---|
| 1 | Telemetry Extraction | IMPLEMENTED | `src/os/platform/{macos,linux,windows}/telemetry.rs` | Per-OS telemetry extracted from `os::monitor` as free functions, straight moves, zero behavior change |
| 2 | Host Profile | IMPLEMENTED | `src/os/platform/profile.rs` | `HostProfile` normalized type; per-OS `TelemetryBackend` implementations wired here (matches `contract.rs`'s own "that starts Phase 2") |
| 3 | Capability Discovery | IMPLEMENTED | `src/os/platform/capabilities.rs` | `Support` tri-state (`Unknown`/`Supported`/`Unsupported`) + `PlatformCapabilities` fingerprint; "never equate UNKNOWN with FALSE" established here as a working rule reused by every later phase |
| 4 | Service Backend | IMPLEMENTED | `src/os/service/{mod,manager}.rs`, later reorganized — `launchd.rs`/`systemd.rs`/`windows.rs` deleted and moved into `platform/*/service.rs` during Phase 9's refactor | Original per-OS service-definition backend; superseded in place, not abandoned (see Phase 9 row) |
| 5 | Resource Management | IMPLEMENTED | `src/os/resource/{policy,topology,pressure,reservation,placement}.rs` | File's own doc comment: "Host-aware compute resource management (Phase 5 of the host-native-os program)" |
| 6 | Model Plane | IMPLEMENTED | `src/model/{mod,provider,catalog,requirements,runtime}.rs` | Promoted from `chat::provider`; chat behavior regression-tested, not rewritten |
| 7 | Model Placement | IMPLEMENTED | `src/model/placement.rs` | Deterministic, explainable (`reasons: Vec<String>`) placement reusing `os::resource::placement`; not wired to a live CLI caller yet — a stated, deliberate deferral of wiring, not of implementation |
| 8 | Host Event Model | IMPLEMENTED | `src/os/platform/events.rs` | Native event detection + periodic reconciliation, later wired into the supervisor tick in Phase 9 |
| 9 | Giám Thị Host-Native Integration | IMPLEMENTED | `src/os/supervisor.rs` (`dashboard()`, `reconcile_events()`) | Supervisor consumes Phase 3/5/8 evidence; HALT/quarantine authority functions themselves byte-for-byte unchanged, verified via diff |
| 10 | Process + Isolation Backends | IMPLEMENTED | `src/os/platform/process.rs`, `macos/isolation.rs` | Live-verified against real `sandbox-exec` (adversarial SBPL-injection test); not wired to a live CLI caller yet, same deliberate-deferral shape as Phase 7 |
| 11 | Secure Secret Backend | IMPLEMENTED | `src/os/platform/{macos,linux,windows}/secrets.rs`, `os::credential.rs` | macOS live-verified against real Keychain end-to-end through the compiled CLI; Linux/Windows written with equal care, pure-logic tested, honestly disclosed as not live-verified (no such machine available) |
| 12 | Actor Identity | IMPLEMENTED | `src/os/identity/{mod,actor}.rs` | `Actor`/`ActorId`/`ActorKind`, normalized view over 3 pre-existing identity shapes; live-wired into `os::agent::AgentInventory.actors` |
| 13 | Capability Leases | IMPLEMENTED | `src/os/identity/{lease,lease_store}.rs`, `os::autonomy::evaluate_for_actor` | `namespace[:path-glob]` scope taxonomy, sovereign-scope rejection enforced at construction, persisted store; live-verified end-to-end including the Sovereign non-escalation invariant on the real CLI |
| 14 | Trust / Evidence Aggregation | **DEFERRED** | `.yana-ai/program-host-native-os.json`'s `deferred_phases` entry | Spec's own conditional clause: "if implementation would be speculative or weak, explicitly defer rather than creating fake trust infrastructure." Investigated `os::health.rs` (stateless) and the supervisor receipt chain (real but narrow — only 4 safety-event categories; `QueuedAction` has no actor field). Aggregating only what exists would be exactly the forbidden "fake trust infrastructure" |
| 15 | Unified OS Status | IMPLEMENTED | `src/os/status.rs` | `UnifiedStatus{host,yana,safety,host_capabilities}` replacing the old flat `OsStatus`; live-verified real data on this machine |
| 16 | Client Boundary | IMPLEMENTED | `src/capability/system.rs` (`host_summary` rewrite) | Audit found and fixed one real client-side host-probing duplication; verified correct under its real reachable path (`--features mcp`) in Phase 20 |
| 17 | Storage Semantics | IMPLEMENTED | `src/os/supervisor.rs` (`maybe_rotate_receipts`) | Audit found and fixed one real gap: unbounded receipt-chain growth, now rotates with archive-and-continue |
| 18 | Cross-Platform Test Matrix | IMPLEMENTED | `src/os/platform/{linux/secrets,mod}.rs` (`cfg(any(test, ...))` widening) | Audit found and fixed two real gaps: platform-gated code with zero cross-platform-testable surface |
| 19 | Continuity Hardening | AUDIT-ONLY | This checkpoint file's own consolidation (Phases 0–17 condensed) | Phase 19's own instruction is "continue maintaining" the checkpoint files — a process/documentation mandate, not a code-writing one; correctly produced zero `src/` changes |
| 20 | Final Architectural Consolidation | AUDIT-ONLY | `docs/programs/PROGRAM-K-YANA-OS-SKELETON.md` addendum | Phase 20's own 10-step instruction is itself an audit/verification checklist (trace/find/verify, steps 1–9) plus a documentation step (10); correctly produced one doc change and zero `src/` code changes |

**Reconciliation with the earlier "18/20" report:** 18 phases are IMPLEMENTED when Phase 0 is
counted alongside Phases 1–20 (0,1,2,3,4,5,6,7,8,9,10,11,12,13,15,16,17,18 = 18 phases). Within
the strict Phase 1–20 table above (20 rows, Phase 0 excluded), the count is **17 IMPLEMENTED + 1
DEFERRED (14) + 2 AUDIT-ONLY (19, 20) = 20.** No phase besides 14 was left unimplemented in the
sense of "skipped" — 19 and 20 were never code-writing phases by their own spec text; classifying
them as IMPLEMENTED would have been the actual misstatement.
**Current architecture:** `origin/main` (commit `92678c0c`, PR #199 Giám Thị control plane unification) + Phases 1–13 and 15–20 of the host-native-os program, all uncommitted in this worktree (nothing has been committed to git at any point in this program — every phase exists only as working-tree changes on the `claude/host-native-os-program` branch).
**Real, verifiable diff (as of Phase 20's own `git status`/`git diff --stat`):** 19 tracked files modified/deleted, 39 new files (38 in `src/model`, `src/os/identity`, `src/os/platform`, `src/os/resource` + `src/os/status.rs`), net `+1077/-1796` lines on the modified/deleted tracked files alone. 531 tests pass under `--features mcp` (529 under `--features cli`), 0 failures, verified fresh at the end of this phase.

## Consolidated summary, Phases 1–17 (condensed here per Phase 19 — Continuity Hardening; this file was growing unbounded with full per-phase sections repeating detail already superseded, the exact anti-pattern Phase 17 fixed for `supervisor-receipts.jsonl`. Nothing below is lost — it is compressed, the same "archive, don't delete" principle Phase 17 applied to receipts.)

- **Phases 0–4**: Platform Contract, Telemetry Extraction, Host Profile + Capability Discovery, Service Backend. `src/os/platform/{contract,capabilities,profile,mod}.rs` + per-OS `{macos,linux,windows}/telemetry.rs`.
- **Phase 5**: Resource management — `src/os/resource/{policy,topology,pressure,reservation,placement}.rs`.
- **Phase 6**: Model plane promoted from `chat::provider` into `src/model/{mod,provider,catalog,requirements,runtime}.rs`.
- **Phase 7**: Deterministic model placement — `src/model/placement.rs`, reusing `os::resource::placement`.
- **Phase 8**: Host event model — `src/os/platform/events.rs` (native events + periodic reconciliation).
- **Phase 9**: Giám Thị host-native integration — `os::supervisor::dashboard()` surfaces Phase 3/5/8 evidence; HALT/quarantine authority itself untouched.
- **Phase 10**: Process + isolation backends — `src/os/platform/process.rs` + `macos/isolation.rs` (live-verified against real `sandbox-exec`).
- **Phase 11**: Secure secret backend — `src/os/platform/{macos,linux,windows}/secrets.rs` (macOS live-verified against real Keychain), `os::credential.rs`.
- **Phase 12**: Actor identity — `src/os/identity/{mod,actor}.rs` (`Actor`/`ActorId`/`ActorKind`, normalized view over `ManagedAgent`/`ProcessAttribution`/chat sessions), `os::agent::AgentInventory.actors` (live-wired).
- **Phase 13**: Capability leases — `src/os/identity/{lease,lease_store}.rs` (`namespace[:path-glob]` scope taxonomy, sovereign-scope rejection at construction, persisted store), `os::autonomy::evaluate_for_actor()` (additive, `evaluate()` untouched), `os identity lease {issue,list,revoke}` + `os autonomy classify --actor` CLI, live-verified end-to-end including the Sovereign non-escalation invariant.
- **Phase 14**: Trust/Evidence Aggregation — **explicitly deferred**, not implemented. Investigated `os::health.rs` (stateless, nothing to aggregate) and `os::supervisor`'s receipt chain (real per-actor evidence, but narrow — only 4 safety-event categories, `os::autonomy::QueuedAction` has no actor field at all). Aggregating only what exists would be the "fake trust infrastructure" this phase's own spec text explicitly forbids. Prerequisite: actor attribution in `QueuedAction` and/or lease-usage receipts — neither exists yet.
- **Phase 15**: Unified OS status — `src/os/status.rs` (`UnifiedStatus{host,yana,safety,host_capabilities}`), replaced the old flat `OsStatus`; live-verified real CPU/memory/accelerator/capability/receipt-chain data.
- **Phase 16**: Client boundary — audited `mcp.rs`/`chat/tui` for host-probing duplication; found and fixed one real instance (`capability::system::host_summary` re-implementing raw, Windows-blind host probing instead of using `os::resource::topology::collect()`).
- **Phase 17**: Storage semantics — audited STATE/OBSERVATION/EVENT/EVIDENCE separation; found and fixed one real gap (`os::supervisor`'s receipt chain had no retention/rotation, now rotates at 5MB via archive-and-continue, verification algorithm untouched); disclosed the identical gap in `os::service::attribution`'s spawn receipts without fixing it (dead code, no live caller).

Every phase above independently ran its full verification (unit tests, `rustfmt`, `clippy`, and — for phases touching live-observable behavior — the real compiled CLI against this actual machine) before being checkpointed; none of that evidence is re-stated here, only the outcome.

## Changed files, Phase 18
- `src/os/platform/linux/secrets.rs`, `src/os/platform/mod.rs` — widened `cfg(target_os = "X")`-only fallback/backend code to `cfg(any(test, target_os = "X"))` so it compiles and runs cross-platform. 5 new tests.

## Changed files, Phase 19
None — consolidated this checkpoint file itself (see the note preserved at the top of the "Consolidated summary" section above).

## Changed files, Phase 20
- `docs/programs/PROGRAM-K-YANA-OS-SKELETON.md` — the only change this phase made. Added a dated addendum reconciling this session's Phases 0–20 with the pre-existing, human-approved "Program K — Yana OS" architecture doc (discovered during this phase's own audit — was not known to this session before now). States plainly which ADS v1-table "BLOCKED" items now have real code (process supervisor, credential presence detection, managed-agent authorization, host-event scheduler) and which remain genuinely blocked (kernel CPU/RAM enforcement, schema migration, full Windows mutation). Explicitly disambiguates the two unrelated Phase-numbering schemes (ADS v1's own Phase 3/4/5 vs. this program's Phase 0–20) so a future reader cannot conflate them. Names `os::service::*`'s fate as an open decision for anh Tâm, not something this phase resolved unilaterally.

## Phase 20 audit findings (the 10-step checklist, verbatim from the spec, applied)

1. **Trace the full live execution path** — confirmed `main.rs`'s `Commands::Os` dispatches to `os::dispatch()`, and separately built + tested under `--features mcp` (not attempted earlier in this program) to trace the MCP client path too. This surfaced the real root cause behind every "dead code" warning Phases 16/18 had already correctly-but-inferentially flagged: `Cargo.toml`'s own `mcp = ["rmcp", "tokio"]` feature is a documented "Research/Prototype spike ONLY" separate from `cli` — `capability::{system,git,repo}`/`evidence::ToolEvidence` are real, reachable code under that feature, not actually dead.
2. **Find dead abstractions, remove ONLY those proven unnecessary** — confirmed (grep, not assumed) `os::service::{manager,watchdog,runtime}.rs` AND `src/monitor/health.rs` (which exists solely to serve the dead watchdog) have zero live callers anywhere. NOT deleted: this is tested, safety-conscious infrastructure (governed argv-array spawn, redacted attribution) that a separate prior investigation this session found was intended to be wired up later, not abandoned. Named as an explicit open decision in the architecture doc addendum rather than removed unilaterally.
3. **Find duplicate authorities** — confirmed clean: only `os::supervisor.rs` ever writes `GIAMTHI_HALT.lock`; `os::service::watchdog.rs`/`runtime.rs` only check its existence (read-only), even in otherwise-dead code. No duplicate HALT authority anywhere, including in unwired code.
4. **Find OS-specific logic leaking above the platform layer** — covered substantively by Phase 18's own audit; Phase 20 re-surveyed and found nothing new beyond what Phase 18 already fixed (`linux::secrets`, the `Unsupported*` fallback) and already-justified pre-existing `cfg(unix)`/per-OS branches in `os::monitor.rs`.
5. **Find client-side policy duplication** — covered substantively by Phase 16's own audit (found and fixed `capability::system::host_summary`'s duplicate host-probing); Phase 20's `--features mcp` build/test confirms that fix is correct under its real reachable path.
6. **Verify local-first behavior** — grepped `src/os/` for `ureq`/`reqwest`/`TcpStream`/`http(s)://`; only 4 matches, all inside static plist/Task-Scheduler XML template strings, zero real network calls anywhere in `os::`. Confirmed clean.
7. **Verify HALT/human authority** — see finding 3 above; also reconfirmed via `os::identity`/`os::autonomy::evaluate_for_actor`'s own Phase 12/13 live-verified non-escalation invariant (a lease can narrow but never widen what `os::autonomy`/`os::supervisor` already decided).
8. **Verify resource/model placement explainability** — confirmed by reading the structs directly: both `os::resource::placement::PlacementDecision` and `model::placement::ModelPlacementDecision` carry a `reasons: Vec<String>` field; `PlacementDecision`'s own doc comment states it is "the explainable half of deterministic explainable placement decision." Confirmed clean, no gap.
9. **Run complete project gates** — `cargo build --features mcp` (first time this session, succeeds), `cargo test --features mcp` (531/531 main binary + 64/65 integration_runtime, 1 pre-existing ignored test + 3/3 integration_workspace, 0 failures), `cargo clippy --features mcp` (0 errors, 148 warnings, all individually triaged across 20 phases), `cargo check --no-default-features --features wasm` (succeeds on native target; actual wasm32 cross-compile blocked by a missing local rustup target — an environment gap, not attempted to fix since installing a new toolchain component is outside this program's scope).
10. **Update architecture docs to describe reality, not intent** — see "Changed files, Phase 20" above. Also this checkpoint file and its JSON companion, continuously maintained since Phase 1 and consolidated in Phase 19, already serve this role for the host-native-os program's own internal record.

## Unresolved blockers
None that block calling the program complete. Two named, deliberate open items carried forward for explicit human decision (not silently left ambiguous): (1) `os::service::*` + `src/monitor/health.rs` — wire up or remove; (2) Phase 14 — revisit only if actor-attributed routine-task evidence (in `os::autonomy::QueuedAction` or lease-usage receipts) is later built.

## Notable outcome this phase
Building and testing under `--features mcp` for the first time this session resolved, with an authoritative source (`Cargo.toml`'s own feature comment), a dead-code question every prior phase back to Phase 16 had only been able to answer inferentially. Separately, auditing "architecture docs" turned up a real, previously-unknown-to-this-session, human-approved document (`PROGRAM-K-YANA-OS-SKELETON.md`) whose Status line and readiness table were stale relative to this session's own work — exactly the kind of thing a narrower, code-only final review would have missed, and exactly what a "trace the full live execution path" + "describe reality, not intent" step is supposed to surface.

## Self-review (Phase 20 protocol, applied to Phase 20 itself)
**Pass A (architecture):** No dead code was deleted without an explicit, documented reason for restraint — `os::service::*`'s continued existence is a stated decision, not an oversight. The architecture doc update is additive (a dated addendum), not a rewrite of prior human-approved content, respecting that Phase 0 of Program K recorded real decisions this session has no standing to overwrite unilaterally.
**Pass B (safety/runtime):** No behavior changed in `src/` this phase at all — every action was verification (build/test/grep/read) or documentation. The one file touched (`PROGRAM-K-YANA-OS-SKELETON.md`) is prose, not code. No new dependency, no new capability, nothing irreversible.
No blocking findings.

## Program status
**COMPLETE.** No further phase to start. Next action is a human decision (commit/PR strategy, `os::service::*`'s fate), not further autonomous work.

---

# FULL REMAINING PROGRAM SPEC (Phases 6–20, verbatim, captured 2026-08-14)

This section exists because Phase 1's checkpoint lost the Phase 5–19 text to a context
summarization once already (see git history / prior checkpoint versions). The user
re-supplied the complete spec in a follow-up message specifically to restore it. It is
copied here in full so this cannot happen again — any future session (or this one, after
another compaction) must read this section before assuming Phase 6+ scope.

## GLOBAL RULE (applies to every phase below)

COMMON POLICY — NATIVE MECHANISM. Do not make three separate Yana implementations. Do not
force macOS/Linux/Windows into the lowest common denominator. One Yana authority model.
Three deeply optimized host implementations.

## PHASE 6 — MODEL PLANE

The current provider abstraction lives under `src/chat/provider.rs`. Promote model/provider
concepts into a reusable model plane.

Create only as functionality moves:

```
src/model/
    mod.rs
    provider.rs
    catalog.rs
    requirements.rs
    runtime.rs
```

Do NOT rewrite provider implementations unnecessarily. Prefer compatibility
re-exports/adapters.

Desired ownership — BEFORE: chat owns providers. AFTER: model plane owns provider/model
abstractions, chat consumes model plane.

Represent: ModelId, ProviderId, RuntimeKind, local/remote, context length, quantization,
tool-calling support, model/runtime health, resource requirements, lifecycle state.

Keep all existing providers working, including local runtimes. Do NOT build an inference
engine. Ollama/LM Studio/llama.cpp/TurboFieldfare remain execution backends. Cloud providers
remain supported.

Tests must prove chat behavior does not regress. Checkpoint and continue.

## PHASE 7 — MODEL PLACEMENT

Create: `src/model/placement.rs`

Use deterministic inputs: workload/task requirements, privacy requirement, HostProfile,
resource topology, current pressure, current reservations, model capability, model resource
requirements, local/remote availability, estimated financial cost, configured policy.

Return an explainable PlacementDecision.

Examples:
- private/secret-bearing context: prefer/require local according to explicit policy
- offline: local-only
- critical memory pressure: do not place a large local model
- independent reviewer requirement: allow policy to require a different model/provider from
  executor

Do NOT ask an LLM which model should be selected. Placement itself is policy/runtime logic.

Checkpoint and continue.

## PHASE 8 — HOST EVENT MODEL

Create: `src/os/platform/events.rs` and native implementations where there is a real
reliable mechanism: `src/os/platform/{macos,linux,windows}/events.rs`

Normalize useful events: FilesystemChanged, ProcessStarted, ProcessExited,
ResourcePressureChanged, Sleep, Wake, NetworkChanged, ServiceChanged.

Do not chase complete parity. Unsupported events remain unsupported.

Architecture must be: native event reaction + periodic reconciliation. DO NOT remove
existing scheduler/tick. Events provide fast reaction. Periodic reconciliation provides
eventual truth if events are lost.

Checkpoint and continue.

## PHASE 9 — GIÁM THỊ HOST-NATIVE INTEGRATION

Refactor the supervisor to consume normalized host observations/events. Giám Thị remains
policy authority, NOT the platform backend.

Inputs may include: HostEvent, HostProfile, ResourcePressure, ServiceStatus, ProcessState,
Yana integrity evidence.

Outputs remain deterministic safety state: NORMAL, QUARANTINE, HALT.

Preserve: GIAMTHI_HALT.lock authority, human-only unlock, human-only quarantine clear where
required, receipt chain, heartbeat, periodic reconciliation.

HALT must override KeepAlive/restart behavior. No platform backend may clear HALT or decide
safety policy.

Checkpoint and continue.

## PHASE 10 — PROCESS + ISOLATION BACKENDS

Create only as actual mechanisms are implemented:
```
platform/{macos,linux,windows}/process.rs
platform/{macos,linux,windows}/isolation.rs
```

Create normalized concepts: ProcessSpec, GovernedProcess, ExecutionPlan, IsolationPlan.

Architecture: Agent/model request → Capability → Policy decision → ExecutionPlan → native
ProcessBackend/IsolationBackend.

Platform mechanisms execute an ALREADY AUTHORIZED plan. They do not grant authorization. Do
not require root/admin for normal operation. Prefer native mechanisms when they are
materially better than shell wrappers.

Checkpoint and continue.

## PHASE 11 — SECURE SECRET BACKEND

Evolve `os/credential.rs` toward a host-native secret storage abstraction.

Possible implementation files: `platform/{macos,linux,windows}/secrets.rs`

Keep environment variables as compatibility.

Secret values must NEVER enter: prompt/model context, audit logs, event logs, status output,
process attribution.

Do not build a password manager. Checkpoint and continue.

## PHASE 12 — ACTOR IDENTITY

Create:
```
src/os/identity/
    mod.rs
    actor.rs
    lease.rs
```

Normalize actors: Human, Agent, Service.

Useful metadata: actor id, session, provider, model, mission, parent actor.

Gradually integrate: agent registry, mission ownership, service attribution, audit actor,
chat session actor.

Avoid destructive state migration. Checkpoint and continue.

## PHASE 13 — CAPABILITY LEASES

Introduce scoped capability leases. Examples: `repo.read`, `repo.write:src/**`, `test.run`,
`git.commit:branch/*`, `network:github.com`.

Lease contains: actor, capabilities, scope, issued_at, expiry/mission lifecycle.

Capability leases ADD to existing guard enforcement. Do NOT prematurely remove current
guards.

A lease can never grant Sovereign authority. No actor may self-escalate.

Checkpoint and continue.

## PHASE 14 — TRUST / EVIDENCE AGGREGATION

Only implement this if identity and evidence foundations are now strong enough.

Trust is behavioral evidence, NOT intelligence scoring.

Possible inputs: verified actions, review results, rollback frequency, policy violations,
failed evidence.

Trust may influence bounded friction. Trust MUST NEVER bypass: HALT, Sovereign human
approval, security-policy restrictions.

If implementation would be speculative or weak, explicitly defer this phase rather than
creating fake trust infrastructure.

Checkpoint and continue.

## PHASE 15 — UNIFIED OS STATUS

Make `yana-rt os status` the truthful aggregate view.

Include where known:
- HOST: platform, architecture, CPU, RAM, accelerator topology, memory model, current
  pressure
- YANA: runtime version, state schema, agents, model runtimes, reservations, cost
- SAFETY: NORMAL/QUARANTINE/HALT, supervisor heartbeat, receipt-chain health,
  scheduler/service state
- HOST CAPABILITIES: service support, event support, isolation support, secure secret
  backend, accelerator backend

UNKNOWN must never be silently represented as FALSE.

Checkpoint and continue.

## PHASE 16 — CLIENT BOUNDARY

Desktop/TUI/Claude/Codex/Cursor/MCP are clients. Do not redesign UI.

Remove host probing/policy duplication from clients where it exists and where migration is
safe.

Desired dependency: Clients → Yana runtime API → Yana OS → platform backend.

Checkpoint and continue.

## PHASE 17 — STORAGE SEMANTICS

Audit the new architecture and enforce separation:
- STATE = durable configuration/authority
- OBSERVATION = current snapshot
- EVENT = something that occurred
- EVIDENCE = proof supporting a claim

Do not collapse these into state.json. Any JSONL event store must have bounded
retention/rotation. Only create persistent files actually needed.

Checkpoint and continue.

## PHASE 18 — CROSS-PLATFORM TEST MATRIX

Expand tests to validate: platform selection, host capability unknown semantics, telemetry
parsing, service behavior, resource topology/pressure/reservations, deterministic model
placement, events + reconciliation, HALT behavior, identity privilege boundaries, secret
non-disclosure, no accidental common-code dependency on one host OS.

Do not install real services during tests. Do not weaken existing tests.

## PHASE 19 — CONTINUITY HARDENING

Continue maintaining `.yana-ai/program-host-native-os.json` and
`.yana-ai/program-host-native-os-checkpoint.md`.

After every phase include: completed phase, changed files, architecture state, tests,
review findings, exact next phase.

If context compacts again, read these files before doing anything else.

Do not ask the human to repeat already-completed architecture unless the checkpoint itself
is corrupt or contradictory.

## PHASE 20 — FINAL ARCHITECTURAL CONSOLIDATION

When every implemented phase is complete:
1. trace the full live execution path
2. find dead abstractions and remove only those proven unnecessary
3. find duplicate authorities
4. find OS-specific logic leaking above platform layer
5. find client-side policy duplication
6. verify local-first behavior
7. verify HALT/human authority
8. verify resource/model placement explainability
9. run complete project gates
10. update architecture docs to describe reality, not intent

Do not declare completion merely because the source tree resembles the plan. Completion
means real execution paths are connected.

---

## Files next agent must read first (program is complete — for whoever picks this up next)
- **This program has no next phase.** All 20 phases are resolved (see "Program status" above).
  Do not resume "Phase 21" or invent further phases — that would be scope invention this
  program's own spec never authorized. If more work on this system is wanted, it starts as a
  new, explicitly-scoped request, not a continuation of this checklist.
- Before touching anything: read this file's "Consolidated summary, Phases 1–17" and the
  "Changed files, Phase 18/19/20" + "Phase 20 audit findings" sections above in full — they are
  the authoritative record of what exists, what was deferred, and what was deliberately left
  unresolved for a human decision.
- `docs/programs/PROGRAM-K-YANA-OS-SKELETON.md`'s Phase-20 addendum (added this session) is the
  reconciliation between this program and the pre-existing, human-approved "Program K" doc —
  read it before assuming either document alone is current.
- The two named open decisions for anh Tâm, not resolved by this session: (1) `os::service::*` +
  `src/monitor/health.rs` — wire up or remove; (2) commit/PR strategy for the 19 modified/deleted
  + 39 new files, all still uncommitted on `claude/host-native-os-program`.
- If Phase 14 (Trust/Evidence Aggregation) is ever revisited: check first whether
  `os::autonomy::QueuedAction` has since gained actor attribution, or lease-usage receipts exist
  — only then does the deferral reasoning in this file's "Consolidated summary" section no
  longer apply.
