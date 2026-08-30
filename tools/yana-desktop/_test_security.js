'use strict';

const assert = require('assert');
const {
  isSafeExternalUrl,
  isTrustedIpcSender,
  isTrustedUrl,
  normalizePtyInput,
  normalizePtyResizeOptions,
  normalizePtySessionId,
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
assert.deepStrictEqual(normalizePtyStartOptions(), { cols: 80, rows: 24, sessionType: 'user-shell' });
assert.deepStrictEqual(normalizePtyStartOptions({ cols: 120, rows: 40, sessionType: 'yana-chat' }), {
  cols: 120,
  rows: 40,
  sessionType: 'yana-chat',
});
assert.throws(() => normalizePtyStartOptions({ cols: 0 }), /cols/);
assert.throws(() => normalizePtyStartOptions({ rows: 1000 }), /rows/);
// The renderer cannot smuggle an arbitrary program/argv through this
// option object — only the closed sessionType enum is accepted.
assert.throws(() => normalizePtyStartOptions({ sessionType: 'bash' }), /sessionType/);
assert.throws(() => normalizePtyStartOptions({ sessionType: '/bin/sh' }), /sessionType/);
// Extra fields (e.g. a renderer trying to smuggle a program/argv) are
// silently ignored, never surfaced in the normalized result.
assert.deepStrictEqual(normalizePtyStartOptions({ program: '/bin/sh', args: ['-c', 'evil'] }), {
  cols: 80,
  rows: 24,
  sessionType: 'user-shell',
});
assert.strictEqual(normalizePtyInput('xin chào 🐰'), 'xin chào 🐰');
assert.throws(() => normalizePtyInput(Buffer.from('no')), /string/);
assert.throws(() => normalizePtyInput('bad\0input'), /NUL-free/);

assert.deepStrictEqual(normalizePtyResizeOptions(), { cols: 80, rows: 24 });
assert.deepStrictEqual(normalizePtyResizeOptions({ cols: 200, rows: 60 }), { cols: 200, rows: 60 });
assert.throws(() => normalizePtyResizeOptions({ cols: 19 }), /cols/);
assert.throws(() => normalizePtyResizeOptions({ rows: 301 }), /rows/);

const sessionId = '34cbebd7-24b6-4e82-9c1b-b765ea13a98d';
assert.strictEqual(normalizePtySessionId(sessionId), sessionId);
assert.throws(() => normalizePtySessionId('renderer-chosen-command'), /session id/);
assert.throws(() => normalizePtySessionId(null), /session id/);

console.log('Desktop security tests passed: 23');
