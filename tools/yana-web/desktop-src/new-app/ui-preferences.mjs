// New-app UI preferences are intentionally separate from runtime security
// policy and provider credentials. They contain presentation-only values and
// can be safely stored in browser localStorage.
export const UI_PREFERENCES_KEY = 'yana.new-app.preferences.v1';
// Monochrome only (2026-09-02 redesign) — matches themes.css's own
// rewrite, which removed the previous 14-theme catalog entirely. A
// stored preference from before this change (e.g. 'violet-workspace')
// falls through normalizeUiPreferences's THEMES.includes() check below
// and resets to DEFAULTS.theme, same as any other unrecognized value —
// no separate migration needed.
export const THEMES = ['black', 'white'];
export const LANGUAGES = ['en', 'vi', 'ko', 'zh'];

// Only applies when this separate new-app preference key does not exist,
// OR when a stored value fails the THEMES.includes() check above (e.g. a
// pre-redesign theme id).
const DEFAULTS = Object.freeze({ version: 1, theme: 'black', language: 'en' });

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
