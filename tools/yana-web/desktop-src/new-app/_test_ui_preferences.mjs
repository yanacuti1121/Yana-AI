import assert from 'node:assert/strict';
import { UI_PREFERENCES_KEY, normalizeUiPreferences, readUiPreferences, writeUiPreferences } from './ui-preferences.mjs';

const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };

assert.deepEqual(normalizeUiPreferences(null), { version: 1, theme: 'black', language: 'en' });
assert.deepEqual(normalizeUiPreferences({ theme: 'white', language: 'vi' }), { version: 1, theme: 'white', language: 'vi' });
assert.deepEqual(normalizeUiPreferences({ theme: 'unknown', language: 'xx' }), { version: 1, theme: 'black', language: 'en' });
// Monochrome-only redesign (2026-09-02): a pre-redesign theme id (any of
// the previous 14) is now an unrecognized value, same as 'unknown' above
// — it falls through to DEFAULTS.theme rather than crashing or silently
// storing a theme with no matching CSS.
assert.deepEqual(normalizeUiPreferences({ theme: 'violet-workspace', language: 'en' }), { version: 1, theme: 'black', language: 'en' });
assert.deepEqual(normalizeUiPreferences({ theme: 'ios-night', language: 'en' }), { version: 1, theme: 'black', language: 'en' });
assert.deepEqual(normalizeUiPreferences({ theme: 'black', language: 'en' }), { version: 1, theme: 'black', language: 'en' });
assert.deepEqual(readUiPreferences(storage), { version: 1, theme: 'black', language: 'en' });
assert.deepEqual(writeUiPreferences({ theme: 'white', language: 'ko' }, storage), { version: 1, theme: 'white', language: 'ko' });
assert.deepEqual(JSON.parse(values.get(UI_PREFERENCES_KEY)), { version: 1, theme: 'white', language: 'ko' });
values.set(UI_PREFERENCES_KEY, '{broken');
assert.deepEqual(readUiPreferences(storage), { version: 1, theme: 'black', language: 'en' });
console.log('ui-preferences tests passed: 11');
