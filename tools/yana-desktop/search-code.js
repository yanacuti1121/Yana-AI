'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');

// Thin adapter for the canonical Rust `repo::search_code` capability. It uses
// argv rather than a shell string and never scans outside `repoRoot`; all
// matching, generated-directory skips, and output bounds live in yana-rt.
function searchCode({ repoRoot, yanaRtBin, query, exec = execFileSync, existsSync = fs.existsSync }) {
  if (!existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }
  if (typeof query !== 'string' || !query.trim()) {
    return { ok: false, error: 'query must be a non-empty string' };
  }
  if (query.length > 512 || query.includes('\0')) {
    return { ok: false, error: 'query must be a NUL-free string up to 512 characters' };
  }

  let stdout;
  try {
    stdout = exec(yanaRtBin, [
      'capability', 'search-code',
      '--root', repoRoot,
      '--path', '.',
      '--query', query,
    ], { encoding: 'utf8' });
  } catch (error) {
    const detail = (error.stderr || error.message || '').toString().trim();
    return { ok: false, error: detail || 'capability search-code failed' };
  }

  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch (error) {
    return { ok: false, error: `capability search-code returned invalid JSON: ${error.message}` };
  }

  const matches = envelope?.data?.matches;
  if (!Array.isArray(matches) || matches.some((match) => (
    !match || typeof match.path !== 'string' || !Number.isInteger(match.line) || match.line < 1 || typeof match.text !== 'string'
  ))) {
    return { ok: false, error: 'capability search-code returned an invalid response envelope' };
  }
  return { ok: true, matches, truncated: envelope.truncated === true };
}

module.exports = { searchCode };
