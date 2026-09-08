const STORAGE_KEY = 'yana.terminal.preferences.v1';

export const DEFAULT_TERMINAL_PREFERENCES = Object.freeze({
  fontSize: 13,
  lineHeight: 1.2,
  cursorBlink: true,
});

export function normalizeTerminalPreferences(value) {
  const source = value && typeof value === 'object' ? value : {};
  const fontSize = Number.isFinite(source.fontSize) && source.fontSize >= 11 && source.fontSize <= 20
    ? source.fontSize : DEFAULT_TERMINAL_PREFERENCES.fontSize;
  const lineHeight = Number.isFinite(source.lineHeight) && source.lineHeight >= 1 && source.lineHeight <= 2
    ? source.lineHeight : DEFAULT_TERMINAL_PREFERENCES.lineHeight;
  return {
    fontSize,
    lineHeight,
    cursorBlink: typeof source.cursorBlink === 'boolean' ? source.cursorBlink : DEFAULT_TERMINAL_PREFERENCES.cursorBlink,
  };
}

export function readTerminalPreferences(storage = globalThis.localStorage) {
  try {
    return normalizeTerminalPreferences(JSON.parse(storage?.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return { ...DEFAULT_TERMINAL_PREFERENCES };
  }
}

export function writeTerminalPreferences(value, storage = globalThis.localStorage) {
  const normalized = normalizeTerminalPreferences(value);
  storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export const __TEST_ONLY__ = { STORAGE_KEY };
