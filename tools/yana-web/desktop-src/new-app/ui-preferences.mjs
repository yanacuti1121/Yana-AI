// New-app UI preferences are intentionally separate from runtime security
// policy and provider credentials. They contain presentation-only values and
// can be safely stored in browser localStorage.
export const UI_PREFERENCES_KEY = 'yana.new-app.preferences.v1';
// Manual override restored on top of the automatic default (anh's call,
// 2026-09-03): 'system' (default) follows the OS light/dark setting via
// prefers-color-scheme — same as docs/desktop.html's own actual behavior —
// with no data-theme attribute set at all. 'light'/'dark' set data-theme
// explicitly, which themes.css's :root[data-theme="light"/"dark"] rules
// override the OS setting with (see that file's own comment on the
// :not([data-theme="light"]) guard this depends on). A stored theme id from
// before this option existed (or the brief monochrome-only 'black'/'white'
// era) just isn't in THEMES, so it falls through to DEFAULTS.theme like any
// other unrecognized value — no separate migration needed.
export const THEMES = ['system', 'light', 'dark'];
export const LANGUAGES = ['en', 'vi', 'ko', 'zh'];

const DEFAULTS = Object.freeze({ version: 1, theme: 'system', language: 'en' });

export function normalizeUiPreferences(value) {
  return {
    version: 1,
    theme: THEMES.includes(value?.theme) ? value.theme : DEFAULTS.theme,
    language: LANGUAGES.includes(value?.language) ? value.language : DEFAULTS.language,
  };
}

function defaultStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function readUiPreferences(storage = defaultStorage()) {
  if (!storage) return { ...DEFAULTS };
  try {
    return normalizeUiPreferences(JSON.parse(storage.getItem(UI_PREFERENCES_KEY) || '{}'));
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export function writeUiPreferences(value, storage = defaultStorage()) {
  const normalized = normalizeUiPreferences(value);
  try { storage?.setItem(UI_PREFERENCES_KEY, JSON.stringify(normalized)); } catch (_) {}
  return normalized;
}
