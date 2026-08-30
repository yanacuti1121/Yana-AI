// New-app UI preferences are intentionally separate from runtime security
// policy and provider credentials. They contain presentation-only values and
// can be safely stored in browser localStorage.
export const UI_PREFERENCES_KEY = 'yana.new-app.preferences.v1';
export const THEMES = ['navy', 'ocean', 'obsidian', 'jade'];
export const LANGUAGES = ['en', 'vi', 'ko', 'zh'];

const DEFAULTS = Object.freeze({ version: 1, theme: 'navy', language: 'en' });

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
