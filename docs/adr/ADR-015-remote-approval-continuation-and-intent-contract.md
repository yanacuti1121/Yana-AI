# ADR-015 — Remote Approval Continuation Protocol and Intent Contract Foundation (design, not implemented)

**Status:** Proposed — design only. No code in this ADR has shipped. Written
as part of the Authority Hardening workstream (items #5 and #7) per that
workstream's own explicit instruction for these two items: "design/document
it first rather than pretending it is complete" if the primitive cannot yet
be deterministically enforced in the runtime.
**Date:** 2026-08-28
**Decision owner:** Human project owner (not yet decided — this ADR proposes,
it does not accept)

## Why this is design-only, not code

Items #1–#4, #6, #8–#11 of the same workstream (Capability Lease atomicity,
token-aware scope matching, `AuthorityDecisionReceipt`, `ExecutionReceipt`,
delegated leases, CI hardening) were implementable within the existing
`RuntimeAuthority`/`capability::lease` primitives without changing any
client-facing contract. Items #5 and #7 are different in kind:

- Item #5 needs a durable, cross-process resumption mechanism.
  `TurnRequest`/`TurnContext` (`src/runtime/request.rs`,
  `src/runtime/origin.rs`) do not derive `Serialize`/`Deserialize` today —
  confirmed by reading both files directly. A real remote-approval
  continuation needs to persist and later reconstruct a `TurnRequest`
  across a process boundary (a human approves from Desktop or a CLI
  command in a different invocation than the one that paused), which is
  a real serialization/versioning design question, not a pure
  authority-logic one.
- Item #7 needs a new, currently-nonexistent primitive: a way for a model
  to *declare* the capability envelope it intends to use for a bounded
  plan, checked against `HumanGranted ∩ PolicyAllowed ∩ DelegatedAuthority`
  before any of it executes. No code in this repo does this today.

Building either without confirming the shape of the API a real client
needs is exactly the failure mode `CURRENT-MILESTONE.md`'s scope
discipline exists to catch: a subsystem built for elegance instead of a
confirmed need. This ADR names the confirmed need (real code, real
`bail!()`s, cited below), proposes a design, and stops there.

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

### What is explicitly deferred by this ADR

- The actual `Serialize`/`Deserialize` derives on `TurnContext`/
  `TurnRequest` and everything reachable from them (`ChatMessage`,
  `ToolCallRecord`, etc.) — real work, not a design question, left for
  the implementation PR.
- The Desktop-side UI for showing a pending approval and collecting a
  decision — a product/UX task, not an authority-primitive one.
- Discord's specific approval UX (a slash command? a reaction? DM the
  requester?) — needs a product decision this ADR does not make.
- Multi-approval races (two humans resolving the same `approval_id`) —
  the durable record needs the same lock-and-re-validate discipline
  `lease.rs`'s hardening pass already established; the exact mechanism
  (flock-v1, most likely, matching every other `.yana-ai/*` mutable
  store) is an implementation detail for that PR, not decided here.

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

### Why this is not implemented in the current workstream

1. No CLI or provider-tool-call surface exists today for a model to
   submit an `IntentDeclaration` — this is new protocol surface on the
   model-facing side (a new tool, or a new field on existing tool calls),
   a product/API design decision this ADR does not make unilaterally.
2. It only becomes useful once Part 1 exists: a bounded multi-step plan
   that needs an `IntentDeclaration` is exactly the kind of long-running,
   multiple-approval-point task that also needs the Remote Approval
   Continuation Protocol — building Intent Contract first, without
   continuation, would produce a feature that only works for a single
   uninterrupted Terminal session, not the cross-client case the
   milestone doc's own priority order (P0 continuation before P2 Intent
   Contract) already anticipated.

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

## Next steps if accepted

1. Add `Serialize`/`Deserialize` to `TurnContext`/`TurnRequest` and their
   transitive dependencies — a scoped, mechanical PR, testable in
   isolation (round-trip serialize/deserialize, no behavior change).
2. Design and implement the durable `PendingApproval` store, following
   `lease.rs`'s locked-JSON-file precedent.
3. Wire `chat/headless.rs`'s `AwaitingApproval` arm to persist instead of
   `bail!()`, and add the `resume` entry point.
4. Only after 1–3 are real: design the `IntentDeclaration` surface and
   its narrowing-intersection enforcement in `capability_decision`.
