// Attention notifications are intentionally separate from Activity.
//
// Activity is a chronological projection of every runtime/UI event. This
// module listens to the same *raw* canonical transport only for events that
// require a person to notice or act: an approval request, a denied/failed
// command, or a failed chat request. It stores no command output, arguments,
// provider errors, or assistant text — just a short UI status and time.
import React from 'react';

const STORAGE_KEY = 'yana.newapp.notifications';
const MAX_NOTIFICATIONS = 50;
let nextId = 1;

function loadNotifications() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((notice) => (
      notice
      && typeof notice.id === 'number'
      && typeof notice.timestamp === 'number'
      && typeof notice.title === 'string'
      && typeof notice.level === 'string'
      && typeof notice.read === 'boolean'
    )).slice(0, MAX_NOTIFICATIONS);
  } catch {
    return [];
  }
}

function saveNotifications(notifications) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  } catch {
    // Local UI history is optional. The live notification still appears when
    // browser storage is unavailable or full.
  }
}

// Pure event classification, kept independent of DOM/localStorage so it can
// be tested without a browser. `null` means that the event belongs in
// Activity only and must not create a notification.
export function noticeFromCanonicalEvent(event) {
  if (!event || typeof event.kind !== 'string') return null;
  if (event.kind === 'human_approval_required') {
    return { level: 'approval', title: 'Approval required' };
  }
  if (event.kind === 'tool_denied') {
    return { level: 'warning', title: 'Action blocked' };
  }
  // A denied tool has already emitted `tool_denied`; do not show the user a
  // duplicate notification when its completion record follows.
  if (event.kind === 'tool_completed' && event.ok === false && !event.denied) {
    return { level: 'error', title: 'Command failed' };
  }
  return null;
}

export function noticeFromChatError() {
  // The chat error payload can contain backend diagnostics. Do not persist it
  // in a general notification list; detailed, redacted diagnostics stay in
  // the existing chat/runtime surfaces instead.
  return { level: 'error', title: 'Yana request failed' };
}

export function appendNotification(previous, presentation, timestamp = Date.now()) {
  if (!presentation) return previous;
  const notification = {
    id: nextId++,
    timestamp,
    level: presentation.level,
    title: presentation.title,
    read: false,
  };
  return [notification, ...previous].slice(0, MAX_NOTIFICATIONS);
}

export function useNotifications() {
  const [notifications, setNotifications] = React.useState(() => {
    const hydrated = loadNotifications();
    const maxId = hydrated.reduce((highest, notice) => Math.max(highest, notice.id), 0);
    if (maxId >= nextId) nextId = maxId + 1;
    return hydrated;
  });

  const update = React.useCallback((updater) => {
    setNotifications((previous) => {
      const next = updater(previous);
      saveNotifications(next);
      return next;
    });
  }, []);

  React.useEffect(() => {
    function add(presentation) {
      if (!presentation) return;
      update((previous) => appendNotification(previous, presentation));
    }
    function onCanonical(event) {
      add(noticeFromCanonicalEvent(event?.detail));
    }
    function onChatError() {
      add(noticeFromChatError());
    }

    window.addEventListener('yana-activity-canonical', onCanonical);
    window.addEventListener('yana-activity-chat-error', onChatError);
    return () => {
      window.removeEventListener('yana-activity-canonical', onCanonical);
      window.removeEventListener('yana-activity-chat-error', onChatError);
    };
  }, [update]);

  return {
    notifications,
    unread: notifications.filter((notice) => !notice.read).length,
    markAllRead: () => update((previous) => previous.map((notice) => ({ ...notice, read: true }))),
    dismiss: (id) => update((previous) => previous.filter((notice) => notice.id !== id)),
  };
}
