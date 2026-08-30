// Yana Desktop — bounded, explicitly attached terminal context.
//
// A human PTY is never an AI command channel. This module only keeps a
// bounded, UNTRUSTED snapshot that the user may choose to attach to chat.
// It does not infer shell state from prompt text: live CWD is accepted only
// from OSC 7 shell-integration markers emitted by the user's shell.

const MAX_OUTPUT_CHARS = 4000;
const OSC_7 = /\x1b\]7;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

const sessions = new Map();
const listeners = new Set();
let activeSessionId = null;
let attachedSessionId = null;

function notify() {
  for (const listener of listeners) listener();
}

function snapshotFor(session) {
  if (!session) return null;
  return {
    trust: 'untrusted',
    initialCwd: session.initialCwd,
    currentCwd: session.currentCwd,
    recentOutput: session.recentOutput.slice(-MAX_OUTPUT_CHARS),
    ptyStatus: session.ptyStatus,
    exitCode: session.exitCode,
  };
}

function parseOsc7Cwd(chunk) {
  let currentCwd = null;
  for (const match of chunk.matchAll(OSC_7)) {
    try {
      const url = new URL(match[1]);
      if (url.protocol === 'file:' && url.pathname) {
        currentCwd = decodeURIComponent(url.pathname);
      }
    } catch {
      // Terminal output is untrusted. Invalid OSC data is ignored, never
      // treated as a filesystem path or used to change process state.
    }
  }
  return currentCwd;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordStart(sessionId, startedCwd) {
  if (typeof sessionId !== 'string' || !sessionId) return;
  sessions.set(sessionId, {
    initialCwd: typeof startedCwd === 'string' ? startedCwd : null,
    currentCwd: typeof startedCwd === 'string' ? startedCwd : null,
    recentOutput: '',
    ptyStatus: 'running',
    exitCode: null,
  });
  if (!activeSessionId) activeSessionId = sessionId;
  notify();
}

export function recordData(sessionId, chunk) {
  const session = sessions.get(sessionId);
  if (!session || typeof chunk !== 'string' || !chunk) return;
  session.recentOutput = (session.recentOutput + chunk).slice(-MAX_OUTPUT_CHARS);
  const currentCwd = parseOsc7Cwd(chunk);
  if (currentCwd) session.currentCwd = currentCwd;
  notify();
}

export function recordExit(sessionId, code) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.ptyStatus = 'exited';
  session.exitCode = Number.isInteger(code) ? code : null;
  notify();
}

export function reset(sessionId) {
  if (typeof sessionId === 'string') {
    sessions.delete(sessionId);
    if (activeSessionId === sessionId) activeSessionId = null;
    if (attachedSessionId === sessionId) attachedSessionId = null;
  } else {
    sessions.clear();
    activeSessionId = null;
    attachedSessionId = null;
  }
  notify();
}

export function setActiveSession(sessionId) {
  activeSessionId = sessions.has(sessionId) ? sessionId : null;
  // A context attachment is an explicit choice for one terminal. Switching
  // tabs must never silently carry a different terminal's output into chat.
  if (attachedSessionId !== activeSessionId) attachedSessionId = null;
  notify();
}

export function getActiveSessionSnapshot() {
  return snapshotFor(sessions.get(activeSessionId));
}

export function isAttachmentEnabled() {
  return attachedSessionId !== null && sessions.has(attachedSessionId);
}

export function setAttachmentEnabled(enabled) {
  attachedSessionId = enabled && sessions.has(activeSessionId) ? activeSessionId : null;
  notify();
}

// This is the value sent by use-chat-send. Returning null unless the user
// enabled attachment prevents silent terminal-output disclosure on each turn.
export function getSnapshot() {
  return snapshotFor(sessions.get(attachedSessionId));
}

export const __TEST_ONLY__ = { MAX_OUTPUT_CHARS, parseOsc7Cwd };
