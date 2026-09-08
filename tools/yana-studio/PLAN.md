# Yana Studio — new desktop, not a legacy reskin

Design author: Vũ Văn Tâm. Source: `Yana Desktop - Main Workspace.dc.html`.

Scope: only tools/yana-studio. Existing desktop, web gateway, runtime source,
installed app and user credentials remain untouched. Separate user-data directory.

The legacy Desktop is a behavior and feature-requirements reference only. Useful
workflows may be re-specified and rebuilt on Studio's host/runtime boundaries, but
legacy components, state stores, renderer credential ownership and web-gateway
architecture are not copied into this app. Feature parity means equivalent user
capability with an independently verified implementation, not source reuse.

1. New Electron host, restricted preload and typed React renderer.
2. First-class human PTY sessions: xterm, resizing, Unicode, scrollback, lifecycle.
3. Real project selection, file editor and read-only Git/worktree inspection.
4. Rust NDJSON chat adapter, explicit provider configuration, cancellation and approval.
5. Durable conversations/layout, integration tests, distinct app launch.

No browser code-server dependency. No legacy server.js. No autonomous use of the
human terminal. No fake progress, connector state, cost, trust or runtime health.

Reference study: Orca `af82126058de7ff0864f4cfb0ed347914595de91` (MIT).
Learned patterns: PTY lifetime separate from visible tab; bounded output with
renderer acknowledgements; WebGL failure falls back to DOM. Source implementation
here is independent, not a copy of Orca. Upstream runtime contract inspected at
Yana origin/main `31eda0bd`; the existing checkout is older and left intact.

Initial app is a development milestone, not a signed replacement release.
Remaining product areas include OAuth connectors, SSH/Docker, device control,
task mutations, signed updates, portable backups and complete localization.
These will not be represented by nonfunctional navigation buttons.
