import assert from 'node:assert';
import {
  DEFAULT_TERMINAL_PREFERENCES,
  __TEST_ONLY__,
  normalizeTerminalPreferences,
  readTerminalPreferences,
  writeTerminalPreferences,
} from './terminal-preferences.mjs';

const store = new Map();
const storage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) };

assert.deepStrictEqual(readTerminalPreferences(storage), { ...DEFAULT_TERMINAL_PREFERENCES });
assert.deepStrictEqual(normalizeTerminalPreferences({ fontSize: 10, lineHeight: 3, cursorBlink: 'yes' }), {
  ...DEFAULT_TERMINAL_PREFERENCES,
});
assert.deepStrictEqual(writeTerminalPreferences({ fontSize: 16, lineHeight: 1.4, cursorBlink: false }, storage), {
  fontSize: 16, lineHeight: 1.4, cursorBlink: false,
});
assert.deepStrictEqual(readTerminalPreferences(storage), { fontSize: 16, lineHeight: 1.4, cursorBlink: false });
store.set(__TEST_ONLY__.STORAGE_KEY, '{bad json');
assert.deepStrictEqual(readTerminalPreferences(storage), { ...DEFAULT_TERMINAL_PREFERENCES });

console.log('terminal-preferences tests passed: 8');
