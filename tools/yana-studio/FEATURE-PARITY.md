# Yana Studio feature parity register

Updated: 2026-09-08 (Tasks screen added). Source requirements: the user-provided legacy Yana Desktop
feature inventory. Statuses below are based on Studio source and tests, not on the
presence of a button or filename in the legacy app.

The legacy Desktop is a requirements and behavior reference only. Studio rebuilds
retained capabilities against its own trusted Electron host, narrow IPC, Rust
runtime boundary and persistence contracts. It does not import legacy components,
renderer credential ownership, web gateway architecture or sample data.

## Capability matrix

| Area                       | Working foundation in Studio                                                                                                                                                                                             | Remaining parity work                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI chat                    | Multiple persisted conversations, streaming Rust runtime, stop, approval event and token usage                                                                                                                           | Sanitized Markdown, syntax highlighting, structured thinking/progress/result blocks, task router/failover, agent catalog                                 |
| Terminal & PTY             | Real node-pty/xterm sessions, full 16-color ANSI palette, WebGL fallback, tabs, split/grid, resize, search, write/exit IPC                                                                                               | User-selectable terminal presets, drag-resizable split tree, shell integration/CWD, external IDE launch and a separately governed embedded IDE contract  |
| Files & workspace          | Explicit project registration, root sandbox, paginated directory view, project filename search, edit/save with conflict protection, bounded 256 KiB read windows for giant files                                         | Content search/index, tree virtualization/watch, attachments, clipboard, multi-select/operations, trash/ZIP, and governed region editing for giant files |
| Models & providers         | All 19 canonical Rust providers split into cloud/local views; provider defaults, local discovery, custom endpoint and isolated OS-encrypted keys                                                                         | Canonical runtime health/circuit/quota/cost records, provider-side cloud discovery and explicit routing policy                                           |
| Local AI                   | Trusted-host discovery for 9Router, Ollama, LM Studio, llama.cpp, TurboFieldfare, AirLLM and custom OpenAI-compatible endpoints; Rust remains execution authority                                                        | Runtime lifecycle, install/pull/delete approvals, hardware fit/capabilities and multiple named local profiles                                            |
| Git                        | Read-only status, worktrees and diff; matches the AI-visible Rust capability registry                                                                                                                                    | Human-only stage/unstage/commit UI after a separate design; never register these as AI tools                                                             |
| Connections & OAuth        | Unified main-process manager, OS-encrypted tokens, Google identity/Gmail separation, GitHub device flow, Slack/Notion adapters                                                                                           | Production Slack/Notion broker, connector resources/actions, Figma/Canva and later Drive/Calendar/Discord/Microsoft/Linear/Jira/Dropbox                  |
| Privacy & data             | File-count/size overview; validated Studio state export/restore by picker or drop; credentials, account verifier, runtime path and terminal state excluded                                                               | Runtime-owned memory export/restore/reset, rollback, automatic backup and schema migration                                                               |
| Local account              | Optional local email/password profile with scrypt verifier and restart lock, or Google Identity profile; explicitly no cloud sync                                                                                        | Multiple profiles, recovery flow, and optional server account only after a separate backend/privacy design                                               |
| Tasks & process            | Child chat and terminal lifecycle management; task CRUD against the real `yana-rt task` store (create, done with required evidence, typed dependencies, drop); blocked state always runtime-derived, never set by Studio | Task/evidence/activity correlation, AgentRun linkage, bulk operations                                                                                    |
| Governance                 | Trusted IPC frame, URL allowlist, no renderer token getter, single-instance lock, runtime approval display, 10-entry capability inventory contract-tested against Rust                                                   | Permission lease UI, host/governance health, HALT state and evidence inspector                                                                           |
| Remote tools               | Runtime feature inspection for Discord/MCP, Discord allowlist counts, credential presence only, and external coding-tool PATH detection; human PTY remains separate                                                      | Secure Discord credential provisioning, service lifecycle and richer runtime diagnostics                                                                 |
| Update & release           | Development build only                                                                                                                                                                                                   | Signed update metadata, ask-before-download/install, packaging CI for macOS/Linux/Windows, notarization/signing strategy                                 |
| Productivity               | Command palette, canonical runtime-event view and searchable `COMMANDS.md` reference with copy/terminal-prefill actions                                                                                                  | Full activity history/filter, notifications, diagnostics and accessibility/localization completion                                                       |
| Experimental legacy extras | None are assumed required                                                                                                                                                                                                | Mobile companion, VTuber overlay, TTS, Opus, Qdrant and HTML templates each require a separate product decision and threat model                         |

## Delivery order

1. **Input and rendering safety** — sanitized Markdown, structured runtime blocks,
   external file attachments, search, trash and ZIP inspection.
2. **Governed mutation design** — prepare diff/approval/evidence UI for the future
   Rust file-mutation contract. Git stage/unstage/commit remain human-only UI actions.
3. **Operational control plane** — governance/HALT/feature status, permission leases,
   connector resources and runtime diagnostics.
4. **Runtime memory portability** — Studio state backup exists; define the Rust
   memory contract before adding memory reset, rollback and automatic backup.
5. **Distribution** — packaging, signing, update safety and cross-platform CI after
   the product paths above have acceptance tests.
6. **Optional surfaces** — remote/mobile/media/vector/template features only when
   their user value and governance boundary are explicit.

## Non-negotiable acceptance rules

- No visible control counts as implemented without a working host/runtime path and
  a test of the user action.
- Human PTY input is never an AI capability execution path.
- Secrets, OAuth tokens and login sessions never enter portable backups or renderer
  state.
- Existing user repositories remain in place; Studio stores references only.
- A legacy feature is retained for user value, not merely because legacy code exists.
- `Workspace` remains the Rust CRM/inbox domain name; Studio calls its project/file
  architecture `ProjectWorkspace`.
- Local endpoint discovery is not presented as canonical Provider Gateway health.

## Discrete backlog (27 remaining capabilities)

The broad matrix above intentionally groups related work. The current discrete
backlog is larger than twenty items: rich Markdown; structured thinking blocks;
progress cards; result cards; router failover; agent catalog; terminal presets;
shell CWD integration; drag-resizable panes; external IDE launch; governed embedded
IDE; content search/index; file watcher/tree virtualization; multi-select/copy/move;
outside-project attachments; clipboard/drop intake; trash;
ZIP inspection; safe extract/create; human Git stage/unstage/commit UI;
task/evidence/activity correlation with AgentRun; permission leases; HALT and
host health; capability/evidence inspector; connector resources/actions; memory
export/restore with rollback; local runtime lifecycle/model operations; and signed
updates plus three-platform packaging.

Task CRUD (create/list/done-with-evidence/typed-dependency/drop) shipped against
the real `yana-rt task` store — see the Tasks & process row above.

Vietnamese, Korean and English locale selection now has a persisted preference and
applies to the primary shell, settings navigation and terminal state. Remaining
secondary-page copy must move into the same dictionary rather than creating another
localization mechanism.
