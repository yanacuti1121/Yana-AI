# ADR-015 — Remote Approval Continuation Protocol and Intent Contract Foundation

**Status:** Part 1 (Remote Approval Continuation Protocol) implemented and
shipped 2026-08-28 — see `src/runtime/pending_approval.rs`. Part 2 (Intent
Contract) has its *enforcement half* implemented and shipped the same day
(`IntentDeclaration` + `narrow_by_intent` in `src/runtime/authority.rs`) —
the *declaration half* (a model-facing surface to actually submit one)
remains deliberately undesigned, per this document's own Part 2 scoping
below. Originally written 2026-08-28 as design-only for both parts; Part 1
and Part 2's enforcement half were promoted from design to code the same
day once the workstream continued.
**Date:** 2026-08-28
**Decision owner:** Human project owner

## Why this was design-only at first, and what changed

Items #1–#4, #6, #8–#11 of the same workstream (Capability Lease atomicity,
token-aware scope matching, `AuthorityDecisionReceipt`, `ExecutionReceipt`,
delegated leases, CI hardening) were implementable within the existing
`RuntimeAuthority`/`capability::lease` primitives without changing any
client-facing contract. Items #5 and #7 were different in kind, and this
document was originally written design-only for both:

- Item #5 needed a durable, cross-process resumption mechanism.
  `TurnRequest`/`TurnContext` (`src/runtime/request.rs`,
  `src/runtime/origin.rs`) did not derive `Serialize`/`Deserialize` —
  confirmed by reading both files directly at the time. **Resolved**:
  both now derive it (along with every type reachable from them --
  `SessionContext`, `TurnOrigin`, `ChatMessage`, `ImageAttachment`,
  `ToolCall`), and `src/runtime/pending_approval.rs` implements the full
  continuation. See Part 1 below for the shipped design.
- Item #7 needed a new, currently-nonexistent primitive: a way for a
  model to *declare* the capability envelope it intends to use for a
  bounded plan, checked against `HumanGranted ∩ PolicyAllowed ∩
  DelegatedAuthority` before any of it executes. **Partially resolved**:
  the enforcement primitive (`IntentDeclaration` + `narrow_by_intent`) is
  implemented and wired into `capability_decision` -- see Part 2 below.
  The model-facing *declaration* surface (how a model or a coordinator
  actually submits one) remains undesigned; Part 2 explains why that
  half is still deliberately out of scope.

Building either without confirming the shape of the API a real client
needs is exactly the failure mode `CURRENT-MILESTONE.md`'s scope
discipline exists to catch: a subsystem built for elegance instead of a
confirmed need. This document named the confirmed need (real code, real
`bail!()`s, cited below) before either part became code.

---

## Part 1 — Remote Approval Continuation Protocol (item #5)

### Confirmed gap (not assumed — read from the real code, 2026-08-28)

Every client that constructs a `TurnEngine` was grepped directly
(`grep -rln "TurnEngine\\b" src/ | grep -v runtime/`): `chat/tui/turn.rs`
(Terminal), `chat/headless.rs` (Desktop and packaged Web, per ADR-014),
`remote/mod.rs` (Discord). Terminal is the only one that actually
implements `TurnOutcome::AwaitingApproval`:

```rust
// src/chat/tui/turn.rs — real continuation, in-process
Ok(TurnOutcome::AwaitingApproval { call, continuation_messages, usage, tool_rounds }) => {
    self.tool_rounds.set_rounds(tool_rounds);
    self.adopt_runtime_messages(continuation_messages);
    self.prepare_pending_approval(call);   // resumed on the next keystroke, same process
}
```

Desktop/Web and Discord both treat the same outcome as a bug:

```rust
// src/chat/headless.rs — Desktop, packaged Web
TurnOutcome::AwaitingApproval { .. } => {
    anyhow::bail!("headless desktop turn unexpectedly requested human approval")
}

// src/remote/mod.rs — Discord
Ok(TurnOutcome::AwaitingApproval { .. }) => {
    anyhow::bail!("remote plain-chat turn unexpectedly requested capability approval")
}
```

**Concrete consequence:** today, Desktop, packaged Web, and Discord can
only safely expose capabilities with `ApprovalRequirement::None`
(read-only). Any attempt to route a `HumanApprovalPerCall` capability
through those three clients crashes the turn rather than pausing for a
real decision. MCP is a separate case — it calls `src/capability/*`
directly per its own design (ADR-014), not through `TurnEngine`, so it is
out of this ADR's scope; its authority story is a different, already-solved
one (`crate::capability::*` is the same runtime MCP's tools call, per
`capability` CLI's own doc comment).

### Locked invariant carried over unchanged

**No client may manufacture `ApprovedTool` or self-declare approval.**
Whatever this protocol becomes, the resume path still calls
`RuntimeAuthority::authorize_approved_tool` — the exact same call
Terminal's own in-process resume already makes. A remote client sends a
*decision*, never an *authorization*; `RuntimeAuthority` remains the sole
place `human_approved: bool` turns into an `Allow`.

### Proposed shape

```
ToolProposed          (RuntimeEvent::ToolRequested — already exists)
       ↓
ApprovalRequired       (RuntimeEvent::HumanApprovalRequired — already exists)
       ↓
[durable pause — new]
       ↓
human decision arrives, out of process, on ANY channel
       ↓
TurnResumed            (new RuntimeEvent variant)
       ↓
capability executes (same authorize_approved_tool call as today)
       ↓
ToolCompleted          (RuntimeEvent::ToolCompleted — already exists)
       ↓
turn continues to MessageCompleted/TurnCompleted (already exist)
```

`RuntimeEvent` (`src/runtime/events.rs`) already carries most of the
vocabulary a continuation protocol needs — confirmed by reading the full
enum: `TurnStarted, AuthorityDenied, MessageStarted, TextDelta,
ToolRequested, ToolApproved, ToolDenied, HumanApprovalRequired,
ToolStarted, ToolCompleted, Metrics, MessageCompleted, TurnCompleted,
Cancelled, Error`. This is not a new event system to invent — it needs
exactly two additions (`TurnResumed`, and an explicit
`ApprovalDecisionRecorded { call_id, decision, actor }` distinct from
`ToolApproved`/`ToolDenied` so a receipt can distinguish "a human decided"
from "the tool ran"), plus a persistence layer underneath it.

**Durable pause record** (new, not yet built): when `TurnEngine::run`
returns `TurnOutcome::AwaitingApproval`, the pausing client (Desktop,
packaged Web, or a future Discord approval flow) writes the pause state
to `.yana-ai/pending-approvals/<approval_id>.json` instead of discarding
it — the same append-only-JSON-under-a-real-file-check discipline
`cost.rs`/`lease.rs`/`receipt.rs` already use for other `.yana-ai/*`
state, not a new persistence pattern. The record needs, at minimum:

```
PendingApproval {
    approval_id,      // new UUID, the token a client resumes with
    turn_context,      // TurnContext — needs Serialize/Deserialize (gap above)
    model,
    messages,          // continuation_messages from AwaitingApproval
    tool_rounds,
    pending_call,       // the ToolCall awaiting a decision
    authority_reason,   // why it paused — for display, not re-checked (authorize_approved_tool re-checks for real)
    created_at,
    expires_at,         // a stale pause must not resume after a policy/HALT change without re-hitting the real check — which it will, since resume calls authorize_approved_tool again unconditionally
}
```

**Resume entry point** (new, not yet built): `yana-rt chat resume
--approval-id <id> --decision allow|deny [--actor <name>]`, or an
equivalent Desktop-only IPC call with its own local auth. Either path
must: load the `PendingApproval` record, reconstruct a `TurnRequest` from
it, and call `TurnEngine::run` again with `human_approved` sourced from
the recorded decision — which flows into the *same*
`authorize_approved_tool` call every other path already uses. A HALT or
policy change since the pause is caught here automatically, because
`capability_decision`'s `preflight_turn` check is unconditional on every
call, resume included — the exact "a lease issued at 10:00 does not
survive a HALT at 10:05" invariant the milestone doc already states for
leases applies identically to a paused approval.

**Transport:** NDJSON first, not WebSocket-only. This is not a new
choice — `chat/headless.rs` already writes its outcomes as NDJSON lines
(`write_json_line(&mut output, &json!({ "type": "cancelled", ... }))`),
confirmed by reading that file. A continuation protocol extends that
existing convention (one more line-delimited JSON event type,
`TurnResumed`) rather than requiring Desktop's WebSocket bridge
specifically. A future WebSocket or IPC transport can carry the same
typed events; this ADR does not lock the design to either.

### Implementation status (2026-08-28)

Shipped: `src/runtime/pending_approval.rs` (`PendingApprovalStore` +
`resume_turn`), the `Serialize`/`Deserialize` derives, `chat/headless.rs`
wired end to end (real capabilities via `chat::tools::catalog`, real
`ChatCapabilityExecutor`, `AwaitingApproval` persists instead of
crashing, `--resume-approval` CLI flag), `RuntimeEvent::TurnResumed`,
`yana-rt authority pending-approvals`. Verified end-to-end against a
real local model (Ollama) across two separate process invocations, not
just unit tests — see the shipping PR's test plan for the full receipt
trail proving the causal chain held.

### What is still deferred (out of scope for this pass, not silently dropped)

- The Desktop-side UI for showing a pending approval and collecting a
  decision — a product/UX task, not an authority-primitive one. Today a
  human (or a script acting on their behalf) constructs the
  `--resume-approval` stdin JSON directly.
- Discord's specific approval UX (a slash command? a reaction? DM the
  requester?) — needs a product decision this document does not make.
  Discord's own `remote/mod.rs` still `bail!()`s on `AwaitingApproval`;
  only `chat/headless.rs` (Desktop/packaged Web) was wired.
- A second mutating call proposed mid-resume re-pauses correctly (handled
  in `dispatch_resume`), but there is no tested upper bound on how many
  times one logical task can pause/resume — not a known problem, just
  not exercised past one round-trip.

---

## Part 2 — Intent Contract Foundation (item #7)

### Why this is placed after delegation, unchanged from the milestone doc

`docs/MILESTONE-AUTHORITY-DEPTH.md`'s own P2 section already states the
core design and its rationale ("answering 'what does this agent want to
do' is meaningless before answering 'who actually delegated what
authority to this agent'"). Delegation (item #6) is now real
(`Lease.parent_lease_id`, ancestor-chain AND-composition in
`try_consume_matching`) — this section refines the milestone doc's
`EffectiveEnvelope` formula against what that implementation actually
provides, rather than restating it unchanged.

### Refined formula, grounded in what now exists

```
EffectiveExecutionEnvelope =
    ModelRequested            (new primitive — does not exist yet)
    ∩ HumanGranted            (a live human_approved=true click, OR a matched Capability Lease — both real today)
    ∩ DelegatedAuthority       (Lease.parent_lease_id ancestor-chain — real today, item #6)
    ∩ PolicyAllowed            (capability::registry's ApprovalRequirement/RiskTier — real today)
    ∩ RuntimeCapabilityAvailability  (descriptor.availability(&session) — real today, capability_decision's existing check)
```

Four of the five terms already exist as real, enforced checks inside
`capability_decision` (`src/runtime/authority.rs`) — `HumanGranted`,
`DelegatedAuthority`, `PolicyAllowed`, and `RuntimeCapabilityAvailability`
are not new work, they are what `capability_decision` already computes
today, just not yet exposed as named terms a model-declared intent could
be intersected against. **`ModelRequested` is the only genuinely new
primitive this item needs.**

### `ModelRequested` — the one new primitive, and why it is untrusted

The milestone doc's own stated flaw applies unchanged: a model (or a
prompt injection) can *declare* whatever it wants; that declaration must
never itself become an authority. Concretely, if built:

```
IntentDeclaration {
    turn_id,
    declared_capabilities: Vec<String>,   // capability names, e.g. ["command.execute"]
    declared_scope: Vec<String>,           // e.g. ["cargo test", "cargo clippy"]
    declared_reason: String,               // free text, logged, never trusted as justification
}
```

A declaration only ever **narrows**: `capability_decision` would compute
`EffectiveExecutionEnvelope` as today (the four real terms above), then
intersect the result with `declared_capabilities`/`declared_scope` if a
declaration is present for the turn. If the model asks for something
outside what it already had (e.g. `git.push.force` when
`PolicyAllowed`/`DelegatedAuthority` never included it), the intersection
with those terms is already empty — the declaration cannot grant
anything, only ask for a subset of what the other four terms would have
allowed anyway. This mirrors `try_consume_matching`'s own AND-composition
design (item #6): safety by intersection, not by trusting a
self-reported list.

### Implementation status (2026-08-28): enforcement shipped, declaration surface still deferred

The enforcement half is real, not a placeholder: `IntentDeclaration`
(`src/runtime/authority.rs`) plus `narrow_by_intent`, which
`capability_decision` now calls at every point it would otherwise return
`Allow`. `TurnContext::with_intent` sets a declaration (additive,
chainable, does not auto-inherit into `for_subagent` the way `turn_id`
does — a coordinator's own intent and a delegated subagent's task are
not the same claim). Five tests prove the exact three properties this
section promised: a declared capability+scope is allowed; an undeclared
capability downgrades to `HumanApprovalRequired` (never a silent
`Deny`); an out-of-scope command under an otherwise-declared capability
is caught too; a declaration can never widen a HALT `Deny`; and with no
declaration at all, existing behavior is provably unchanged (all five
Red-Green verified against a temporarily-bypassed `narrow_by_intent`).

**Still deferred, and still correctly so:**

1. No CLI or provider-tool-call surface exists yet for a model (or a
   coordinator dispatching a subagent) to actually *set*
   `context.intent` outside a test. This is new protocol surface on the
   model-facing side (a new tool, or a new field on existing tool
   calls) — a product/API design decision this document still does not
   make unilaterally, and confirmed to genuinely have no real caller
   yet: `for_subagent` itself (the natural place a coordinator would
   also call `with_intent`) has zero production call sites in this
   repo today — this codebase's multi-agent dispatcher does not exist
   yet either, so there is no real orchestration layer to wire this
   into, the same honest gap `for_subagent` itself already had before
   this ADR.
2. Given (1), `IntentDeclaration` today is a real, tested, correctly-
   enforced primitive waiting for that future dispatcher — the same
   position `Lease.parent_lease_id` (item #6) was in until this
   workstream's own manual CLI smoke test (`lease grant
   --parent-lease-id`) proved it end to end. `IntentDeclaration` has no
   CLI equivalent yet because, unlike a lease (human-issued, so a human
   CLI command is a natural fit), an intent declaration is specifically
   supposed to originate from the *model or agent itself* — a human
   typing one in by hand on the model's behalf would not exercise the
   real trust boundary this primitive exists to guard.

---

## Relationship to existing ADRs

- `docs/adr/ADR-014-unified-runtime-authority-hierarchy.md` — the
  `TurnEngine`/`RuntimeAuthority` architecture both parts of this ADR
  extend, not replace. Every invariant that document states
  (fail-closed preflight, canonical capability lookup, typed events)
  holds unchanged for both proposals here.
- `docs/MILESTONE-AUTHORITY-DEPTH.md` — P0 (Approval continuation
  protocol) and P2 (Intent Contract) sections this ADR refines against
  the primitives item #6 actually shipped.

## Remaining next steps

Steps 1–4 as originally proposed here (serde derives, `PendingApproval`
store, `chat/headless.rs` wiring, `IntentDeclaration` enforcement) are
all done. What is left, in the order it makes sense to pick up:

1. Design the actual model-facing (or coordinator-facing)
   `IntentDeclaration` submission surface — the one piece Part 2 still
   does not resolve. Likely candidates: a new tool exposed alongside
   `read_file`/`run_command`, or a field a coordinator sets when it
   eventually dispatches a real subagent — but that dispatcher does not
   exist in this codebase yet either, so this step may naturally land
   together with building it, not before.
2. Wire Discord's `remote/mod.rs` onto the same `PendingApprovalStore`/
   `resume_turn` Desktop now uses, once Discord's own approval UX
   (slash command / reaction / DM) is decided — a product question, not
   an authority one.
3. A Desktop-side UI for reviewing and resolving a pending approval
   (today: hand-constructed stdin JSON only).
