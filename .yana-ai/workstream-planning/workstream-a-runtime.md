# YANA-AI — FULL STABILIZATION PROGRAM

> Split execution packet for parallel work.
>
> **Important numbering note:** the source is numbered **0 through 216 inclusive**, which is **217 numbered sections**, not 216.  
> Therefore the clean split is **108 sections in Workstream A** and **109 sections in Workstream B**.

## Global mode

You are in **STABILIZATION + CLOSURE**, not feature development.

Primary goal:

`reconcile provenance → reproduce on current origin/main → fix real defects → verify invariants → adversarial review → close PR #201–#210 train cleanly`

Non-negotiable rules:

- Repository current state is the source of truth.
- Historical reports/checkpoints/PR text are evidence or hypotheses, never proof.
- Do not use quota/context limits as a reason to skip a finding.
- Do not stop because “tests pass”.
- No unrelated feature work.
- A bug must be reproduced on clean `origin/main` before being fixed.
- Required defect loop: `reproduce → failing regression → minimal fix → same regression passes → targeted suite → relevant full suite → fresh review`.
- If a finding cannot be reproduced, do not patch it; explain why it is obsolete, already resolved, or based on incorrect reasoning.
- Preserve all findings/patches/uncommitted hunks from the current long-running audit before any reset or branch/worktree switch.
- New serious bugs discovered during this program enter the stabilization queue.
- Do not start Time Machine, new providers, Discord shell/write/approval, new agent frameworks, or another large architecture program.
- Final claims must be evidence-backed and categorical; **no fake numeric safety score**.

## Parallel-work ownership contract

The two workstreams may run at the same time, but must not behave like two agents editing the same subsystem blindly.

### Workstream A owns
- Runtime production defects and runtime invariants.
- Hooks/runtime wiring.
- Discord runtime hardening.
- OS/evidence/safety-state behavior.
- Ollama/AirLLM runtime behavior.
- Runtime resource/liveness semantics.
- Actor/session/origin/secret closed-loop truth.
- Targeted regression tests that live next to those runtime subsystems.
- Provenance and cross-PR runtime reconciliation.

### Workstream B owns
- `.github/workflows/**`
- CI helper scripts / `core/ci/**` or equivalent.
- Assurance taxonomy, invariant registry representation, impact map, test-selection logic.
- Platform matrix orchestration.
- Fuzz/Miri/nightly/soak orchestration.
- Release provenance, SBOM/signing/dependency policy.
- CI documentation, claim-verification matrix, required-check recommendations.
- CI self-tests, workflow permissions, silent-skip/`|| true`/`continue-on-error` audits.

### Conflict rule
If a change crosses ownership:
1. The owner of the production subsystem defines the invariant and expected failure semantics.
2. The CI owner consumes that invariant and wires assurance around it.
3. Do not independently refactor the same runtime file from both workstreams.
4. Prefer separate branches/worktrees.
5. Merge only after final reconciliation against current `origin/main`.


# WORKSTREAM A — RUNTIME STABILIZATION / DEFECT CLOSURE

**Assigned source sections: 108 total**

`0–32, 36–57, 76–84, 120–139, 151–155, 175–184, 204–212`

This workstream is the **runtime/source-of-truth owner**. It fixes actual defects and establishes exact runtime invariants. It must not perform a giant CI workflow rewrite.

---

## A0. Start with repository truth — Sections 0–1

Before any code change run and record:

```bash
git fetch origin
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
git log --oneline --decorate --graph --max-count=40
```

Create **PR #201–#210 PROVENANCE RECONCILIATION**.

For each finding record:

- Finding ID
- Original PR / commit
- Original vulnerable snapshot
- Exists on current `origin/main`? YES/NO
- Reproduced on clean `origin/main`? YES/NO
- Existing patch location
- Patch still applicable? YES/NO/PARTIAL
- Needs re-derivation? YES/NO
- Correct destination

Mandatory reconciliation coverage:

- `tool-validator.sh` multi-byte bug
- hook/settings/mirror wiring
- Discord #205/#206
- receipt/evidence #203/#204
- Ollama #207/#210
- AirLLM #208/#209
- risk/confidence scorer changes
- all uncommitted audit-branch fixes
- every change/finding created during review #201–#210

Before resetting/switching worktree, preserve:
- `git diff`
- staged diff
- untracked files
- local commits
- branch-only commits
- audit/checkpoint files
- every current finding visible in the long audit session

Assign stable IDs so no finding disappears during branch reconciliation.

---

## A1. P0 runtime defects — Sections 2–7

### Section 2 — Tool-validator Unicode / multi-byte
Reproduce byte/prefix boundary defects using:
- Vietnamese
- Korean
- emoji
- mixed ASCII + UTF-8
- Unicode near matcher boundary

Required proof:
- clean `origin/main` regression FAIL
- patched current main regression PASS

Then run:
```bash
core/tests/hooks/run-hook-tests.sh
verify-hook-mirrors.sh
verify-core-lock.sh
```

### Section 3 — Hook / settings / mirror truth
Trace:
`canonical → mirrors → registration → runtime invocation`

Create matrix:
- Hook
- Canonical file
- Claude mirror
- Codex mirror
- Cursor mirror
- Registered events
- Runtime caller
- Native fast-path
- Fallback
- Status

Allowed status:
`WIRED / DEAD / STALE MIRROR / STALE CONFIG / PARTIALLY WIRED / INTENTIONALLY DISABLED / BROKEN`

Inspect at minimum:
- `python3-core-validator.sh`
- `tool-validator.sh`
- giamthi halt hooks
- blast-radius hooks
- subagent audit hooks
- settings JSON
- Codex hook registration

Do not hand-edit mirrors. Fix canonical source and use the canonical synchronization mechanism.

### Sections 4–5 — Discord bounded queue + dedupe/readiness
Current transport architecture is:
`Gateway thread → queue → single model worker`

Required:
- gateway thread never blocks on slow model processing
- queue is bounded
- admission uses deterministic non-blocking behavior (`try_send` or equivalent)
- overflow produces explicit BUSY/reject/drop+diagnostic semantics
- no silent unbounded memory growth

Regression:
- slow worker
- flood beyond capacity
- gateway remains responsive
- deterministic overflow
- no unbounded queue growth
- worker recovery

Dedupe/readiness:
- define duplicate `MESSAGE_CREATE`
- define reconnect/redelivery guarantee
- retain `message_id`
- document exact current guarantee
- add explicit deferred invariant/TODO preventing future write/approval capability without dedupe
- test/document duplicate reply risk for current read-only path
- do **not** implement full RESUME unless current architecture requires it

### Section 6 — Reconciliation evidence-loss bug
Failure to append a receipt must not silently consume a detected reconciliation event.

Choose the smallest correct design:
- visible evidence degradation while state advances, or
- retain pending event for retry

Required:
- heartbeat survives receipt failure
- event-loss condition is visible
- no silent consumption

### Section 7 — Safety-state concurrency
Re-audit:
- `halt`
- `unlock`
- `set_quarantine`
- `clear_quarantine`
- resident tick

Race pairs:
- halt || unlock
- halt || quarantine
- unlock || tick
- quarantine || clear

Invariant:
- entering safer state: evidence failure cannot veto the safety transition
- leaving safer state: evidence failure keeps the safer state

Audit TOCTOU around:
- existence checks
- create/remove
- receipt append
- dashboard reads

---

## A2. P1/P2 runtime closure — Sections 8–23

### Ollama — Sections 8–10
For `/api/tags`, `/api/ps`, `/api/pull`, `/api/delete`:
- require truthful HTTP status handling
- distinguish `EMPTY`, `FAILED`, `MALFORMED`
- remove defaulting that maps backend failure to empty state
- fake daemon tests: 200 empty, 200 valid, 500, malformed JSON, wrong shape, partial response

Pull liveness:
- read/progress timeout or cancellation
- no permanently stuck worker after headers + one line + stall
- UI receives terminal `Finished(Err)` state and recovers

Model identity:
- presentation must never become canonical identity
- do not derive model ID from decorated display text
- implement structured ID if bounded; otherwise record explicit debt

### AirLLM — Sections 11–14
Admission:
- bound generation/request concurrency
- do not allow unlimited server threads waiting behind a generation lock
- over-capacity returns controlled `429`/`503`

Slowloris/partial body:
- bound socket/read duration
- valid Content-Length + tiny prefix + stall must recover

Context:
- request-body cap is not token limit
- count/derive prompt tokens before generation
- enforce safe/configured model context ceiling
- use tokenizer/model metadata where available
- fallback ceiling must be explicit, never silently guessed

Errors:
- review whether external HTTP 500 should be generic
- keep detailed internals in stderr/logs
- if relying on loopback trust boundary, document it exactly

### Sections 15–21 — Ownership/authority/secrets/platform/network
Discord session:
- separate `session identity`, `participants`, `surface visibility`, `origin/provenance`
- Session ID alone is not authorization
- no large ACL redesign unless required now

Actor/capability:
- confirm whether Actor/lease is actually consumed at enforcement boundary
- documentation must not claim live enforcement if absent
- before future Discord mutation, Actor + Origin + Session + Capability + Approval + Autonomy must survive to enforcement

Secrets:
- inventory provider “configured?” path vs actual credential retrieval path
- output exact matrix
- add narrow canonical retrieval API only if bounded/safe
- otherwise mark host-native E2E secret support as blocked debt

Windows:
- re-check resident single-instance, remote locks, receipts lock, lifecycle
- stale marker after crash is not equivalent to OS-released lock
- do not claim parity from compile-only evidence

Cross-platform:
classify each relevant subsystem as:
`LIVE VERIFIED / LOGIC TESTED / COMPILE ONLY / UNVERIFIED`

At minimum:
- service backend
- secret backend
- locks
- Discord
- process isolation
- telemetry

`jq` fail-open:
- investigate deliberate policy
- native `yana-rt` fast path / critical shell fallback / fail-closed mutating tools / read-only degradation are candidate designs
- do not blindly blanket `exit 2`

SSRF:
inventory every network caller:
- user-controlled URL?
- SSRF guard?
- DNS rebinding risk?
- private IP policy?
- redirect handling?

Close only real gaps.

### Sections 22–23 — Verify Gate / Time Machine
Verify Gate:
- investigate source fingerprint before/after local verification
- if Yana claims verification against mutable workspace and bounded fix exists, implement
- otherwise register debt

Time Machine:
- DEFER unless existing rollback is broken

---

## A3. Required runtime test discipline — Sections 24–32

For every real bug:
1. reproduce clean main
2. regression fails
3. minimal patch
4. same regression passes
5. targeted suite
6. relevant full suite
7. adversarial fresh review

Cross-cutting adversarial cases:
- concurrent receipt writers
- concurrent remote-session writers
- Discord flood vs slow worker
- halt/unlock race
- multiple AirLLM callers
- malformed receipt/session/Ollama JSON
- partial HTTP body
- corrupt reconciliation state
- Windows lock/path semantics
- Unix symlink lock attack
- actor mismatch
- duplicate Discord message
- channel/user identity combinations
- disk write failure
- receipt lock timeout
- network timeout
- provider/worker panic
- malformed API response

Architecture drift review:
- new modules
- new global state
- duplicate locks
- duplicate credential logic
- duplicate network guards
- authority shortcuts
- adapter → execution shortcuts

Do not unify distinct lock scopes blindly. Document why each exists.

Documentation truth classifications:
`VERIFIED / PARTIAL / STALE / FALSE / DEFERRED`

PR split preference:
- A: hooks/validator/wiring
- B: Discord hardening
- C: OS/evidence
- D: Ollama
- E: AirLLM

Runtime closure report must include:
- origin/main SHA
- reproduced/disproved/already-resolved/fixed findings
- PRs/commits
- regressions
- platform status
- limitations/debt
- authority/evidence/remote/resource invariants
- corrected docs
- CI status
- fresh-review results
- verdict: `PASS / PASS WITH KNOWN DEBT / REQUIRES MORE FIXES`

---

## A4. Runtime resource/liveness assurance — Sections 36–57

### Adversarial concurrency
Create repeatable tests for:
- receipt writers
- session-map writers
- request-log writers
- HALT/quarantine races
- Discord event floods
- provider requests
- service single-instance contention
- lock timeout/recovery

Assert invariants, not timing accidents.

### Historical process/resource runaway
Protect causal failure classes:
- wrapper recursion
- self-reinvocation
- spawn/fork amplification
- restart storms
- busy-wait loops
- spinning deadlocks
- unbounded queues/retries/threads
- resource leaks

Never use laptop temperature as a CI oracle.

Wrapper recursion invariants:
- A→A
- A→B→A
- A→B→C→A
- symlink loop
- PATH shadowing
- duplicate/stale installations

Detect cycle before runaway execution.

### Process budgets
For integration-launched processes track where practical:
- process count
- child count
- max depth
- wall-clock deadline
- cleanup

Unexpected multiplication is failure.

### CPU/liveness
Use generous, portable signals:
- wall-clock timeout
- bounded expected work
- process count
- progress markers
- optional CPU-time sampling

Detect spin/recursion, not performance regressions.

### Queue bounds
Every externally influenced queue must define:
- producer
- consumer
- capacity/backpressure
- overflow
- retry
- shutdown
- memory/storage growth expectations

### Retry/restart storms
Inventory all reconnect/retry loops.
Require explicit:
- initial delay
- max delay
- fatal errors
- reset condition
- jitter where appropriate

Permanent auth/network failures must not retry at machine speed.

Determine one primary restart owner:
- Yana
- launchd
- systemd
- Windows service/task

Avoid nested restart amplification.

### Background threads
For every long-lived/background thread determine:
- owner
- stop mechanism
- possible infinite block
- panic visibility
- join behavior
- repeated-spawn leak risk

Gateway alive + worker dead is false health.

### Health/progress
PID existence is not health.
Use meaningful dimensions:
- process
- transport
- worker
- progress
- resource
- evidence
- authority

### Host resource pressure
Reuse existing Yana topology/pressure/reservation/placement/telemetry.
Do not create a second thermal subsystem.
Exact temperature may remain `UNKNOWN`.

### Resource circuit breaker
Investigate a deterministic, authority-aware resource breaker.
Possible inputs:
- sustained CPU pressure
- memory/swap pressure
- process/child explosion
- queue saturation
- restart/crash frequency
- stale worker progress
- disk pressure
- thermal pressure where available

Allowed outputs:
- warn
- reject/defer new work
- reduce/pause optional work
- stop new spawns
- degraded mode
- human review

Forbidden without explicit authority:
- arbitrary user-process termination
- auto-clear HALT
- unrelated host mutation

If implemented, require hysteresis + duration + cooldown + recovery window.

### Soak/leak/state growth
For long-running components evaluate:
- thread growth
- process growth
- FD/handle growth
- CPU idle spin
- RSS/memory trend
- reconnect storms
- state/log growth

Append-only state needs lifecycle semantics; safety evidence and diagnostic logs are not the same class.

### Failure injection and timeout policy
Failure scenarios need explicit outcome:
`FAIL CLOSED / DEGRADE / RETRY / REJECT / HALT / CONTINUE SAFELY`

Timeout diagnostics should capture:
- process tree
- logs
- last progress
- resource snapshot

Post-test cleanup:
- no Yana child process remains
- no test service remains
- no stale owned lock
- no server/thread leak

Disk pressure must preserve:
- entering safer state should still succeed where possible even if evidence fails
- leaving safer state remains fail-closed if required evidence fails
- if safety state itself cannot be persisted, surface that truthfully

Local Verify Gate:
`fingerprint A → verification → fingerprint B`
If A != B: `STALE`, not PASS.

---

## A5. Runtime assurance domains — Sections 76–84

### A1 Authority & Governance
Test:
- actor spoof/missing/wrong
- expired lease
- replayed/denied/timed-out approval
- nonce reuse
- sovereign escalation
- remote-origin authority widening
- session/actor mismatch

Local convenience settings must not widen remote authority.

### A2 Capability & Isolation
Invariant:
If authority denies, no lower execution layer may still perform the operation.

Test:
- traversal/symlink escape
- process/network escape
- sandbox bypass
- shell interpolation
- cwd confusion
- env/FD inheritance
- unsupported isolation

If isolation is required but unavailable: FAIL CLOSED.

### A3 State & Evidence
Protect:
HALT, quarantine, receipts, remote session mapping, persisted runtime state, checkpoint/reconciliation.

Test crash points, writers, corruption, truncation, disk failure, lock timeout, migration, rotation.

### A4 Model/Provider protocol truth
Never conflate:
- EMPTY
- FAILED
- MALFORMED
- TIMEOUT
- PARTIAL

Provider fixtures should cover status/error/partial/reset/duplicate/out-of-order cases.

### A5 Resource & Liveness
Every long-lived or externally triggerable component needs a resource envelope:
- max queue
- max concurrent work
- max children
- retry budget
- timeout
- shutdown ownership
- health/progress
- recovery

### A6 Platform & Concurrency
Preserve:
`COMMON POLICY + NATIVE MECHANISM`

Test semantics, not identical syscalls.

---

## A6. Failure semantics / health / ownership — Sections 120–139

Runtime tests must include dependency failures, not just success.

Persistent state transitions must consider crash points:
- before temp write
- after temp write
- before flush
- before rename
- after rename
- before evidence
- after evidence

Disk/write errors to classify:
- disk full
- permission denied
- read-only FS
- rename/fsync failure

State retention inventory:
- receipts
- request logs
- evidence degradation
- audit logs
- session history
- process attribution

Disk exhaustion is a resource-runaway class.

Health dimensions stay distinct:
`PROCESS / TRANSPORT / WORKER / PROGRESS / RESOURCE / EVIDENCE / AUTHORITY`

Health may warn/degrade/block new work under deterministic policy, but must never become new authority or auto-clear HALT.

Resource breaker belongs to Resource/Host Plane + policy authority, not provider/TUI/Discord/model.

Resource breaker conceptual states:
`NORMAL → PRESSURED → DEGRADED → RECOVERING → NORMAL`

Thermal signal is optional telemetry, never sole authority.

Permanent invariants:
- no wrapper execution cycle
- bounded process tree
- every retry loop has budget
- one primary restart owner
- every queue has ownership/capacity/overflow/shutdown
- every long-lived thread has owner/stop/panic/join semantics
- file/socket/lock/child handles have reviewable ownership

---

## A7. Secret/session/remote closed loop — Sections 151–155

Secret support is only E2E when:
`configured → retrievable → usable → never exposed`

Presence-only backend is not E2E support.

Session authority must define:
- session identity
- participants
- surface visibility
- origin
- authority

Cross-surface future invariant:
Discord shared session → Desktop private continuation → Discord resume
must not leak private context unless policy explicitly permits the transition.

Remote origin must survive:
`Discord event → request context → runtime → capability decision → evidence`

“Discord is read-only” must be precise:
no host/tool mutation capability, while controlled session/history persistence may still occur.

---

## A8. Review closure, maturity and architecture freeze — Sections 175–184

A finding closes when:
- reproduced
- fixed
- regression added
- same regression passes
- fresh reviewer cannot reproduce original defect

Unrelated new findings get separate IDs.

Assurance debt record:
- ID
- domain
- gap
- reason deferred
- risk
- milestone before which it must close

Use precise subsystem states:
`DESIGNED / IMPLEMENTED / WIRED / LOGIC TESTED / PLATFORM TESTED / LIVE VERIFIED / PRODUCTION READY`

Maturity:
- M0 UNASSESSED
- M1 IMPLEMENTED
- M2 TESTED
- M3 ADVERSARIALLY TESTED
- M4 PLATFORM VERIFIED
- M5 RELEASE-ASSURED

Never advance without evidence.

Closed-loop target:
`Human Authority → Decision → Capability → Execution → Host Effect → Observation → Evidence → Verification → Human Authority`

Produce a gap report for open arrows.

Freeze rule:
only hardening, enforcement closure, CI assurance, resource guards, failure recovery, truthful status.
No new major subsystem program.

---

## A9. Cross-PR/provenance discipline — Sections 204–212

For release trains like #201–#210:
- audit interactions across PRs, not only each PR separately
- use base SHA, head SHA, PR list, combined diff, invariant map
- look for later PR invalidating earlier fix, duplicate implementation, interaction races, wiring drift
- cross-PR audit first produces findings/provenance, then fixes clean main
- long-running diverged audit procedure: `freeze → inventory → reconcile → reproduce clean main → re-derive`
- agent memory is not provenance
- use compact review packs to reduce context cost

Review pack:
- Finding ID
- Invariant
- Vulnerable source
- Reproduction
- Patch
- Regression
- Relevant callers
- Known limitations

Review pack accelerates navigation; reviewer still inspects source.

The Assurance Plane’s runtime purpose is to prove Yana’s evolution still obeys authority, resource, evidence, platform, and release contracts.

---

# WORKSTREAM A — FINAL HANDOFF TO B

Before B finalizes CI/release closure, provide a machine-readable or concise handoff containing:

- final `origin/main` SHA used
- Finding IDs + status
- exact invariant IDs/wording proposed
- regression test commands
- platform-sensitive tests
- known runtime prerequisites
- known silent-skip hazards
- resource envelopes
- failure semantics
- areas still COMPILE ONLY / UNVERIFIED
- required paths that should deterministically escalate CI

Do not ask B to infer runtime truth from PR descriptions.

# WORKSTREAM A VERDICT

End with one of:

- `RUNTIME STABILIZED FOR CURRENT SCOPE`
- `RUNTIME STABLE WITH EXPLICIT DEBT`
- `RUNTIME REQUIRES FURTHER STABILIZATION`

Every conclusion must point to reproducible evidence.
