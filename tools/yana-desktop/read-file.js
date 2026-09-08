'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');

// Delegates to `yana-rt capability read-file` — the canonical
// `crate::capability::repo::read_file` implementation chat's own
// `read_file` tool already uses (Gate L5 path sandbox, MAX_READ_BYTES
// size cap, UTF-8-only). Same shape as list-dir.js/git-status.js: every
// external dependency is a parameter, testable from plain `node` without
// bootstrapping Electron.
//
// TEMPORARY TRANSPORT ADAPTER (see src/capability/cli.rs's own doc
// comment on `CapabilityAction::ReadFile` for the full rationale) — a
// one-off CLI-shaped read path for the Files Workspace view (roadmap
// Phase 5), not a pattern to keep replicating per-panel.
function readFile({ repoRoot, yanaRtBin, relPath, exec = execFileSync, existsSync = fs.existsSync }) {
  if (!existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }
  if (typeof relPath !== 'string' || !relPath.trim()) {
    return { ok: false, error: 'relPath must be a non-empty string' };
  }
  let stdout;
  try {
    stdout = exec(yanaRtBin, ['capability', 'read-file', '--root', repoRoot, '--path', relPath], { encoding: 'utf8' });
  } catch (e) {
    // `capability read-file` writes the real reason to stderr (path
    // escape, not a file, too large, invalid UTF-8) and exits non-zero —
    // surface that instead of Node's generic child-process message.
    const detail = (e.stderr || e.message || '').toString().trim();
    return { ok: false, error: detail || 'capability read-file failed' };
  }
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch (e) {
    return { ok: false, error: `capability read-file returned invalid JSON: ${e.message}` };
  }
  const data = envelope?.data;
  if (!data || typeof data.content !== 'string') {
    return { ok: false, error: 'capability read-file returned an invalid response envelope' };
  }
  return { ok: true, path: data.path, sizeBytes: data.size_bytes, content: data.content };
}

module.exports = { readFile };
