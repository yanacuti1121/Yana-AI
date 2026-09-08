// Yana Desktop — Terminal dock session/layout state.
//
// Pure, DOM-free functions for the terminal tab bar's state: which
// sessions exist, which one is active, and what survives a relaunch.
// Consolidates what used to be ad hoc closures inline in
// new-app/terminal-dock.jsx plus new-app/terminal-layout.mjs's
// activateTerminalSession into one testable module (2026-09-05 terminal
// rewrite — see the plan this shipped under for the full context).

const LAYOUT_KEY = 'yana.terminal.layout.v1';
export const MAX_TERMINALS = 8;

function terminalKey() {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSession(number) {
  return { key: terminalKey(), title: `Terminal ${number}`, sessionId: null, initialCwd: null, shell: null };
}

export function createInitialLayout() {
  const first = createSession(1);
  return { sessions: [first], activeKey: first.key };
}

// Same shape and same localStorage key as the layout this replaces, so an
// existing user's saved tabs (title + key only — never process state)
// keep restoring across this rewrite.
export function loadLayout(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(LAYOUT_KEY) || '{}');
    const sessions = Array.isArray(saved.sessions)
      ? saved.sessions.slice(0, MAX_TERMINALS).map((item, index) => ({
        ...createSession(index + 1),
        key: typeof item?.key === 'string' ? item.key : terminalKey(),
        title: typeof item?.title === 'string' && item.title.trim() ? item.title.slice(0, 80) : `Terminal ${index + 1}`,
      }))
      : [];
    const restored = sessions.length ? sessions : [createSession(1)];
    return {
      sessions: restored,
      activeKey: restored.some((item) => item.key === saved.activeKey) ? saved.activeKey : restored[0].key,
    };
  } catch {
    return createInitialLayout();
  }
}

export function saveLayout(layout, storage = globalThis.localStorage) {
  storage?.setItem(LAYOUT_KEY, JSON.stringify({
    version: 1,
    activeKey: layout.activeKey,
    // Runtime session IDs, process state, and terminal output are
    // intentionally excluded. A relaunch restores layout only; it never
    // pretends processes from the previous app run are still alive.
    sessions: layout.sessions.map(({ key, title }) => ({ key, title })),
  }));
}

export function addSession(layout) {
  if (layout.sessions.length >= MAX_TERMINALS) return layout;
  const next = createSession(layout.sessions.length + 1);
  return { sessions: [...layout.sessions, next], activeKey: next.key };
}

export function closeSession(layout, key) {
  if (layout.sessions.length <= 1) return layout;
  const index = layout.sessions.findIndex((item) => item.key === key);
  if (index === -1) return layout;
  const next = layout.sessions.filter((item) => item.key !== key);
  const nextActiveKey = key === layout.activeKey
    ? (next[Math.max(0, index - 1)] || next[0]).key
    : layout.activeKey;
  return { sessions: next, activeKey: nextActiveKey };
}

export function activateSession(layout, key) {
  if (!layout || !Array.isArray(layout.sessions) || !layout.sessions.some((item) => item.key === key)) {
    return layout;
  }
  if (layout.activeKey === key) return layout;
  return { ...layout, activeKey: key };
}

export function updateSession(layout, key, patch) {
  return {
    ...layout,
    sessions: layout.sessions.map((item) => (item.key === key ? { ...item, ...patch } : item)),
  };
}

export const __TEST_ONLY__ = { LAYOUT_KEY, terminalKey };
