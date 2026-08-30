// Node-runnable unit test for terminal-context.mjs (pure module, no DOM/
// Electron dependency — ".mjs" so Node treats it as ESM regardless of
// this package's own "type": "commonjs", matching the source file's own
// extension choice for the same reason).
import assert from 'node:assert';
import * as ctx from './terminal-context.mjs';

// idle by default — no session ever started
assert.strictEqual(ctx.getSnapshot(), null);

ctx.recordStart('/repo/Yana-AI');
let snap = ctx.getSnapshot();
assert.strictEqual(snap.initialCwd, '/repo/Yana-AI');
assert.strictEqual(snap.ptyStatus, 'running');
assert.strictEqual(snap.exitCode, null);
assert.strictEqual(snap.recentOutput, '');
// Trust boundary is explicit in the data itself, not just documentation —
// every snapshot self-identifies as untrusted.
assert.strictEqual(snap.trust, 'untrusted');

ctx.recordData('hello ');
ctx.recordData('world\n');
assert.strictEqual(ctx.getSnapshot().recentOutput, 'hello world\n');

// Hard cap enforced regardless of how much output arrives — no unbounded
// growth (the one property this module must never regress).
const big = 'x'.repeat(ctx.__TEST_ONLY__.MAX_OUTPUT_CHARS + 500);
ctx.recordData(big);
snap = ctx.getSnapshot();
assert.strictEqual(snap.recentOutput.length, ctx.__TEST_ONLY__.MAX_OUTPUT_CHARS);
assert.ok(snap.recentOutput.endsWith('x'));

ctx.recordExit(1);
snap = ctx.getSnapshot();
assert.strictEqual(snap.ptyStatus, 'exited');
assert.strictEqual(snap.exitCode, 1);

// Non-integer exit code (e.g. a signal-killed process reported as null by
// Electron's 'exit' event) never gets coerced into a fake number.
ctx.recordStart('/repo/Yana-AI');
ctx.recordExit(null);
assert.strictEqual(ctx.getSnapshot().exitCode, null);

ctx.reset();
assert.strictEqual(ctx.getSnapshot(), null);

// recordData ignores non-string/empty input rather than corrupting state
ctx.recordStart('/repo/Yana-AI');
ctx.recordData(null);
ctx.recordData(42);
ctx.recordData('');
assert.strictEqual(ctx.getSnapshot().recentOutput, '');

console.log('terminal-context tests passed: 12');
