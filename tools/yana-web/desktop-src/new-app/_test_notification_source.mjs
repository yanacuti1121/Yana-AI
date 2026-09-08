import assert from 'node:assert/strict';
import {
  appendNotification,
  noticeFromCanonicalEvent,
  noticeFromChatError,
} from './notification-source.mjs';

assert.deepEqual(
  noticeFromCanonicalEvent({ kind: 'human_approval_required', reason: 'untrusted detail' }),
  { level: 'approval', title: 'Approval required' },
);
assert.deepEqual(
  noticeFromCanonicalEvent({ kind: 'tool_denied', reason: 'untrusted detail' }),
  { level: 'warning', title: 'Action blocked' },
);
assert.deepEqual(
  noticeFromCanonicalEvent({ kind: 'tool_completed', ok: false, denied: false }),
  { level: 'error', title: 'Command failed' },
);
assert.equal(noticeFromCanonicalEvent({ kind: 'tool_completed', ok: false, denied: true }), null);
assert.equal(noticeFromCanonicalEvent({ kind: 'tool_completed', ok: true, denied: false }), null);
assert.equal(noticeFromCanonicalEvent({ kind: 'turn_completed' }), null);
assert.deepEqual(noticeFromChatError(), { level: 'error', title: 'Yana request failed' });

const history = appendNotification([], { level: 'error', title: 'Command failed' }, 42);
assert.equal(history.length, 1);
assert.equal(history[0].timestamp, 42);
assert.equal(history[0].read, false);
assert.deepEqual(Object.keys(history[0]).sort(), ['id', 'level', 'read', 'timestamp', 'title']);

console.log('notification-source tests passed: 9');
