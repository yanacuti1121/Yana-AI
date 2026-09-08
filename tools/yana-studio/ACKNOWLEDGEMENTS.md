# Sources and attribution

## Product design

The supplied `Yana Desktop - Main Workspace.dc.html` is Vũ Văn Tâm's design.
It is not credited to Claude, Codex or Orca. Sample people, accounts, statistics
and provider statuses in that design are not imported as application data.

## Technical reference: Orca

- Repository: https://github.com/stablyai/orca
- Reference revision: `af82126058de7ff0864f4cfb0ed347914595de91`
- Upstream license reviewed: MIT, Copyright (c) 2026 Lovecast Inc.
- Studied: terminal delivery acknowledgement, bounded buffering, tab/PTY
  lifetime separation and WebGL loading/context-loss recovery.

The implementation in this directory is independently written. No Orca source
files, product logos or stylesheets are vendored. This is a technical-reference
credit, not a claim of partnership or a relicense of upstream code. If future
work imports substantial upstream code, its license/copyright notices must
travel with that code.

## Technical reference: FileManagerTUI

- Repository: https://github.com/NguyenSiTrung/FileManagerTUI
- Upstream license reviewed: MIT, Copyright (c) 2025 Nguyen Si Trung.
- Studied: paginated/lazy file navigation, project-wide fuzzy file finding,
  explicit large-file head/tail/window modes, watcher debouncing and separation
  between file state, operations, preview and editor.

Studio's implementation is independently written for Electron/Node and does not
vendor FileManagerTUI's Rust source or visual identity. If code is imported in a
future change, the corresponding upstream license notice must accompany it.

## Libraries used directly

| Library    | Purpose                                          | License | Source                                 |
| ---------- | ------------------------------------------------ | ------- | -------------------------------------- |
| Electron   | Desktop host and isolated preload                | MIT     | https://github.com/electron/electron   |
| node-pty   | Native PTY, resizing and shell lifecycle         | MIT     | https://github.com/microsoft/node-pty  |
| xterm.js   | Terminal rendering, input, search, fit and WebGL | MIT     | https://github.com/xtermjs/xterm.js    |
| CodeMirror | In-app editor, not a browser-hosted VS Code      | MIT     | https://github.com/codemirror/dev      |
| React      | UI rendering                                     | MIT     | https://github.com/facebook/react      |
| Lucide     | UI icons                                         | ISC     | https://github.com/lucide-icons/lucide |

Dependency versions are recorded in package-lock.json. Original notices remain
in installed packages. A distributor must include applicable dependency notices
when packaging; this development scaffold is not yet a redistribution pipeline.

## Yana runtime

Yana's existing Rust `TurnEngine`, authorities, providers and approval protocol
remain the AI execution boundary. Studio does not replace them with an Orca
runtime or rebuild their policy logic in JavaScript.
