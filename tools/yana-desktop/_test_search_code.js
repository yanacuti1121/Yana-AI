'use strict';

const assert = require('assert');
const { searchCode } = require('./search-code');

const base = { repoRoot: '/repo', yanaRtBin: '/bin/yana-rt', existsSync: () => true };

const valid = searchCode({
  ...base,
  query: 'TODO',
  exec: (_binary, argv) => {
    assert.deepStrictEqual(argv, [
      'capability', 'search-code', '--root', '/repo', '--path', '.', '--query', 'TODO',
    ]);
    return JSON.stringify({ data: { matches: [
      { path: 'src/main.rs', line: 12, text: '// TODO: wire this' },
    ] } });
  },
});
assert.deepStrictEqual(valid, {
  ok: true,
  matches: [{ path: 'src/main.rs', line: 12, text: '// TODO: wire this' }],
  truncated: false,
});

const truncated = searchCode({
  ...base,
  query: 'needle',
  exec: () => JSON.stringify({ data: { matches: [] }, truncated: true }),
});
assert.deepStrictEqual(truncated, { ok: true, matches: [], truncated: true });

assert.deepStrictEqual(searchCode({ ...base, query: '   ' }), {
  ok: false,
  error: 'query must be a non-empty string',
});
assert.deepStrictEqual(searchCode({ ...base, query: 'a\0b' }), {
  ok: false,
  error: 'query must be a NUL-free string up to 512 characters',
});

const invalidEnvelope = searchCode({
  ...base,
  query: 'todo',
  exec: () => JSON.stringify({ data: { matches: [{ path: 'src/main.rs', line: 0, text: 'bad' }] } }),
});
assert.deepStrictEqual(invalidEnvelope, {
  ok: false,
  error: 'capability search-code returned an invalid response envelope',
});

const failed = searchCode({
  ...base,
  query: 'todo',
  exec: () => { const error = new Error('child failed'); error.stderr = 'query must not be empty'; throw error; },
});
assert.deepStrictEqual(failed, { ok: false, error: 'query must not be empty' });

console.log('search-code unit tests passed: 6');
