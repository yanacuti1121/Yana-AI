'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { listDir } = require('./list-dir');

// Locates a real compiled yana-rt binary — same dev-mode search
// `runtime-paths.js` uses (target/{debug,release}/yana-rt under the repo
// root two levels up from tools/yana-desktop/). This test runs the real
// binary against a real temp repo, proving the actual Gate L5 sandbox and
// directory listing, not a stubbed response.
function findYanaRtBin() {
  const repoRoot = path.join(__dirname, '..', '..');
  for (const profile of ['debug', 'release']) {
    const candidate = path.join(repoRoot, 'target', profile, 'yana-rt');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const yanaRtBin = findYanaRtBin();
if (!yanaRtBin) {
  console.log('SKIP: no compiled yana-rt binary found (run `cargo build --features cli` first)');
  process.exit(0);
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-list-dir-'));
fs.mkdirSync(path.join(repo, 'src'));
fs.writeFileSync(path.join(repo, 'src', 'main.rs'), 'fn main() {}');
fs.writeFileSync(path.join(repo, 'README.md'), '# hi');
fs.mkdirSync(path.join(repo, '.git')); // must be filtered out, same as before

const root = listDir({ repoRoot: repo, yanaRtBin, relPath: '' });
assert.strictEqual(root.ok, true, JSON.stringify(root));
assert.deepStrictEqual(
  root.entries.map((e) => [e.name, e.isDir]),
  [['src', true], ['README.md', false]], // directories first, then alpha — matches the old native sort
);
assert.strictEqual(root.entries[0].relPath, 'src');
assert.ok(!root.entries.some((e) => e.name === '.git'), '.git must be filtered out');

const nested = listDir({ repoRoot: repo, yanaRtBin, relPath: 'src' });
assert.strictEqual(nested.ok, true, JSON.stringify(nested));
assert.strictEqual(nested.entries.length, 1);
assert.strictEqual(nested.entries[0].name, 'main.rs');
assert.strictEqual(nested.entries[0].isDir, false);
assert.strictEqual(nested.entries[0].relPath, 'src/main.rs');

const escape = listDir({ repoRoot: repo, yanaRtBin, relPath: '../../../../../../etc' });
assert.strictEqual(escape.ok, false, 'path escape must be rejected, not silently resolved');

const missingBinary = listDir({ repoRoot: repo, yanaRtBin: path.join(repo, 'no-such-binary'), relPath: '' });
assert.strictEqual(missingBinary.ok, false);
assert.ok(missingBinary.error.includes('not found'));

fs.rmSync(repo, { recursive: true, force: true });
console.log('list-dir tests passed: 8');
