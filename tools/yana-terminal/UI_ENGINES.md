# Yana Terminal UI Engines

This increment adds fourteen UI-facing engines without turning the terminal repository into a second Yana runtime.

| Engine | Responsibility | Boundary |
|---|---|---|
| Chat | Counts and coordinates submitted chat turns | No model execution |
| Composer | Owns the current input draft | No prompt persistence |
| Render | Selects transcript/compact presentation mode | No Markdown runtime yet |
| Layout | Tracks focus/split terminal layout | No platform window control |
| Workflow | Tracks UI request lifecycle | No autonomous task execution |
| Provider | Selects a provider profile shown by the UI | No HTTP requests or secrets |
| Session | Creates local UI session identities | No durable history yet |
| Storage | Tracks dirty/checkpoint state | In-memory only |
| Search | Deterministic transcript substring search | No semantic model calls |
| Command | Parses slash commands | No shell execution |
| Context View | Presents selected/locked context state | No repository scanning |
| Attachment | Validates workspace-relative attachment names | No file reads |
| Notification | Maintains a bounded UI notice queue | No OS notifications |
| Theme | Selects a named UI theme | Palette wiring remains local |

## Commands

```text
/help
/engines
/clear
/new
/provider [name]
/search <text>
/attach <workspace-relative-path>
/theme
/render
/save
```

## Next vertical slice

The next integration should replace the mock response with one typed bridge:

```text
Composer -> Command/Chat -> YanaBridge -> RuntimeEvent -> App state -> Render
```

The bridge should be the only connection to Yana Core. Guard, sandbox, audit, provider transport, durable memory, and host mutation authority stay outside this UI layer.
