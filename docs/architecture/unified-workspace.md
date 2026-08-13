# Yana Rust Unified Workspace

The unified workspace is a local-first `yana-rt` domain that connects messages,
documents, tasks, agent actions, pull requests, memories, email references,
calls, contacts, and companies without replacing Yana's guard or runtime core.

This is a clean-room implementation of general workspace architecture patterns.
No Macro source code, schema, branding, or AGPL implementation is copied.

## Architecture

```text
CLI / MCP adapters
        │
        ▼
WorkspaceOperation
        │
        ▼
WorkspaceService ─── ActionGovernor
        │
        ▼
EventStore port ─── FileEventStore
        │
        ▼
.yana-ai/workspace/events/*.json
        │
        ▼
WorkspaceState projections
  ├── bidirectional context graph
  ├── Signal / Review / Noise inbox
  ├── governed action queue
  └── Markdown export
```

Each event is written to a unique temporary file, synced, and atomically linked
into the event directory with create-new semantics. Concurrent writers therefore
do not overwrite a shared JSON document or an existing event. Readers fail
loudly on malformed events rather than silently discarding history.

## Seven adopted patterns

| Pattern | Yana implementation |
|---|---|
| Bidirectional context graph | Directional `Link` records are traversable from source and target. |
| Block/event model | Typed `BlockKind`, `WorkspaceEvent`, replayable `WorkspaceState`. |
| Unified memory | Deterministic memory blocks cite every explicit source and create `summarizes` links. |
| MCP coverage | Search, related-context, inbox, and typed operations call the same service as CLI. |
| Signal/Noise inbox | Signal and Review are shown by default; Noise is retained and opt-in. |
| File over app | Every block and relation exports to portable Markdown. |
| Hexagonal architecture | CLI/MCP adapters depend on service ports, not filesystem details. |

## Autonomy boundary

The default governor automatically approves Low, Medium, and High action
requests. Critical actions remain `pending_human` and can only be approved by
an explicit CLI identity in the form `human:<name>`. MCP may request an action
but cannot approve a Critical action. The workspace records authorization; it
does not execute external side effects by itself.

## CLI

```bash
yana-rt workspace create message "Customer reported a crash" \
  --body "Crash occurs after model switch" --attention signal

yana-rt workspace create task "Fix model switch crash" --attention review
yana-rt workspace link <task-id> <message-id> originated_from
yana-rt workspace show <task-id>
yana-rt workspace inbox

yana-rt workspace remember "Model-switch incident" <message-id> <task-id>
yana-rt workspace export

yana-rt workspace action request <task-id> "mutate production" \
  --risk critical --actor agent:operator
yana-rt workspace action approve <action-id> --approver human:tam
```

Workspace state stays under `.yana-ai/workspace/`. It contains no credentials,
does not execute model output, and does not bypass Yana guardrails.
