'use strict';

const assert = require('assert');
const { MAX_RECENT_PROJECTS, normalizeStore, recordProject } = require('./project-store');

assert.deepStrictEqual(normalizeStore(null), { version: 1, recent: [] });
assert.deepStrictEqual(normalizeStore({ recent: [
  { root: '/work/a', name: 'A', lastOpenedAt: '2026-08-30T00:00:00.000Z' },
  { root: '/work/a', name: 'Duplicate' },
  { root: '' },
] }), { version: 1, recent: [{ root: '/work/a', name: 'A', lastOpenedAt: '2026-08-30T00:00:00.000Z' }] });

let store = recordProject({}, '/work/a', '2026-08-30T01:00:00.000Z');
store = recordProject(store, '/work/b', '2026-08-30T02:00:00.000Z');
store = recordProject(store, '/work/a', '2026-08-30T03:00:00.000Z');
assert.deepStrictEqual(store.recent.map((item) => item.root), ['/work/a', '/work/b']);
assert.strictEqual(store.recent[0].lastOpenedAt, '2026-08-30T03:00:00.000Z');

const many = { recent: Array.from({ length: MAX_RECENT_PROJECTS + 3 }, (_, index) => ({ root: `/work/${index}` })) };
assert.strictEqual(normalizeStore(many).recent.length, MAX_RECENT_PROJECTS);

console.log('project-store tests passed: 8');
