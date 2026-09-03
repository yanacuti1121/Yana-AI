import assert from 'node:assert/strict';
import { UI_PREFERENCES_KEY, normalizeUiPreferences, readUiPreferences, writeUiPreferences } from './ui-preferences.mjs';

const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };

assert.deepEqual(normalizeUiPreferences(null), { version: 1, theme: 'system', language: 'en' });
assert.deepEqual(normalizeUiPreferences({ theme: 'dark', language: 'vi' }), { version: 1, theme: 'dark', language: 'vi' });
assert.deepEqual(normalizeUiPreferences({ theme: 'light', language: 'en' }), { version: 1, theme: 'light', language: 'en' });
assert.deepEqual(normalizeUiPreferences({ theme: 'unknown', language: 'xx' }), { version: 1, theme: 'system', language: 'en' });
// A theme id from either earlier era (the brief monochrome-only
// 'black'/'white' rewrite, or anything before that) isn't in THEMES
// anymore and falls through to DEFAULTS.theme ('system'), same as any
// other unrecognized value — no separate migration needed.
assert.deepEqual(normalizeUiPreferences({ theme: 'black', language: 'en' }), { version: 1, theme: 'system', language: 'en' });
assert.deepEqual(normalizeUiPreferences({ theme: 'violet-workspace', language: 'en' }), { version: 1, theme: 'system', language: 'en' });
assert.deepEqual(readUiPreferences(storage), { version: 1, theme: 'system', language: 'en' });
assert.deepEqual(writeUiPreferences({ theme: 'dark', language: 'ko' }, storage), { version: 1, theme: 'dark', language: 'ko' });
assert.deepEqual(JSON.parse(values.get(UI_PREFERENCES_KEY)), { version: 1, theme: 'dark', language: 'ko' });
values.set(UI_PREFERENCES_KEY, '{broken');
assert.deepEqual(readUiPreferences(storage), { version: 1, theme: 'system', language: 'en' });
console.log('ui-preferences tests passed: 10');
