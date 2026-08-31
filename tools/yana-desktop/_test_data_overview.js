'use strict';

const assert = require('assert');
const { summarizeDesktopData } = require('./data-overview');

const fileSizes = new Map([
  ['/data/memory.json', 12],
  ['/data/conversations.json', 8],
  ['/data/auth.json', 24],
  ['/data/sessions.json', 4],
]);
const result = summarizeDesktopData('/data', {
  lstatSync(filePath) {
    if (!fileSizes.has(filePath)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return { isFile: () => true, isSymbolicLink: () => false, size: fileSizes.get(filePath) };
  },
});

assert.deepStrictEqual(result, {
  totalBytes: 48,
  groups: [
    { id: 'memory', bytes: 20, fileCount: 2, sensitive: false },
    { id: 'workspace', bytes: 0, fileCount: 0, sensitive: false },
    { id: 'settings', bytes: 0, fileCount: 0, sensitive: false },
    { id: 'credentials', bytes: 28, fileCount: 2, sensitive: true },
  ],
});

assert.throws(() => summarizeDesktopData('relative'), /absolute/);
assert.throws(() => summarizeDesktopData('/data\0bad'), /NUL-free/);
assert.deepStrictEqual(summarizeDesktopData('/data', {
  lstatSync: () => ({ isFile: () => false, isSymbolicLink: () => false, size: 100 }),
}).totalBytes, 0);
assert.deepStrictEqual(summarizeDesktopData('/data', {
  lstatSync: () => ({ isFile: () => true, isSymbolicLink: () => true, size: 100 }),
}).totalBytes, 0);

console.log('data-overview tests passed: 5');
