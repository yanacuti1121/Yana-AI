// Activity feed — source-of-truth abstraction.
//
// The shape every ActivityEvent has:
//
//   { id, timestamp, label, kind, source }
//
//   kind:   'ephemeral-ui'  — a live, in-browser-only projection with no
//                             durable backing record (terminal session
//                             start/exit — a PTY lifecycle fact this app
//                             observes locally, not something yana-rt
//                             emits a canonical record for).
//           'canonical'     — a PROJECTION of a real Yana RuntimeEvent
//                             (STEP 3: tool_requested/approved/denied/
//                             started/completed, turn_completed — see
//                             src/chat/headless.rs's write_event() for
//                             the authoritative source and its own
//                             redaction/classification rules). This file
//                             does not invent a second event model: every
//                             canonical row here traces directly to one
//                             `{runtimeEvent}` SSE frame server.js
//                             relayed from yana-rt, unmodified except for
//                             the human-readable label computed below.
//
// ActivityPanel only ever renders ActivityEvent[] from useActivityFeed()
// — it has no idea CustomEvent exists, and no idea whether a row's source
// was ephemeral or canonical beyond the `kind` field itself.
import React from 'react';

// Roadmap Phase 3 item 12 — Activity History. Persisted the same way
// sidebar/context/dock widths already are (use-resizable.js's
// storageKey pattern) — a per-browser-profile UI cache, not a second
// "Yana memory" system (rule #4 in the Desktop handoff): this stores
// what already displayed in the live feed, not agent facts/decisions,
// and nothing here is read back by any runtime/authority code. Labels
// are already redacted upstream (src/chat/headless.rs's
// redact_secret_like/summarize_tool_call) before they ever reach this
// module, so persisting them to localStorage carries no secret-like
// content beyond what was already shown on screen live.
const HISTORY_KEY = 'yana.newapp.activityHistory';
const MAX_EVENTS = 200;
let nextId = 1;

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && typeof e.id === 'number' && typeof e.timestamp === 'number');
  } catch {
    return [];
  }
}

function saveHistory(events) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
  } catch {
    // Storage unavailable (private mode, quota, disabled) — history just
    // doesn't persist this session. The live feed still works from
    // in-memory state either way.
  }
}

// Generic, STEP-3-minimal labels per the approved plan ("Activity UI —
// minimal STEP 3 integration" examples) — richer per-command detail
// (e.g. "Running: cargo test") is available on the raw event's own
// `summary` field for STEP 8's chat progress cards to use later; this
// panel intentionally stays generic for now rather than growing its own
// second formatting scheme ahead of the real Activity page (STEP 4).
const KIND_LABELS = {
  tool_requested: 'Requested command execution',
  tool_approved: 'Command approved',
  tool_denied: 'Operation blocked',
  human_approval_required: 'Approval required',
  turn_completed: 'Turn completed',
};

// Exported for _test_activity_source.mjs — the one piece of this module
// that's a pure function testable without a DOM (React/window aren't
// needed here; this codebase has no jsdom-style harness for the rest).
export function canonicalLabel(ev) {
  if (ev.kind === 'tool_started') return 'Running command';
  if (ev.kind === 'tool_completed') return ev.denied ? 'Command blocked' : ev.ok ? 'Command completed' : 'Command failed';
  return KIND_LABELS[ev.kind] || ev.kind;
}

export function useActivityFeed() {
  const [events, setEvents] = React.useState(() => {
    const hydrated = loadHistory();
    // Keep the in-memory id counter ahead of anything reloaded from disk
    // so new events never collide with a persisted id.
    const maxId = hydrated.reduce((m, e) => Math.max(m, e.id), 0);
    if (maxId >= nextId) nextId = maxId + 1;
    return hydrated;
  });

  const push = React.useCallback((label, source, kind) => {
    setEvents((prev) => {
      const next = [{ id: nextId++, timestamp: Date.now(), label, kind, source }, ...prev].slice(0, MAX_EVENTS);
      saveHistory(next);
      return next;
    });
  }, []);

  React.useEffect(() => {
    // `source: null` for these — the label is already fully
    // self-describing ("Terminal session started" already says it's
    // terminal), so restating the source below it would just repeat the
    // same word for no new information. Canonical events below DO keep a
    // real source (the actual tool name), since that genuinely adds
    // information the generic label doesn't carry.
    function onTerminalStarted() { push('Terminal session started', null, 'ephemeral-ui'); }
    function onTerminalExited(e) {
      const code = e?.detail?.code;
      push(code === 0 ? 'Terminal session ended' : `Terminal session ended (exit ${code})`, null, 'ephemeral-ui');
    }
    function onChatCompleted() { push('Yana replied', null, 'ephemeral-ui'); }
    function onChatError(e) { push(`Chat error: ${e?.detail?.message || 'unknown'}`, null, 'ephemeral-ui'); }
    function onCanonical(e) {
      const ev = e?.detail;
      if (!ev || typeof ev.kind !== 'string') return;
      push(canonicalLabel(ev), ev.tool || 'runtime', 'canonical');
    }

    window.addEventListener('yana-activity-terminal-started', onTerminalStarted);
    window.addEventListener('yana-activity-terminal-exited', onTerminalExited);
    window.addEventListener('yana-activity-chat-completed', onChatCompleted);
    window.addEventListener('yana-activity-chat-error', onChatError);
    window.addEventListener('yana-activity-canonical', onCanonical);
    return () => {
      window.removeEventListener('yana-activity-terminal-started', onTerminalStarted);
      window.removeEventListener('yana-activity-terminal-exited', onTerminalExited);
      window.removeEventListener('yana-activity-chat-completed', onChatCompleted);
      window.removeEventListener('yana-activity-chat-error', onChatError);
      window.removeEventListener('yana-activity-canonical', onCanonical);
    };
  }, [push]);

  return events;
}

// Small helpers so producers (terminal-dock.jsx, chat-workspace.jsx) don't
// each hand-roll their own CustomEvent construction/name strings.
export function emitTerminalStarted() {
  window.dispatchEvent(new CustomEvent('yana-activity-terminal-started'));
}
export function emitTerminalExited(code) {
  window.dispatchEvent(new CustomEvent('yana-activity-terminal-exited', { detail: { code } }));
}
export function emitChatCompleted() {
  window.dispatchEvent(new CustomEvent('yana-activity-chat-completed'));
}
export function emitChatError(message) {
  window.dispatchEvent(new CustomEvent('yana-activity-chat-error', { detail: { message } }));
}
// `event` is one raw `{runtimeEvent}` payload server.js relayed — passed
// through as-is (`detail: event`), not reshaped, so this module's own
// canonicalLabel() (the ONE place that turns it into UI text) stays the
// single source of truth for that translation.
export function emitCanonicalRuntimeEvent(event) {
  window.dispatchEvent(new CustomEvent('yana-activity-canonical', { detail: event }));
}
