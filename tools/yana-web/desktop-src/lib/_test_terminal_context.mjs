// Node-runnable unit test for terminal-context.mjs (pure module, no DOM/
// Electron dependency — ".mjs" so Node treats it as ESM regardless of
// this package's own "type": "commonjs", matching the source file's own
// extension choice for the same reason).
import assert from 'node:assert';
import * as ctx from './terminal-context.mjs';

assert.strictEqual(ctx.getSnapshot(), null);
assert.strictEqual(ctx.getActiveSessionSnapshot(), null);

ctx.recordStart('session-a', '/repo/Yana-AI');
let snap = ctx.getActiveSessionSnapshot();
assert.strictEqual(snap.initialCwd, '/repo/Yana-AI');
assert.strictEqual(snap.currentCwd, '/repo/Yana-AI');
assert.strictEqual(snap.ptyStatus, 'running');
assert.strictEqual(snap.exitCode, null);
assert.strictEqual(snap.recentOutput, '');
assert.strictEqual(snap.trust, 'untrusted');

ctx.recordData('session-a', 'hello world\n');
assert.strictEqual(ctx.getActiveSessionSnapshot().recentOutput, 'hello world\n');

ctx.recordData('session-a', '\x1b]7;file://localhost/repo/Yana-AI/subdir\x07');
assert.strictEqual(ctx.getActiveSessionSnapshot().currentCwd, '/repo/Yana-AI/subdir');
assert.strictEqual(ctx.__TEST_ONLY__.parseOsc7Cwd('not an OSC marker'), null);
assert.strictEqual(ctx.__TEST_ONLY__.parseOsc7Cwd('\x1b]7;not-a-url\x07'), null);

// A second session keeps isolated output and becomes attachable only when it
// is the user's active terminal selection.
ctx.recordStart('session-b', '/repo/other');
ctx.recordData('session-b', 'other output');
assert.strictEqual(ctx.getActiveSessionSnapshot().initialCwd, '/repo/Yana-AI');
ctx.setActiveSession('session-b');
assert.strictEqual(ctx.getActiveSessionSnapshot().recentOutput, 'other output');
assert.strictEqual(ctx.getSnapshot(), null);
ctx.setAttachmentEnabled(true);
assert.strictEqual(ctx.isAttachmentEnabled(), true);
assert.strictEqual(ctx.getSnapshot().initialCwd, '/repo/other');

const big = 'x'.repeat(ctx.__TEST_ONLY__.MAX_OUTPUT_CHARS + 500);
ctx.recordData('session-b', big);
snap = ctx.getSnapshot();
assert.strictEqual(snap.recentOutput.length, ctx.__TEST_ONLY__.MAX_OUTPUT_CHARS);
assert.ok(snap.recentOutput.endsWith('x'));

ctx.recordExit('session-b', 1);
assert.strictEqual(ctx.getSnapshot().exitCode, 1);
ctx.reset('session-b');
assert.strictEqual(ctx.isAttachmentEnabled(), false);
assert.strictEqual(ctx.getSnapshot(), null);
ctx.reset();
assert.strictEqual(ctx.getActiveSessionSnapshot(), null);

console.log('terminal-context tests passed: 18');
