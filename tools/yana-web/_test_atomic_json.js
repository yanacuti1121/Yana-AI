'use strict';
// Unit tests for crash-safe JSON persistence. Run: node _test_atomic_json.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeJsonAtomic } = require('./lib/atomic-json');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-atomic-json-test-'));
let pass = 0;
let fail = 0;

function test(name, condition) {
  if (condition) {
    pass++;
    console.log('PASS  ' + name);
  } else {
    fail++;
    console.log('FAIL  ' + name);
  }
}

const file = path.join(DATA_DIR, 'state.json');
fs.writeFileSync(file, '{"previous":true}');
writeJsonAtomic(file, { next: true, values: [1, 2, 3] });

test('replaces a complete prior document',
  JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8'))) === JSON.stringify({ next: true, values: [1, 2, 3] }));
test('creates private metadata with mode 0600', (fs.statSync(file).mode & 0o777) === 0o600);
test('leaves no temporary sibling after success',
  fs.readdirSync(DATA_DIR).every((entry) => !entry.endsWith('.tmp')));

let nonSerializableRejected = false;
try {
  const circular = {};
  circular.self = circular;
  writeJsonAtomic(path.join(DATA_DIR, 'circular.json'), circular);
} catch (error) {
  nonSerializableRejected = /circular/i.test(error.message);
}
test('rejects non-serializable data before publishing a file', nonSerializableRejected);
test('leaves no temporary sibling after serialization failure',
  fs.readdirSync(DATA_DIR).every((entry) => !entry.endsWith('.tmp')));

let renameFailureRejected = false;
try {
  writeJsonAtomic(DATA_DIR, { cannot: 'replace a directory' });
} catch (error) {
  renameFailureRejected = error && ['EISDIR', 'EPERM', 'ENOTEMPTY'].includes(error.code);
}
test('cleans its temporary sibling when publication fails', renameFailureRejected &&
  fs.readdirSync(DATA_DIR).every((entry) => !entry.endsWith('.tmp')));

fs.rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`\nResult: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
