import assert from 'node:assert/strict';
import { UI_PREFERENCES_KEY, normalizeUiPreferences, readUiPreferences, writeUiPreferences } from './ui-preferences.mjs';

const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };

assert.deepEqual(normalizeUiPreferences(null), { version: 1, theme: 'navy', language: 'en' });
assert.deepEqual(normalizeUiPreferences({ theme: 'ocean', language: 'vi' }), { version: 1, theme: 'ocean', language: 'vi' });
assert.deepEqual(normalizeUiPreferences({ theme: 'unknown', language: 'xx' }), { version: 1, theme: 'navy', language: 'en' });
// Full theme catalog restored (anh asked for iOS Night/iOS Rose/Prism Glass
// back, previously silently reset to 'navy' by normalizeUiPreferences since
// THEMES only listed 4 of the 14 ids themes.css actually styles).
assert.deepEqual(normalizeUiPreferences({ theme: 'ios-night', language: 'en' }), { version: 1, theme: 'ios-night', language: 'en' });
assert.deepEqual(normalizeUiPreferences({ theme: 'ios-rose', language: 'en' }), { version: 1, theme: 'ios-rose', language: 'en' });
assert.deepEqual(normalizeUiPreferences({ theme: 'liquid', language: 'en' }), { version: 1, theme: 'liquid', language: 'en' });
// True Black — anh specifically asked for a genuine black theme (all 14
// pre-existing themes are tinted darks, not neutral black).
assert.deepEqual(normalizeUiPreferences({ theme: 'black', language: 'en' }), { version: 1, theme: 'black', language: 'en' });
assert.deepEqual(readUiPreferences(storage), { version: 1, theme: 'navy', language: 'en' });
assert.deepEqual(writeUiPreferences({ theme: 'obsidian', language: 'ko' }, storage), { version: 1, theme: 'obsidian', language: 'ko' });
assert.deepEqual(JSON.parse(values.get(UI_PREFERENCES_KEY)), { version: 1, theme: 'obsidian', language: 'ko' });
values.set(UI_PREFERENCES_KEY, '{broken');
assert.deepEqual(readUiPreferences(storage), { version: 1, theme: 'navy', language: 'en' });
console.log('ui-preferences tests passed: 11');
