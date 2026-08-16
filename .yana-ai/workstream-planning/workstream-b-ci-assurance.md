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


# WORKSTREAM B — CI/CD ASSURANCE PLANE / RELEASE GOVERNANCE

**Assigned source sections: 109 total**

`33–35, 58–75, 85–119, 140–150, 156–174, 185–203, 213–216`

This workstream owns **CI architecture, assurance orchestration, release provenance and CI governance**. It must consume runtime invariants from Workstream A rather than independently rewriting runtime production code.

---

## B0. Audit current CI before changing it — Sections 33–35

Yana CI must evolve from simple compile/unit coverage into assurance across:
- static correctness
- behavioral correctness
- platform contracts
- concurrency
- failure injection
- resource/liveness
- supply chain/release

Do not add jobs for vanity. Every job must protect a named invariant.

Inventory every active workflow, not only `ci.yml`.

Produce **CURRENT CI ASSURANCE MATRIX** with:
- workflow
- trigger
- job
- platform
- feature flags
- command
- timeout
- `continue-on-error`?
- required/advisory?
- artifacts
- permissions
- invariant actually proven

Explicitly detect:
- prerequisite-based silent skips
- compile-only jobs described as tests
- `continue-on-error`
- broad `|| true`
- swallowed failures
- checks not required by branch protection
- overly filtered modules
- tests depending on a binary that was never built
- feature mismatch between tested and released binaries

Initial conceptual tiers:
- T1 FAST PR
- T2 FULL BEHAVIORAL PR
- T3 CROSS-PLATFORM CONTRACT

Do not claim Linux/macOS/Windows parity when only Linux runs meaningful behavior.

---

## B1. Release / feature / supply-chain foundation — Sections 58–73

### Release artifact assurance
Bind release evidence to:
- source commit
- feature set
- target OS/arch
- artifact hash
- dependency lock
- tests associated with source

Prefer:
`build artifact → smoke that exact artifact → record provenance → publish same artifact`

### Feature matrix
Inventory supported Cargo feature combinations such as:
- default
- CLI
- MCP
- Discord
- pty-bridge
- wasm
- actual release binaries

Do not test every theoretical power set. Define supported combinations.

### Dependency/supply chain
Audit:
- RustSec / `cargo audit`
- `cargo deny` or equivalent
- Python dependency scanning
- npm policy if applicable
- lockfile integrity
- pinned GitHub Actions

Define advisory handling:
- severity
- reachability
- exception process
- exception expiry

### Branch protection / required checks
Report which checks should be:
- REQUIRED FOR MERGE
- ADVISORY
- NIGHTLY
- RELEASE-ONLY

Do not mutate repository settings without authorization.

### Silent-skip audit
Search scripts/tests for:
- `SKIP`
- command missing → success
- `|| true`
- absent binary → success

Classify:
`LEGITIMATE OPTIONAL / VISIBLE DEGRADATION / UNSAFE SILENT SKIP`

Critical missing prerequisite must fail or visibly degrade assurance.

### Test-the-tests
For critical regressions, prove vulnerable version fails and fixed version passes.

Priority targets:
- receipt race
- remote session race
- Discord queue bound
- multi-byte validator
- HALT authority
- Ollama truthful failure state
- AirLLM admission

### Flaky governance
No “rerun until green”.
Track:
- module/owner
- frequency
- root cause
- severity
- tracking entry

### Nightly/adversarial orchestration
Scheduled tier may include:
- repeated race tests
- soak/resource
- service lifecycle cycles
- malformed provider matrices
- state corruption recovery
- full platform suites
- dependency/security scans

Failures should retain useful artifacts.

### CI observability
Artifacts should explain:
- what grew
- when
- which process/thread
- which phase

No secret-containing artifacts.

### Categorical scorecard
Never produce a fake numeric safety score.
Use truthful categorical status per subsystem/platform.

---

## B2. Canonical assurance taxonomy — Sections 74–75

CI is two-dimensional:

1. **Assurance Domain** = WHAT invariant is protected
2. **Execution Tier** = WHEN / HOW deeply it runs

Canonical assurance domains:
- A1 Authority & Governance
- A2 Capability & Isolation
- A3 State & Evidence Integrity
- A4 Model / Provider Protocols
- A5 Resource & Liveness
- A6 Platform & Concurrency
- A7 Memory / Parser Security
- A8 Release & Supply Chain

Do not invent top-level domains unless an invariant genuinely cannot fit these eight.

---

## B3. A7 / A8 specialist assurance — Sections 85–90

### A7 Memory / Parser Security
Use fit-for-risk tools:
- clippy
- proptest
- cargo-fuzz
- Miri
- loom
- static analysis
- mutation/adversarial fixtures

#### Miri
Use selectively for:
- pure Rust
- unsafe-heavy modules
- memory semantics
- selected concurrency primitives

Prefer targeted/nightly if host-native syscalls/FFI make full runtime execution meaningless.

#### Fuzzing
Split:
- short PR fuzz smoke for changed high-risk parsers
- longer scheduled campaigns

Targets:
- command validator
- paths
- URLs
- receipts
- session state
- provider JSON
- NDJSON/SSE
- Discord events

Persist crashing inputs as artifacts.

### A8 Release & Supply Chain
Release artifact must trace to verified source.

Reproducibility contract first:
- same source
- same platform/arch
- same toolchain
- locked deps
- same features/build flags
- same declared environment

If bit-for-bit reproducibility is not yet real, record provenance rather than claiming it.

Release manifest should eventually include:
- commit SHA
- product version
- yana-rt version
- OS/arch
- Rust toolchain
- feature flags
- Cargo.lock digest
- artifact SHA256
- build timestamp if intentionally non-reproducible
- CI run identity

---

## B4. Execution tiers / matrix / required checks — Sections 91–103

Canonical tiers:
- T1 FAST
- T2 FULL
- T3 PLATFORM
- T4 ADVERSARIAL
- T5 NIGHTLY / SOAK

### T1 FAST
Typical:
- fmt
- clippy/check
- shell/Python syntax
- schema
- generated drift
- core-lock
- mirror checks
- small units
- short parser regressions

### T2 FULL
- full Rust units
- integration runtime
- hooks
- capability/evidence behavior
- provider fixtures
- remote/session behavior

### T3 PLATFORM
Relevant behavior on:
- Ubuntu
- macOS
- Windows

Platform-sensitive:
- locks
- paths
- services
- secret backends
- process plans
- atomic writes
- telemetry
- remote state

### T4 ADVERSARIAL
- races
- failure injection
- corruption
- partial I/O
- queue saturation
- worker panic
- restart storm
- duplicate events
- lock contention
- timeout behavior

### T5 NIGHTLY/SOAK
- long-running runtime
- reconnect cycles
- resource trends
- leak detection
- fuzz campaigns
- security/dependency audit
- full platform suites
- reproducibility experiments

Maintain Domain × Tier matrix as a design guide. One job may cover multiple cells.

Every check has governance classification:
- REQUIRED FOR MERGE
- ADVISORY
- NIGHTLY
- RELEASE-ONLY

Risk-based required checks must use deterministic mapping, never LLM-only authority.

Create deterministic:
`path/subsystem → domains → required tests`

Unknown change classification:
`uncertain → broader assurance`
never:
`uncertain → skip`

Every domain needs a canonical module/document/test owner.

---

## B5. Invariant / failure-policy / evidence registry — Sections 104–119

Create a compact high-value invariant registry.

Entry fields:
- ID
- Domain
- Invariant
- Canonical implementation
- Tests
- Failure severity
- Platform scope

Critical tests should reference the invariant they protect.

Create failure-policy registry using:
- DENY
- FAIL CLOSED
- DEGRADE
- RETRY
- DROP
- HALT
- HUMAN REVIEW
- CONTINUE WITH WARNING

CI failures should identify invariant IDs where practical.

Evidence binding for important CI results:
- commit SHA
- workspace state where relevant
- platform
- architecture
- toolchain
- feature flags
- test command

Local agent verification:
`fingerprint A → verify → fingerprint B`
If A != B:
`STALE`, not PASS.

Canonical:
`PASS + STALE = NOT VERIFIED`

Release artifact evidence:
test the artifact being shipped.

Workflow permissions:
use least privilege, especially:
- fork PRs
- SARIF upload
- release
- signing
- publishing

CI secret safety:
- synthetic credentials
- no env dumps
- no secrets in panic/log/artifact/fixture output

Supply-chain exceptions require:
- advisory
- reason
- owner
- created
- expiry/review date

Track CI cost:
- PR duration
- slowest jobs
- cache behavior
- nightly duration
- platform cost
- flaky reruns

Change-based escalation:
- docs → T1
- core runtime → T1+T2
- platform/process/evidence → T1+T2+T3+relevant T4
- release → T1+T2+T3+release assurance
- T5 stays scheduled

Critical paths always escalate:
HALT, quarantine, receipts, capability, actor/autonomy, locks, process spawn, service lifecycle, secrets, remote execution, release.

---

## B6. Adversarial fixture infrastructure — Sections 140–150

Preserve failing concurrency seeds/orderings where possible.

Race loops:
- select by historical failure, criticality, timing sensitivity, cost
- do not blindly run all tests 100x

Evaluate loom only for small pure-Rust synchronization primitives.

Failure-injection should use:
- test seams
- dependency injection
- fake backend
- temp FS
- mock transport
- controlled env

Avoid permanent production-only `test_mode` branches.

Build reusable provider fixture servers supporting:
- status code
- headers
- delay
- partial body
- malformed JSON
- stream termination
- connection reset

Maintain security corpora for:
- paths
- URLs
- commands
- Unicode
- IPv4/IPv6
- encoded IP
- shell syntax
- JSON
- Discord payloads

Every real bypass becomes a permanent fixture.

Unicode corpus:
- Vietnamese
- Korean
- emoji
- combining chars
- multi-byte boundaries
- mixed scripts

Path semantics:
- Unix absolute
- Windows drive
- UNC
- relative
- `..`
- symlinks
- case differences
- Unicode names
- separator variants

Network destination corpus:
- loopback
- private IPv4
- link-local
- CGNAT
- IPv6 loopback
- IPv4-mapped IPv6
- userinfo
- encoded IP
- DNS failure
- redirects
- document rebinding limitations if validation cannot pin connection resolution

Secret classification:
`SECRET / SENSITIVE / PRIVATE USER DATA / OPERATIONAL / PUBLIC`

Redaction tests cover:
- errors
- Debug/Display
- logs
- receipts
- artifacts
- HTTP errors
- Discord responses

---

## B7. Documentation / claims / CI self-governance — Sections 156–174

Machine-check architecture claims where appropriate:
- canonical paths exist
- mirrors match
- platform list matches implementation
- feature names match Cargo

Do not automate philosophical prose.

Maintain major-release claim matrix:
- Claim
- Implementation
- Test
- Platform
- Status

Statuses:
`VERIFIED / PARTIAL / COMPILE ONLY / LIVE VERIFIED / UNVERIFIED / DEFERRED`

No test-count vanity.
No workflow-count vanity.

CI modularity:
reuse helpers only when they remove real repeated behavior.

Treat critical CI semantics as architecture:
- required checks
- release build path
- permissions
- provenance
- branch-protection assumptions

Test CI helper scripts:
- change classifier
- test selector
- manifest builder
- failure parser

Fail-safe selector:
classifier uncertainty → broader tests.

Nightly failure artifact should include:
- commit
- platform
- scenario
- seed
- resource snapshot
- logs
- reproduction command

Repeated nightly failure needs explicit tracking, not permanent red noise.

Release gate must be stronger than PR gate:
- critical T1/T2
- platform artifact builds
- artifact smoke
- provenance
- dependency policy
- release regressions
- optionally selected recent T4 evidence

Release candidate that passes verification should be exactly the released artifact.

Generate SBOM where practical.

Signing guarantees are platform-specific; do not fake parity.

CI authority model:
`Developer/Agent → PR → CI Evidence → Required Gates → Human/Merge Authority → Release Authority`

CI supplies evidence; it is not sovereign authority.

Overrides should be explicit/auditable where repository tooling supports them.

Agent-generated critical changes require fresh-context reviewer distinct from executor.

Fresh reviewer receives source/diff/invariants/tests; executor conclusions are claims, not facts.

Reviewer severity:
`BLOCKING / HIGH / MEDIUM / LOW / INFO`

---

## B8. Target CI/CD architecture and workflow hardening — Sections 185–203

Conceptual pipeline:

`CHANGE → IMPACT CLASSIFIER → T1/T2/relevant T3/T4 → ASSURANCE EVIDENCE → PR REVIEW → REQUIRED GATES → MAIN → T5 + RELEASE GATE → RELEASE ARTIFACT → PROVENANCE`

Do not force a directory layout before inspecting conventions.

Possible direction only:
```text
.github/workflows/
  ci-fast.yml
  ci-full.yml
  ci-platform.yml
  ci-adversarial.yml
  ci-nightly.yml
  release.yml

core/ci/
  impact-map.*
  invariant-registry.*
  diagnostics.*
  failure-fixtures/
```

CI changes need adversarial review:
- can a critical test silently skip?
- can selector misclassify?
- can job succeed after command failure?
- can permissions be abused?
- can artifacts leak secrets?
- can required gate be bypassed?

Shell discipline:
use strict mode where compatible, but audit intentional failure handling.

Audit every `|| true`.

Audit every `continue-on-error: true`.

Critical prerequisite contract:
- expected binary exists
- jq/python/tool exists
- needed platform capability is present
- missing prerequisite is visible

Classifier tests:
- single file
- multiple domains
- rename
- delete
- generated file
- unknown path
- new directory
- workflow change

Workflow/CI/release/security-script changes are high-assurance impact.

Assess whether critical CI definitions belong under core-lock.

Generated CI reports need commit/run provenance.

Artifact retention:
separate failure diagnostics, release provenance, security reports, temporary logs.

Resource metric artifact format where supported:
- timestamp
- pid
- CPU time
- RSS
- threads
- children
- FD/handles
- queue depth
- progress marker

Prefer bounded trends over brittle absolute performance thresholds.

Benchmarks are not safety tests.

Authority-code test selection is fail-closed and subsystem/invariant-based, not LOC-based.

---

## B9. Final principle and execution order — Sections 213–216

Maturity target:

`Every critical invariant → owner → implementation boundary → failure policy → meaningful tests → fresh evidence → merge/release governance`

After runtime stabilization, implement CI evolution in this order:

1. Current CI assurance inventory
2. Invariant registry
3. 8-domain mapping
4. Impact → required-test map
5. Silent-skip / continue-on-error cleanup
6. Platform behavioral matrix
7. Resource-runaway regressions
8. Adversarial concurrency suite
9. Failure-injection fixtures
10. Required-check recommendation
11. Evidence binding
12. Nightly resource/soak suite
13. Release provenance
14. Supply-chain gates
15. Closed-loop gap report

Do not reorder for convenience if it leaves a critical hole open.

Stop this architecture/stabilization cycle when:
- critical defects fixed
- critical CI gaps closed
- resource-runaway class covered
- authority/evidence invariants protected
- cross-platform claims truthful
- release path traceable
- remaining open loops documented

Do not immediately launch another large feature program.

---

# WORKSTREAM B — REQUIRED FINAL OUTPUT

Produce:

## YANA STABILIZATION + ASSURANCE CLOSURE REPORT

Include:

- `origin/main` SHA
- PR #201–#210 provenance
- findings: fixed / disproved / already-resolved / deferred
- 8 Assurance Domains status
- 5 Execution Tiers status
- invariant registry summary
- required-check recommendations
- resource envelopes
- resource-runaway regression status
- Linux/macOS/Windows assurance
- authority closed-loop status
- secret retrieval closed-loop status
- evidence closed-loop status
- session authority status
- release provenance status
- remaining assurance debt

Final verdict exactly one of:

- `STABLE FOR CURRENT SCOPE`
- `STABLE WITH EXPLICIT DEBT`
- `REQUIRES FURTHER STABILIZATION`

No numeric safety score.
Every conclusion must point to evidence.

---

# WORKSTREAM B — INPUT REQUIRED FROM A BEFORE FINAL VERDICT

Do not guess runtime truth. Reconcile Workstream A handoff:

- final runtime SHA
- Finding IDs/status
- regression commands/results
- runtime invariant wording
- path → subsystem ownership
- platform evidence
- resource envelope facts
- known prerequisites and skip hazards
- COMPILE ONLY / UNVERIFIED areas
- runtime debt

If A and B disagree, repository state + reproducible test evidence wins.
