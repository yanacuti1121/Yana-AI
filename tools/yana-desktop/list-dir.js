'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// Lists the immediate children of `relPath` (relative to `repoRoot`) — one
// directory at a time, not a recursive walk. Delegates the actual
// sandboxing + listing to `yana-rt capability tree` (Gate L5,
// `crate::capability::repo_tree` — the same canonical implementation MCP's
// `repo_tree` tool and chat's tools already use) instead of reimplementing
// the realpath/escape check natively in Node. Invoked via an argv array
// (`exec`, default `execFileSync`) — no shell, no string interpolation.
//
// Every external dependency is a parameter, not read from Electron's `app`
// directly — same shape `runtime-paths.js`'s functions already use, and
// what makes this testable from plain `node` (see `_test_list_dir.js`)
// without requiring `main.js` itself, which bootstraps a real Electron app
// on require.
function listDir({ repoRoot, yanaRtBin, relPath, exec = execFileSync, existsSync = fs.existsSync }) {
  if (!existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }
  let stdout;
  try {
    stdout = exec(yanaRtBin, [
      'capability', 'tree',
      '--root', repoRoot,
      '--path', relPath || '.',
      '--depth', '0',
    ], { encoding: 'utf8' });
  } catch (e) {
    // `capability tree` writes the real reason to stderr and exits
    // non-zero on failure (path escape, missing dir, ...) — surface that,
    // not Node's own generic child-process wrapper message.
    const detail = (e.stderr || e.message || '').toString().trim();
    return { ok: false, error: detail || 'capability tree failed' };
  }
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch (e) {
    return { ok: false, error: `capability tree returned invalid JSON: ${e.message}` };
  }
  // Same directories-first, then alphabetical ordering the old native
  // implementation used — `repo_tree`'s own sort is plain alphabetical
  // (shared with MCP/chat, not UI-specific), so this UI-facing ordering is
  // applied here, not pushed into the shared Rust sort.
  const entries = envelope.data.entries
    .map((e) => ({
      name: path.basename(e.path),
      isDir: e.kind === 'directory',
      relPath: e.path,
    }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  return { ok: true, entries };
}

module.exports = { listDir };
