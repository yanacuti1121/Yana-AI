# Local Embodiment Runtime — Eyes, Hands, Legs for local AI

**Status:** Draft — design only, not implemented. Part of
`docs/YANA-CONTROL-PLANES.md`. This is "mắt tay chân cho AI local" —
anh's plan from before this session, folded into the same
consolidation effort rather than tracked separately, per his explicit
instruction.

## Purpose

`yana-ai chat --provider ollama` can talk, but cannot read the repo it
is sitting in — it says "tôi không đọc được file" instead of reading
one. Local and cloud models alike must be able to observe and act
through one shared capability runtime, but no model — local or cloud —
gets direct access to the shell, filesystem mutation, processes, or
desktop. Claude, Codex, and local models are reasoning engines. Yana AI
owns observation, permissions, execution, approval, audit, and
evidence.

This system must reuse existing Yana AI/`yana-rt` capability, event,
guard, sandbox, audit, evidence, HALT, and executor infrastructure. It
must not design a parallel security runtime.

## What already exists — the real starting point

This is the most consequential finding of the Phase 1 investigation:
**most of the primitives this design needs are already built and
running.** The gap is narrower than "build eyes/hands/legs from
nothing" — it's "connect what exists, recover what's stranded, stop
what's duplicated."

| Layer | Already built | Gap |
|---|---|---|
| **Evidence** | `src/evidence/` — HMAC-signed receipts, `yana-rt evidence run <cmd>`, tamper-evident (`evidence verify`) | Not yet wired into every capability's output — see "Evidence" section below |
| **Approval** | `src/chat/tui/approval.rs` — y/N gate, guard-denial has no override path | Only covers `run_command` today; needs to cover Hands/Legs generally |
| **Event bus** | `src/bus.rs` — typed `BusEvent`, JSONL, `emit/read/reply/inbox` | Not yet used for Eyes' observation events |
| **Memory** | `src/memory.rs`'s `L3Fact` (key/value/tags/confidence/scope/promoted), `core/memory/L2_session/` | Layer boundaries (L0-L4 below) not yet formalized against these real structs |
| **Eyes/Hands (read-only capabilities)** | `src/capability/` (`repo_tree`, `read_file`, `search_code`, `git_status`, `git_diff`, `host_summary`, `list_processes`, `process_details`) + `src/mcp.rs` exposing them as 9 MCP tools | **Built but unmerged** — only on branch `fix/turbofieldfare-provider-entry` (commit `cfdf0d4d`), never landed on `main`. An untracked `src/yana-program-j-capability-runtime-rust.zip` looks like a backup of the same work. First real decision before any Wave 4/5 work: recover this, don't rebuild it. |
| **Guard / fail-closed** | `src/guard/mod.rs`'s `check_command()`, `core/hooks/guard-destructive.sh` | Already the single source of judgment for destructive commands — Hands must route through this, not a new judgment layer |
| **Duplication already present** | `src/chat/tools/read_file.rs` independently re-implements file reading instead of calling `src/capability::read_file` | Must be consolidated as part of this work, not left as a second copy once capability/ is merged |

## 3.1 Eyes — Observation

Not one model looking freely at everything — a set of bounded,
typed-output observers.

**Observer types:** Repository Observer, File Observer, Git Observer,
Terminal Observer, Process Observer, Window Observer, Screen/Vision
Observer (later, behind a feature flag), CI Observer, System Health
Observer.

**Repository Observer is the shared substrate** — the same one
Evolution Governor's Capability/Health maps read from
(`docs/EVOLUTION_GOVERNOR.md`). One scanner, two consumers. Building a
second repo scanner for the Governor and a first one for Eyes would be
exactly the "quả bóng mới để chống quả bóng cũ" anh named as the thing
to avoid.

Example event, using `src/bus.rs`'s real `BusEvent` shape (`id`, `ts`,
`from`, `to`, `type`, `payload`, `reply_to`) rather than inventing a
new envelope:

```json
{
  "id": "...", "ts": "2026-08-08T00:00:00Z",
  "from": "repo-observer", "to": "local-model",
  "type": "repo.file.read",
  "payload": {
    "path": "src/guard/mod.rs",
    "sha256": "...",
    "bytes": 4213,
    "mtime": "2026-08-07T20:11:00Z"
  }
}
```

**Rules:**
- Read-only by default.
- No continuous screen capture.
- No observation outside the granted workspace scope.
- Bounded snapshot size (matches `src/chat/tools/read_file.rs`'s
  existing `MAX_READ_BYTES = 256 * 1024` precedent — a real, already
  in-production cap, not a new number to invent).
- Secrets and sensitive data redacted before the model sees them.
- Source and timestamp on every observation, always.
- Local-first, works offline, provider-independent.
- Only task-relevant context reaches the model — no dumping a whole
  tree when a `read_file` would do.

## Evidence — proof of read, not narrated read

Anh's explicit standing requirement: every capability that reads the
project must return real source metadata (path, size, hash or
timestamp) — the model may only claim "I have read X" when the claim
traces to a real capability call, never to a prompt or an inference.
This is the direct application of `src/evidence/`'s existing HMAC
receipt design (`YANA-EVIDENCE v1 <exit> <sha256(output)> <hmac>`,
signed with a key the model never sees) to every Eyes observation, not
just shell commands. Foundation for future audit: "what did the AI
actually see before deciding this" becomes answerable from signed
receipts, not from trusting the model's own narration — directly
serving this project's "Audit first. Guard always." principle.

## 3.2 Hands — Mutation capabilities

`file.read`, `file.patch`, `file.create`, `git.diff`, `git.commit`,
`test.run`, `build.run`, `process.start`, `package.install`,
`network.fetch`, `ui.click`, `clipboard.write`.

Models never run `rm -rf`, `git reset --hard`, `npm publish`,
`curl | sh` directly — they submit a typed capability request:

```yaml
capability: file.patch
requester: local-model
scope:
  workspace: yana-ai
  path: src/guard/mod.rs
intent:
  description: add regression handling
  proposal_id: PROP-0042
  build_contract: BUILD-0017
constraints:
  max_files: 2
  max_lines_changed: 120
  network: denied
```

Yana AI validates, then hands off to the **canonical executor** — the
same one `run_command.rs` already routes through, not a second one.

## 3.3 Legs — Context movement

`workspace.open`, `workspace.switch`, `directory.navigate`,
`task.resume`, `workflow.advance`, `process.attach`,
`environment.select`, `sandbox.enter`, `sandbox.exit`.

Legs answer "where is the AI"; Hands answer "what is the AI allowed to
do." Keeping them distinct is deliberate — moving into a sandbox is not
the same decision as mutating a file once inside it.

## 3.4 Memory

Layers, mapped onto real existing structures rather than invented from
scratch:

| Layer | Scope | Maps onto |
|---|---|---|
| L0 | current request context | in-memory, per turn |
| L1 | session memory | `core/memory/L2_session/` naming predates this doc — reconcile numbering before implementation, don't silently rename what's already live |
| L2 | project memory | `.yana-ai/l3.jsonl` — again, existing numbering (`L3Fact`) doesn't match this doc's L2; **flagged, not resolved here** — Evolution Governor's roadmap should carry a `CONSOLIDATE: memory layer numbering` item |
| L3 | decision/evidence memory | `src/evidence/` receipts |
| L4 | approved long-term knowledge | promotion path already exists: `L3Fact.promoted`, and this assistant's own memory-persistence-law.md ("L1 fact confidence must be promoted manually only") |

**Observation ≠ memory. Log ≠ knowledge. AI summary ≠ fact.** Anything
promoted to long-term memory needs: source, scope, confidence,
permission, retention policy, a correction path, a deletion path, and
resistance to prompt injection (an untrusted file's content must never
silently become a trusted long-term fact just because a model
summarized it).

## Canonical safety path

Every model and every builder — cloud or local — uses exactly one path:

```
Model Intent
  → Typed Capability Request
  → Policy / Guard (src/guard/mod.rs::check_command, unchanged)
  → Human Approval when required (src/chat/tui/approval.rs, extended)
  → HALT Check (core/hooks/giamthi-halt-check.sh — the real, already
    running supervisor that halted a push this session over a genuine
    core-lock drift finding, not a hypothetical mechanism)
  → Audit Pre-entry
  → Canonical Executor (one — not one per client)
  → Result and Evidence (src/evidence/, extended to cover Eyes too)
  → Observer Feedback
  → Selective Memory (per L0-L4 above, nothing automatic)
```

No separate mutation path for Claude, Codex, Cursor, Antigravity, local
models, Desktop, Python wrappers, or the Rust runtime. One executor,
full stop.

## Minimum repository shape

Conceptual, not prescriptive — do not create these paths if an
equivalent canonical one already exists (several already do, per the
table above):

```
.yana/
├── governance/
│   ├── architecture-budget.yaml
│   ├── capability-map.yaml
│   ├── roadmap.yaml
│   ├── proposals/
│   ├── decisions/
│   └── evidence/
├── runtime/
│   ├── observers.yaml
│   ├── capabilities.yaml
│   └── permissions.yaml
└── contracts/
    ├── build-ready/
    └── task-plans/
```

Note: `.yana-ai/` (with the hyphen) already exists and already holds
`bus.jsonl`, `l3.jsonl`, chat history — a naming collision risk with
the `.yana/` shown above worth resolving explicitly before Wave 0
starts, not silently during implementation.

## Implementation waves — documented only, not started

Do not build more than one wave at a time. Do not build in parallel —
that directly contradicts the reason this design exists (see
`docs/ARCHITECTURE-HEALTH-2026-08.md` item 35, "làm nhiều hướng cùng
lúc").

**Wave 0 — Contracts and inventory.** Confirm event schema (reuse
`BusEvent`, don't invent a new one). Confirm capability manifest.
Generate current capability inventory (Evolution Governor's Capability
Map, run once, by hand if needed). Identify the canonical executor
(already `run_command.rs`'s path — confirm, don't guess). Resolve the
`src/capability/` unmerged-branch question. Resolve the `.yana/` vs.
`.yana-ai/` naming collision. Add no new execution capability.

**Wave 1 — Shared Repository Observer.** Read-only repo snapshot: file
tree, manifests, dependency map, tests, CI, docs. Shared by Idea
Challenger, Evolution Governor, and local AI Eyes — one scanner.

**Wave 2 — Minimal Idea Challenger.** Proposal intake, repo overlap
search, evidence review, one of the five verdicts. No implementation
authority (see `docs/IDEA_CHALLENGER.md`).

**Wave 3 — Evolution Governor.** Health/risk/dependency/capacity maps,
NOW/NEXT/LATER roadmap, `BUILD_READY` contract compilation. Anh
approves NEXT → NOW.

**Wave 4 — Local AI Eyes.** File, repo, terminal, process observation.
Screen/Vision stays later, behind an explicit feature flag. Read-only
first — recovering the unmerged `src/capability/` work is the likely
fastest path here, not a rebuild.

**Wave 5 — Hands and Legs.** Typed capability requests through the
existing Guard/Approval/HALT/Audit/Sandbox/canonical-executor chain. No
model ever gets direct shell access.

## Non-goals

- Fully autonomous project governance.
- Automatic merging.
- Unrestricted self-modification.
- An AI council of many debating agents.
- Separate scanners per subsystem (see Eyes section above).
- A second event bus, second capability runtime, second mutation
  executor — all three already exist once.
- Continuous screen surveillance by default.
- Automatic long-term memory from every observation.
- Replacing anh as the decision-maker.
- Implementing all three control-plane systems simultaneously.
- New production dependencies without evidence.

## Core principles

Local-first · Provider-independent · Human-controlled · Fail-closed ·
Least privilege · Typed and auditable · One canonical mutation path.

See also: `docs/YANA-CONTROL-PLANES.md`, `docs/EVOLUTION_GOVERNOR.md`,
`docs/IDEA_CHALLENGER.md`, `docs/programs/PROGRAM-J-SKELETON.md` (the
Program this Eyes/Hands work is a direct continuation of).
