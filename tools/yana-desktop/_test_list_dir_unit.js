'use strict';

const assert = require('assert');
const { listDir } = require('./list-dir');

const base = { repoRoot: '/repo', yanaRtBin: '/bin/yana-rt', relPath: '.', existsSync: () => true };
const valid = listDir({
  ...base,
  exec: (_binary, argv) => {
    assert.deepStrictEqual(argv, ['capability', 'tree', '--root', '/repo', '--path', '.', '--depth', '0']);
    return JSON.stringify({ data: { entries: [
      { path: 'z.txt', kind: 'file' },
      { path: 'src', kind: 'directory' },
    ] } });
  },
});
assert.deepStrictEqual(valid, {
  ok: true,
  entries: [
    { name: 'src', isDir: true, relPath: 'src' },
    { name: 'z.txt', isDir: false, relPath: 'z.txt' },
  ],
});

const invalidJson = listDir({ ...base, exec: () => '{' });
assert.strictEqual(invalidJson.ok, false);
assert.match(invalidJson.error, /invalid JSON/);

const invalidEnvelope = listDir({ ...base, exec: () => JSON.stringify({ data: {} }) });
assert.deepStrictEqual(invalidEnvelope, {
  ok: false,
  error: 'capability tree returned an invalid response envelope',
});

const windowsPaths = listDir({
  ...base,
  exec: () => JSON.stringify({ data: { entries: [
    { path: 'src\\main.rs', kind: 'file' },
  ] } }),
});
assert.deepStrictEqual(windowsPaths, {
  ok: true,
  entries: [
    { name: 'main.rs', isDir: false, relPath: 'src/main.rs' },
  ],
});

console.log('list-dir unit tests passed: 4');
