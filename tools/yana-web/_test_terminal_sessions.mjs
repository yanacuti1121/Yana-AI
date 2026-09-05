import assert from 'node:assert/strict';
import {
  MAX_TERMINALS,
  activateSession,
  addSession,
  closeSession,
  createInitialLayout,
  createSession,
  loadLayout,
  saveLayout,
  updateSession,
} from './desktop-src/new-app/terminal/terminal-sessions.mjs';

// In-memory localStorage stand-in — no browser/Electron environment here.
function memoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
  };
}

// createInitialLayout — single starting session.
{
  const layout = createInitialLayout();
  assert.equal(layout.sessions.length, 1);
  assert.equal(layout.activeKey, layout.sessions[0].key);
  assert.equal(layout.sessions[0].title, 'Terminal 1');
  assert.equal(layout.sessions[0].sessionId, null);
}

// addSession — appends and switches active tab to the new one; respects the cap.
{
  let layout = createInitialLayout();
  layout = addSession(layout);
  assert.equal(layout.sessions.length, 2);
  assert.equal(layout.activeKey, layout.sessions[1].key);
  assert.equal(layout.sessions[1].title, 'Terminal 2');

  let capped = createInitialLayout();
  for (let i = 0; i < MAX_TERMINALS + 5; i++) capped = addSession(capped);
  assert.equal(capped.sessions.length, MAX_TERMINALS);
}

// closeSession — closing the active tab re-selects a sane neighbor; closing
// the last remaining session is a no-op; closing a missing key is a no-op.
{
  let layout = createInitialLayout();
  layout = addSession(layout);
  layout = addSession(layout);
  const [a, b, c] = layout.sessions;
  assert.equal(layout.activeKey, c.key);

  const afterCloseActive = closeSession(layout, c.key);
  assert.equal(afterCloseActive.sessions.length, 2);
  assert.equal(afterCloseActive.activeKey, b.key); // neighbor to the left

  const afterCloseInactive = closeSession(layout, a.key);
  assert.equal(afterCloseInactive.sessions.length, 2);
  assert.equal(afterCloseInactive.activeKey, c.key); // active tab untouched

  const single = createInitialLayout();
  assert.strictEqual(closeSession(single, single.sessions[0].key), single);

  assert.strictEqual(closeSession(layout, 'nonexistent-key'), layout);
}

// activateSession — same referential-equality contract as the layout this
// replaces (new-app/terminal-layout.mjs's activateTerminalSession).
{
  const first = { key: 'terminal-1', title: 'Terminal 1', sessionId: 'pty-1' };
  const second = { key: 'terminal-2', title: 'Terminal 2', sessionId: 'pty-2' };
  const layout = { sessions: [first, second], activeKey: first.key };

  const switched = activateSession(layout, second.key);
  assert.equal(switched.activeKey, second.key);
  assert.strictEqual(switched.sessions, layout.sessions);
  assert.equal(switched.sessions[0].sessionId, 'pty-1');
  assert.equal(switched.sessions[1].sessionId, 'pty-2');

  assert.strictEqual(activateSession(switched, second.key), switched);
  assert.strictEqual(activateSession(layout, 'missing-terminal'), layout);
  assert.strictEqual(activateSession(null, first.key), null);
}

// updateSession — patches only the targeted session.
{
  let layout = createInitialLayout();
  const key = layout.sessions[0].key;
  layout = updateSession(layout, key, { sessionId: 'pty-42', initialCwd: '/repo', shell: 'zsh' });
  assert.equal(layout.sessions[0].sessionId, 'pty-42');
  assert.equal(layout.sessions[0].initialCwd, '/repo');
  assert.equal(layout.sessions[0].shell, 'zsh');
}

// saveLayout / loadLayout — round trip persists only {key, title} per
// session, never sessionId/initialCwd/shell (no pretending a previous
// run's process is still alive after a relaunch).
{
  const storage = memoryStorage();
  let layout = createInitialLayout();
  layout = updateSession(layout, layout.sessions[0].key, { sessionId: 'pty-1', initialCwd: '/repo', shell: 'zsh' });
  layout = addSession(layout);
  saveLayout(layout, storage);

  const reloaded = loadLayout(storage);
  assert.equal(reloaded.sessions.length, 2);
  assert.equal(reloaded.activeKey, layout.activeKey);
  for (const session of reloaded.sessions) {
    assert.equal(session.sessionId, null);
    assert.equal(session.initialCwd, null);
    assert.equal(session.shell, null);
  }
  assert.equal(reloaded.sessions[0].key, layout.sessions[0].key);
  assert.equal(reloaded.sessions[0].title, layout.sessions[0].title);
}

// loadLayout — corrupt/missing storage falls back to a single fresh session.
{
  const emptyStorage = memoryStorage();
  const fromEmpty = loadLayout(emptyStorage);
  assert.equal(fromEmpty.sessions.length, 1);

  const corruptStorage = memoryStorage();
  corruptStorage.setItem('yana.terminal.layout.v1', 'not json');
  const fromCorrupt = loadLayout(corruptStorage);
  assert.equal(fromCorrupt.sessions.length, 1);

  const oversizedStorage = memoryStorage();
  const many = { sessions: Array.from({ length: MAX_TERMINALS + 10 }, (_, i) => ({ key: `k${i}`, title: `T${i}` })), activeKey: 'k0' };
  oversizedStorage.setItem('yana.terminal.layout.v1', JSON.stringify(many));
  const fromOversized = loadLayout(oversizedStorage);
  assert.equal(fromOversized.sessions.length, MAX_TERMINALS);
}

// createSession — sanity on the raw factory used by the layout helpers above.
{
  const session = createSession(3);
  assert.equal(session.title, 'Terminal 3');
  assert.equal(session.sessionId, null);
  assert.match(session.key, /^terminal-/);
}

console.log('Desktop terminal sessions tests passed');
