'use strict';
// Tests for the JS-side Giám Thị HALT check (the one chat path — a browser
// deployment with no configured yana-rt binary — that never reaches the
// Rust-side src/os/supervisor.rs::halt_is_active check).
// Run: node _test_giam_thi_halt.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { haltActive, HALT_RELATIVE_PATH } = require('./lib/giam-thi-halt');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}

function tempRepoRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'giam-thi-halt-test-'));
}

// 1. No halt file at all -> not halted.
{
  const root = tempRepoRoot();
  check('no halt file present is not halted', haltActive(root) === false);
}

// 2. Halt file present -> halted.
{
  const root = tempRepoRoot();
  const haltPath = path.join(root, HALT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(haltPath), { recursive: true });
  fs.writeFileSync(haltPath, 'halt');
  check('halt file present is halted', haltActive(root) === true);
}

// 3. Fail-closed: a repo root that does not exist at all (so lstat throws
// ENOTDIR/ENOENT on an intermediate segment rather than a clean ENOENT on
// the halt file itself) must still resolve to "not halted", matching the
// only case the Rust side treats as open: a definite absence, not an
// ambiguous I/O failure that happens to bottom out at ENOENT for the
// child path too.
{
  const root = path.join(tempRepoRoot(), 'does-not-exist');
  check('missing repo root resolves to not-halted (still a clean ENOENT)', haltActive(root) === false);
}

// 4. Fail-closed on a genuine non-ENOENT error: the halt path itself
// exists but as a directory, not a file — lstat succeeds either way (it
// stats the path regardless of type), so this specifically proves the
// check does not require the entry to be a regular file to count as
// halted, matching the Rust side's plain existence check.
{
  const root = tempRepoRoot();
  const haltPath = path.join(root, HALT_RELATIVE_PATH);
  fs.mkdirSync(haltPath, { recursive: true });
  check('halt path present as a directory still counts as halted', haltActive(root) === true);
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('All giam-thi-halt tests passed.');
