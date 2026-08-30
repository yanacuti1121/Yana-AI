'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');

// Delegates to `yana-rt capability zip-inspect` / `zip-extract` — the
// canonical `crate::capability::archive` implementation (Zip Slip /
// symlink / archive-bomb protected, see that module's own doc comment).
// Same shape as list-dir.js/git-status.js/read-file.js: every external
// dependency is a parameter, testable from plain `node`.
function inspectZip({ zipPath, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  if (!existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }
  let stdout;
  try {
    stdout = exec(yanaRtBin, ['capability', 'zip-inspect', '--zip-path', zipPath], { encoding: 'utf8' });
  } catch (e) {
    const detail = (e.stderr || e.message || '').toString().trim();
    return { ok: false, error: detail || 'capability zip-inspect failed' };
  }
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch (e) {
    return { ok: false, error: `capability zip-inspect returned invalid JSON: ${e.message}` };
  }
  const data = envelope?.data;
  if (!data || !Array.isArray(data.entries)) {
    return { ok: false, error: 'capability zip-inspect returned an invalid response envelope' };
  }
  return {
    ok: true,
    entryCount: data.entry_count,
    totalUncompressedSize: data.total_uncompressed_size,
    totalCompressedSize: data.total_compressed_size,
    entries: data.entries.map((e) => ({
      name: e.name, isDir: e.is_dir, compressedSize: e.compressed_size, uncompressedSize: e.uncompressed_size,
    })),
    entriesTruncated: data.entries_truncated,
    warnings: data.warnings || [],
  };
}

// `dest` must already exist (caller creates it — see main.js) — mirrors
// the Rust side's own contract, checked again there regardless.
function extractZip({ zipPath, dest, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  if (!existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }
  let stdout;
  try {
    stdout = exec(yanaRtBin, ['capability', 'zip-extract', '--zip-path', zipPath, '--dest', dest], { encoding: 'utf8' });
  } catch (e) {
    const detail = (e.stderr || e.message || '').toString().trim();
    return { ok: false, error: detail || 'capability zip-extract failed' };
  }
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch (e) {
    return { ok: false, error: `capability zip-extract returned invalid JSON: ${e.message}` };
  }
  const data = envelope?.data;
  if (!data || typeof data.extracted_files !== 'number') {
    return { ok: false, error: 'capability zip-extract returned an invalid response envelope' };
  }
  return { ok: true, extractedFiles: data.extracted_files, extractedDirs: data.extracted_dirs, totalBytes: data.total_bytes };
}

module.exports = { inspectZip, extractZip };
