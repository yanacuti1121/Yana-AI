'use strict';
// Pure-function tests for read-file.js — no Electron, no real yana-rt binary
// (mirrors _test_git_status_unit.js's shape: inject exec/existsSync).
const assert = require('assert');
const { readFile } = require('./read-file');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}

// missing binary
const missingBin = readFile({
  repoRoot: '/repo',
  yanaRtBin: '/does/not/exist',
  relPath: 'src/main.rs',
  existsSync: () => false,
});
check('missing yana-rt binary reports ok:false', missingBin.ok === false && /not found/.test(missingBin.error));

// missing/empty relPath rejected before ever shelling out
const emptyPath = readFile({
  repoRoot: '/repo',
  yanaRtBin: '/fake/yana-rt',
  relPath: '',
  existsSync: () => true,
  exec: () => { throw new Error('should not be called'); },
});
check('empty relPath rejected without exec', emptyPath.ok === false && /non-empty string/.test(emptyPath.error));

const missingPath = readFile({
  repoRoot: '/repo',
  yanaRtBin: '/fake/yana-rt',
  existsSync: () => true,
  exec: () => { throw new Error('should not be called'); },
});
check('undefined relPath rejected without exec', missingPath.ok === false && /non-empty string/.test(missingPath.error));

// exec throws (capability failure — e.g. path escape or too-large file)
const execFails = readFile({
  repoRoot: '/repo',
  yanaRtBin: '/fake/yana-rt',
  relPath: '../../../../etc/passwd',
  existsSync: () => true,
  exec: () => { const e = new Error('boom'); e.stderr = 'path escapes repository root'; throw e; },
});
check('exec failure surfaces stderr detail', execFails.ok === false && execFails.error === 'path escapes repository root');

// invalid JSON from the binary
const badJson = readFile({
  repoRoot: '/repo',
  yanaRtBin: '/fake/yana-rt',
  relPath: 'a.txt',
  existsSync: () => true,
  exec: () => 'not json',
});
check('invalid JSON reports ok:false', badJson.ok === false && /invalid JSON/.test(badJson.error));

// valid envelope, missing data.content shape
const badEnvelope = readFile({
  repoRoot: '/repo',
  yanaRtBin: '/fake/yana-rt',
  relPath: 'a.txt',
  existsSync: () => true,
  exec: () => JSON.stringify({ capability: 'repo.read', data: {} }),
});
check('missing data.content reports ok:false', badEnvelope.ok === false && /invalid response envelope/.test(badEnvelope.error));

// full success path
const success = readFile({
  repoRoot: '/repo',
  yanaRtBin: '/fake/yana-rt',
  relPath: 'src/main.rs',
  existsSync: () => true,
  exec: () => JSON.stringify({ capability: 'repo.read', data: { path: 'src/main.rs', size_bytes: 11, content: 'hello world' } }),
});
check('success path returns ok:true with parsed fields', success.ok === true && success.content === 'hello world' && success.sizeBytes === 11 && success.path === 'src/main.rs');

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('read-file unit tests passed: 7');
