// Pure-function test for activity-source.mjs's canonical -> label
// translation (STEP 3). ".mjs" so plain `node` treats it as ESM, matching
// terminal-context.mjs's own test convention — the rest of this module
// (React hooks, window.dispatchEvent) needs a DOM this project has no
// jsdom-style harness for, so it isn't covered by an automated test here;
// see the STEP 3 report for how that part was verified by inspection.
import assert from 'node:assert';
import { canonicalLabel } from './activity-source.mjs';

assert.strictEqual(canonicalLabel({ kind: 'tool_requested' }), 'Requested command execution');
assert.strictEqual(canonicalLabel({ kind: 'tool_approved' }), 'Command approved');
assert.strictEqual(canonicalLabel({ kind: 'tool_denied' }), 'Operation blocked');
assert.strictEqual(canonicalLabel({ kind: 'human_approval_required' }), 'Approval required');
assert.strictEqual(canonicalLabel({ kind: 'turn_completed' }), 'Turn completed');
assert.strictEqual(canonicalLabel({ kind: 'tool_started' }), 'Running command');
assert.strictEqual(canonicalLabel({ kind: 'tool_completed', ok: true, denied: false }), 'Command completed');
assert.strictEqual(canonicalLabel({ kind: 'tool_completed', ok: false, denied: false }), 'Command failed');
assert.strictEqual(canonicalLabel({ kind: 'tool_completed', ok: false, denied: true }), 'Command blocked');
// Unknown kind never throws — falls back to the raw kind string rather
// than crashing the Activity panel on a future event type it doesn't
// know about yet.
assert.strictEqual(canonicalLabel({ kind: 'some_future_kind' }), 'some_future_kind');

console.log('activity-source canonicalLabel tests passed: 10');
