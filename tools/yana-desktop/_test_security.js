'use strict';

const assert = require('assert');
const {
  isSafeExternalUrl,
  isTrustedIpcSender,
  isTrustedUrl,
  normalizePtyInput,
  normalizePtyStartOptions,
} = require('./security');

const origin = 'http://127.0.0.1:43123';
assert.strictEqual(isTrustedUrl(`${origin}/chat`, origin), true);
assert.strictEqual(isTrustedUrl('http://127.0.0.1:43124/chat', origin), false);
assert.strictEqual(isTrustedUrl('http://127.0.0.1:43123@evil.example/chat', origin), false);
assert.strictEqual(isTrustedUrl('not-a-url', origin), false);
assert.strictEqual(isSafeExternalUrl('https://example.com/path'), true);
assert.strictEqual(isSafeExternalUrl('mailto:test@example.com'), false);
assert.strictEqual(isSafeExternalUrl('file:///tmp/test'), false);
assert.strictEqual(isTrustedIpcSender({ senderFrame: { url: `${origin}/terminal` } }, origin), true);
assert.strictEqual(isTrustedIpcSender({ senderFrame: { url: 'https://evil.example' } }, origin), false);
assert.deepStrictEqual(normalizePtyStartOptions(), { cols: 80, rows: 24, args: [] });
assert.deepStrictEqual(normalizePtyStartOptions({ cols: 120, rows: 40, args: ['--model', 'local model'] }), {
  cols: 120,
  rows: 40,
  args: ['--model', 'local model'],
});
assert.throws(() => normalizePtyStartOptions({ cols: 0 }), /cols/);
assert.throws(() => normalizePtyStartOptions({ rows: 1000 }), /rows/);
assert.throws(() => normalizePtyStartOptions({ args: 'unsafe' }), /args/);
assert.throws(() => normalizePtyStartOptions({ args: ['bad\0arg'] }), /NUL-free/);
assert.strictEqual(normalizePtyInput('xin chào 🐰'), 'xin chào 🐰');
assert.throws(() => normalizePtyInput(Buffer.from('no')), /string/);
assert.throws(() => normalizePtyInput('bad\0input'), /NUL-free/);

console.log('Desktop security tests passed: 17');
