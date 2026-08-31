import assert from 'node:assert/strict';
import { activateTerminalSession } from './desktop-src/new-app/terminal-layout.mjs';

const first = { key: 'terminal-1', title: 'Terminal 1', sessionId: 'pty-1' };
const second = { key: 'terminal-2', title: 'Terminal 2', sessionId: 'pty-2' };
const layout = { sessions: [first, second], activeKey: first.key };

const switched = activateTerminalSession(layout, second.key);
assert.equal(switched.activeKey, second.key);
assert.strictEqual(switched.sessions, layout.sessions);
assert.equal(switched.sessions[0].sessionId, 'pty-1');
assert.equal(switched.sessions[1].sessionId, 'pty-2');

assert.strictEqual(activateTerminalSession(switched, second.key), switched);
assert.strictEqual(activateTerminalSession(layout, 'missing-terminal'), layout);
assert.strictEqual(activateTerminalSession(null, first.key), null);

console.log('Desktop terminal layout tests passed: 8');
