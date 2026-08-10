'use strict';

// Extracted from main.js's `yana:pty-start` IPC handler so the validation
// itself is testable without an Electron runtime (electron.js can't be
// required outside a real Electron process) — same pattern as
// runtime-paths.js/_test_runtime_paths.js.
//
// SECURITY: this is the fix for a real gap found in review — `args` used
// to be spread straight from the renderer's untrusted IPC payload into the
// spawned `yana-rt chat` argv. A compromised renderer could have injected
// `--no-sandbox` and silently disabled run_command's sandbox for the whole
// session. The only legitimate caller (terminal.jsx) always sends
// `args: []`, so nothing real needs a non-empty array — reject it instead
// of filtering it, so an attempt is visible rather than silently stripped.
function isAllowedPtyArgs(args) {
  if (args === undefined) return true;
  return Array.isArray(args) && args.length === 0;
}

module.exports = { isAllowedPtyArgs };
