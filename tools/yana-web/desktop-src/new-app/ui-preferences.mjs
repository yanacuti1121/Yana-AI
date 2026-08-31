// New-app UI preferences are intentionally separate from runtime security
// policy and provider credentials. They contain presentation-only values and
// can be safely stored in browser localStorage.
export const UI_PREFERENCES_KEY = 'yana.new-app.preferences.v1';
// Full catalog — matches desktop-src/app.jsx's THEME_MAP and
// appearance-card.jsx's THEME_PREVIEWS. Every id here has a real
// [data-theme="..."] block in themes.css (loaded globally by main.jsx),
// so this list only needs to stay in sync with THEME_MAP, not add CSS.
export const THEMES = [
  'violet-workspace', 'navy', 'ocean', 'obsidian', 'jade',
  'dawn', 'mist', 'silver', 'sage', 'amber', 'arctic', 'lavender',
  'ios-rose', 'ios-night', 'liquid', 'black',
];
export const LANGUAGES = ['en', 'vi', 'ko', 'zh'];

// Only applies when this separate new-app preference key does not exist.
// Stored choices remain untouched, including the previous `navy` default.
const DEFAULTS = Object.freeze({ version: 1, theme: 'violet-workspace', language: 'en' });

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
