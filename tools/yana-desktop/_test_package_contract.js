'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const packageJson = require('./package.json');
const packageLock = require('./package-lock.json');
const mainSource = fs.readFileSync(path.join(__dirname, packageJson.main), 'utf8');
const localRequires = [...mainSource.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)]
  .map((match) => `${match[1]}.js`.replace(/\.js\.js$/, '.js'))
  .sort();
const packagedFiles = new Set(packageJson.build.files);

assert.strictEqual(packageJson.version, packageLock.version);
assert.strictEqual(packageJson.version, packageLock.packages[''].version);
assert.deepStrictEqual(localRequires, [
  'git-actions.js',
  'git-status.js',
  'list-dir.js',
  'process-lifecycle.js',
  'read-file.js',
  'runtime-paths.js',
  'security.js',
  'task-actions.js',
  'zip-archive.js',
]);
for (const requiredFile of localRequires) {
  assert.ok(packagedFiles.has(requiredFile), `${requiredFile} must be included in build.files`);
}
assert.strictEqual(packageJson.engines.node, '>=24');
assert.strictEqual(packageJson.devDependencies.electron, '43.4.1');
assert.strictEqual(packageJson.devDependencies['electron-builder'], '26.15.3');

console.log('Desktop package contract tests passed: 10');
