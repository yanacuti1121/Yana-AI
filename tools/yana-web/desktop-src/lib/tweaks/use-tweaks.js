// Yana AI — useTweaks: single source of truth for tweak values, persisted
// to localStorage so appearance settings survive reloads.
import React from 'react';

const TWEAKS_STORE = 'yana.tweaks';

export function useTweaks(defaults) {
  const [values, setValues] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TWEAKS_STORE));
      // merge over defaults so new tweak keys added in code get their default
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        return { ...defaults, ...saved };
      }
    } catch (_) {}
    return defaults;
  });
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => {
      const next = { ...prev, ...edits };
      try { localStorage.setItem(TWEAKS_STORE, JSON.stringify(next)); } catch (_) {}
      return next;
    });
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
  }, []);
  return [values, setTweak];
}
