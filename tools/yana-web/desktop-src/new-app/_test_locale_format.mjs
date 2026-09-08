import assert from 'node:assert/strict';
import { formatDateTime, localeFor } from './locale-format.mjs';

assert.equal(localeFor('vi'), 'vi-VN');
assert.equal(localeFor('unknown'), 'en-US');
assert.equal(formatDateTime('not-a-date', 'en'), '—');
assert.match(formatDateTime('2026-08-30T12:00:00.000Z', 'en'), /2026/);
assert.match(formatDateTime('2026-08-30T12:00:00.000Z', 'ko'), /2026/);
console.log('locale-format tests passed: 5');
