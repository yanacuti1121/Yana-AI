'use strict';

const assert = require('assert');
const { isAllowedPtyArgs } = require('./pty-args');

// The legitimate caller (terminal.jsx) always sends an empty array, or
// omits the field entirely.
assert.strictEqual(isAllowedPtyArgs(undefined), true);
assert.strictEqual(isAllowedPtyArgs([]), true);

// The actual attack this guards against: a compromised renderer trying to
// inject argv into the spawned `yana-rt chat` process.
assert.strictEqual(isAllowedPtyArgs(['--no-sandbox']), false);
assert.strictEqual(isAllowedPtyArgs(['--dangerously-skip-permissions']), false);
assert.strictEqual(isAllowedPtyArgs(['anything']), false);

// Non-array shapes must not slip through as "no extra argv".
assert.strictEqual(isAllowedPtyArgs('--no-sandbox'), false);
assert.strictEqual(isAllowedPtyArgs({ 0: '--no-sandbox' }), false);
assert.strictEqual(isAllowedPtyArgs(null), false);

console.log('pty-args: all assertions passed');
