# Program K — ADS v1 Phases 3–15

**Date:** 2026-08-11
**Scope:** Complete the ADS path for the Phase 1 management plane and one
readiness-approved Phase 10 hardening slice. This document does not approve a
supervisor, scheduler, credential vault, kernel resource controller, autonomous
execution or Windows mutation protocol.

## Phase 3 — Architecture

### Layer ownership

```text
User / automation
       |
       v
yana-rt os CLI -------------- read-only aggregate doctor
       |
       +-- OS state owner -------- .yana-ai/os/state.json
       |       |                    flock-v1 + atomic replace
       |       +-- agent metadata
       |       +-- explicit resource policy
       |
       +-- consumes canonical owners (never dual-writes)
               +-- chat: sessions + provider catalog
               +-- cost: ledger + strict accounting
               +-- guard: token/circuit decisions
               +-- audit: tamper-evident activity
               +-- Program J: capability execution
               +-- mission: task dependency state

Future, separately approved:
supervisor -> process tree -> platform resource controls
credential service -> platform vault/OAuth lifecycle
scheduler -> supervisor + policy + durable schedule state
```

### Resolved ownership conflicts

1. OS owns managed-agent metadata; a future supervisor alone may own observed
   process liveness. The Bash launcher remains external until migrated.
2. Mission owns task progress; OS owns agent metadata. Neither derives the
   other's state from matching strings.
3. Chat session, managed agent and mission task ids remain typed, distinct ids.
4. `src/cost.rs` owns ledger parsing/accounting; resource policy consumes it.
5. Program J owns executable capability contracts; OS exposes policy/status.
6. Existing guards own allow/deny. The `owner` string is metadata, not an
   authenticated principal.

### Invariants

- One mutable fact, one authoritative writer.
- Missing policy denies work; missing evidence never becomes healthy.
- No secret value enters OS state, doctor output or logs.
- No network probe is described as local readiness unless it actually ran.
- No cooperative heartbeat is described as process liveness.
- No new execution path may bypass `yana-rt` guards.

## Phase 4 — Workflow

### Management mutation

```text
parse argv -> resolve project root -> validate input -> verify flock-v1
-> acquire canonical lock -> load exact schema -> mutate one owner record
-> private temporary write -> atomic replace -> release -> render result
```

Failure before replace leaves the previous state authoritative. Corrupt state,
wrong schema, symlink paths and missing protocol marker fail loud.

### Resource preflight

```text
request estimate -> load explicit policy -> count current cooperative records
-> canonical strict daily-cost read -> evaluate every limit
-> ALLOW or DENY with all reasons
```

The ledger reader rejects malformed, negative, non-finite and non-regular
inputs. It never silently under-counts a policy decision.

### Aggregate health

```text
resolve root -> inspect each source independently -> assign pass/warn/fail
-> preserve source path + actionable detail -> compute worst status
-> human or JSON rendering
```

Doctor is read-only. It does not initialize state, repair files, probe provider
networks, rotate secrets or mutate guard state.

### Future supervised execution (blocked)

```text
approved task -> policy/identity -> supervisor -> process tree/container
-> correlated events/accounting -> terminal state -> mission reference
```

No part of this future flow is inferred from the current heartbeat field.

## Phase 5 — Readiness

Scoring uses ten ADS dimensions, each worth 10%. Implementation requires at
least 80% for the exact capability, not for the Program name as a whole.

| Capability slice | Repo | Knowledge | Notebook | Memory | Runtime | Governance | Security | Benchmark | Cost | Context | Score | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Canonical strict cost accounting | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 5 | 10 | 10 | **95%** | READY |
| Read-only aggregate doctor | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 5 | 10 | 10 | **95%** | READY |
| Process supervisor | 5 | 5 | 10 | 5 | 0 | 5 | 5 | 0 | 5 | 5 | **45%** | BLOCKED |
| Production scheduler | 5 | 5 | 10 | 5 | 0 | 5 | 5 | 0 | 5 | 5 | **45%** | BLOCKED |
| Credential vault/OAuth | 5 | 5 | 10 | 5 | 0 | 5 | 0 | 0 | 5 | 5 | **40%** | BLOCKED |
| Per-agent CPU/RAM enforcement | 5 | 10 | 10 | 5 | 0 | 5 | 5 | 0 | 5 | 5 | **45%** | BLOCKED |
| Managed-agent authorization | 5 | 5 | 10 | 5 | 5 | 0 | 5 | 0 | 5 | 5 | **45%** | BLOCKED |
| OS schema migration/rollback | 5 | 5 | 10 | 10 | 5 | 10 | 5 | 0 | 5 | 5 | **55%** | BLOCKED |
| Windows mutation | 5 | 5 | 10 | 5 | 0 | 5 | 5 | 0 | 5 | 5 | **45%** | BLOCKED |

The benchmark dimension for the approved slice becomes 10 after Phase 12.

## Phase 6 — ADR

`docs/adr/ADR-012-yana-os-authoritative-ownership.md` records the accepted
single-writer architecture, the approved slice and deferred platform/security
decisions. ADR-011 remains the Phase 1 state/API decision; ADR-008 remains the
cross-language mutation-lock contract.

## Phase 7 — Research

Only primary/authoritative sources were used.

| Topic | Evidence | Consequence for Yana OS |
|---|---|---|
| Linux process/resource control | Kernel cgroup v2 documentation says processes are hierarchical, controls are hierarchical, controllers are not enabled by default and delegation has containment rules | A portable supervisor cannot be a PID file plus `kill`; cgroup setup/permissions need a dedicated design and Linux test host |
| Windows process trees | Microsoft Job Objects manage groups as a unit, inherit children by default, support limits/accounting and optional kill-on-close | Windows requires a native Job Object backend, not POSIX emulation |
| macOS containment | Apple App Sandbox is entitlement-based and restricts file/network/hardware access at the kernel boundary | Desktop packaging/entitlements must be designed before claiming sandbox parity |
| Secrets | OWASP requires least privilege, lifecycle metadata, rotation, revocation, expiry and audit; secrets must not be logged | Environment presence is not a vault; vault work stays blocked pending threat model and platform store |
| Capabilities | MCP host owns authorization, consent, lifecycle and isolated client connections; capability negotiation is explicit | Program J remains capability owner while OS supplies policy/status context |
| Observability | OpenTelemetry correlates logs, metrics and traces through shared execution/resource context | Future events need stable agent/session/task correlation ids; current doctor aggregates evidence without pretending to be telemetry |

Research was documentary only. Linux cgroups, Windows Job Objects and macOS
App Sandbox were not exercised in this worktree and are not marked PASS.

## Phase 8 — Design Review

| Risk | Severity | Design response | Residual state |
|---|---|---|---|
| Split-brain status | Critical | Single-writer table in ADR-012 | Future launcher migration remains blocked |
| False health claims | High | Explicit pass/warn/fail and `not-probed` wording | Provider reachability intentionally unknown |
| Ledger under-count after corruption | High | Strict canonical parser; no `filter_map` in policy path | Append concurrency remains existing cost-owner debt |
| Secret leakage | Critical | Presence-only inventory; no values in state/output | Vault not implemented |
| Heartbeat mistaken for liveness | High | UI/docs label it cooperative | Supervisor not implemented |
| Platform-specific resource semantics | High | No common fake abstraction; separate future backends | Linux/macOS/Windows validation pending |
| Doctor becomes repair command | Medium | Pure read-only implementation | Operators must run explicit remediation |
| Status output breaks automation | Medium | Versioned JSON fields and tests | Future schema changes require compatibility review |

**Review result:** APPROVE the two-capability slice; BLOCK every other Phase 2
gap. The design introduces no alternate runtime or autonomous action.

## Phase 9 — Implementation Plan

1. Add strict root-aware ledger APIs to `src/cost.rs` with malformed,
   symlink/non-file and daily-filter tests.
2. Replace the private OS ledger parser with the canonical cost API.
3. Add `src/os/health.rs` to inspect independent evidence without mutation or
   provider network access.
4. Add `yana-rt os doctor [--dir PATH] [--json]` and document output/exit
   semantics.
5. Add focused Rust tests, then run integration, benchmark and repository
   regression gates.

Rollback is a source revert: no persistent schema change is introduced.
Existing `os status` and Phase 1 state remain compatible.

## Phase 10 — Implementation

Implemented only the approved slice:

- `src/cost.rs` now owns a root-aware strict accounting reader and daily-cost
  calculation. It accepts the stable accounting contract (`ts`, `cost_usd`)
  while ignoring unrelated extra fields, rejects malformed/negative/non-finite
  values and refuses symlink/non-file ledgers.
- `src/os/resource.rs` consumes that canonical API; its duplicate parser was
  removed.
- `src/os/health.rs` adds eight independent checks: locking protocol, OS state,
  resource policy, cost ledger, token budget, circuit state, audit evidence and
  credential/provider inventory.
- `yana-rt os doctor [--dir PATH] [--json]` prints the report, exits 2 when any
  check fails, exits 0 for pass/warning, never repairs evidence and labels
  provider availability `not-probed`.
- Unit coverage includes day filtering, malformed ledger, symlink ledger,
  missing state without creation, corrupt guard evidence, symlink evidence and
  truthful provider wording.
- Cost ledger append now serializes one bounded JSONL record and emits it with
  one `O_APPEND` write instead of separate JSON/newline writes. Accounting
  errors propagate to the CLI and are visible warnings in bus/chat event paths.
  Unit and real cross-process regression tests protect the record boundary.

No persistent schema changed, so no data migration was required.

## Phase 11 — Review

The first focused run found one compatibility defect: the new strict reader
initially required every field in `CostEntry`, while the established policy
contract and existing tests require only `ts` and `cost_usd`. The parser was
corrected to a minimal typed `AccountingEntry`; strict corruption behavior was
retained.

The second review found a check/open race in generic evidence reads. The reader
now opens with `O_NOFOLLOW` on Unix and validates the opened descriptor is a
regular file before reading. A regression test covers symlink evidence.

A final concurrency audit reproduced ledger corruption before the writer fix:
50 simultaneous `cost log` processes produced 50 physical lines but only 48
valid JSON records; two records were concatenated and the following line was
empty. The cause was `writeln!` issuing the JSON body and newline as separable
writes. The fixed writer uses one bounded append syscall and treats a short
write as an error. The same 20 rounds × 50 processes then preserved 1000/1000
unique, parseable records.

Review checklist:

- [x] No new owner writes another subsystem's state.
- [x] No secret values are collected or rendered.
- [x] No network request or fake provider metric.
- [x] No state repair or initialization in doctor.
- [x] Missing/corrupt evidence is explicit.
- [x] Existing status and ledger append/report interfaces remain intact.
- [x] No supervisor, scheduler, vault or resource-control placeholder UI.

## Phase 12 — Benchmark

Measured on the local macOS worktree with a debug `yana-rt` binary, an isolated
temporary project, valid protocol marker/state/policy, two valid guard JSON
files and audit evidence. Each command was launched as a new process 60 times
using Python `time.perf_counter_ns()` around `subprocess.run`.

| Command | Runs | p50 | p95 | max |
|---|---:|---:|---:|---:|
| `os status --json` | 60 | 4.391 ms | 5.424 ms | 6.717 ms |
| `os doctor --json` | 60 | 4.360 ms | 4.894 ms | 5.052 ms |

| Concurrency case | Before | After |
|---|---:|---:|
| 50 simultaneous local cost writers | 48/50 valid JSON records in first reproduction | 1000/1000 across 20 rounds |

The benchmark is launch-dominated and is evidence for local overhead, not a
cross-platform performance guarantee. Corrupt token-budget evidence was also
tested: doctor returned exit 2 and identified the failing check. Linux and
Windows performance were not measured.

## Phase 13 — Evaluation

| Dimension | Before | After | Evaluation |
|---|---|---|---|
| Daily cost parser ownership | OS duplicated part of cost semantics | `src/cost.rs` is the only accounting parser owner | Improved; split ownership removed |
| Concurrent cost append | JSON and newline could interleave | One bounded `O_APPEND` write per record | Reproduced failure eliminated on local macOS filesystem |
| Corrupt ledger | OS denied, legacy reports could silently skip | Policy/doctor use strict canonical API; legacy human summary unchanged | Improved without CLI compatibility break |
| Aggregate health | Operators inspected unrelated files manually | Eight-source human/JSON doctor | Improved, bounded and actionable |
| Provider state | Credential presence only | Presence plus explicit `not-probed` availability | More truthful, not broader than evidence |
| Persistent schema | v1 | v1 | No migration or rollback risk added |
| Process/resource authority | Cooperative metadata only | Unchanged | Correctly remains blocked |

The two approved capabilities now score **100%** after real benchmark evidence.
All deferred capabilities remain below 80%; Program K as a whole is not being
declared complete.

## Phase 14 — Documentation

Updated artifacts:

- this end-to-end ADS record;
- ADR-012 authoritative ownership decision;
- Program K skeleton/status table;
- CLI reference for `os doctor`, status meaning and exit behavior.

The implementation has no new dependency, environment variable, secret format
or persistent schema. Existing Phase 0 compatibility commands remain
documented and supported.

### Final verification record

| Gate | Result |
|---|---|
| Focused cost tests | 4/4 PASS |
| Cost concurrency tests | unit 320/320 records; process race 1000/1000 records |
| Focused OS tests | 16/16 PASS |
| Full Cargo suite | library 6/6; both binaries 276/276 each; integration 64/64 PASS with one pre-existing watcher test ignored |
| Release-binary hook suite | 277/277 PASS, zero skipped |
| `npm test` | exit 0; hooks 273/273 plus Codex support PASS |
| Source-only adapter contract | 9/9 PASS |
| Claude/Codex active-hook parity | 23/23 PASS |
| Metadata counts | CLEAN: 101 agents, 170 commands, 63 hooks, 127 scripts, 2025 skills, 12 templates, 17 tests, 71 rules |
| Core lock | 276/276 PASS |
| `git diff --check` | PASS |

`npm run test:parity` returns 1 in this source-only worktree because its first
canonical check correctly reports that the repository-local generated
`.codex/skills` and command target is absent. The standalone source-only
contract creates a fresh target, validates it, proves a zero-diff second run
and passes all nine cases; the Codex support suite also passes. No Program K
file changes generator behavior, so this is recorded as an existing
fail-closed checkout condition, not a Yana OS regression.

## Phase 15 — Continuous Improvement

### Lessons

1. Readiness must be scored per capability. A broad “Yana OS ready” score would
   have incorrectly unlocked high-risk platform work.
2. Strict parsing must target the stable consumer contract, not the largest
   producer struct.
3. A health command is valuable only when unknown and unprobed states remain
   visible.
4. Read-only security still needs descriptor-level path safety.

### Backlog and next gates

| Next item | Owner | Required evidence before implementation |
|---|---|---|
| Remote/network filesystem cost semantics | `src/cost.rs` | Linux/filesystem matrix; local `O_APPEND` evidence is not an NFS guarantee |
| Audit integrity in doctor | Audit subsystem | Bounded verifier API with no mutation and measured latency |
| Typed agent/session/task links | OS + chat + mission | Relationship schema, deletion semantics and migration plan |
| Supervisor | Future supervisor | Platform process-tree ADR and Linux/macOS/Windows prototypes |
| Credential vault | Future credential service | Threat model, platform-store choice, rotation/revocation tests |
| CPU/RAM enforcement | Supervisor/sandbox | Native backend prototypes and privileged/unprivileged behavior |
| Schema migration | OS state owner | Backup, forward/backward fixtures and interrupted-migration recovery |

### Continuous rule

Re-run Phase 2 inventory and Phase 5 scoring whenever an authoritative owner or
persistent protocol changes. Do not turn warning checks into pass through
fallback, retries or inferred state. The next implementation task should be the
cost-writer concurrency contract because it strengthens an existing owner
without requiring a daemon or platform privilege.
