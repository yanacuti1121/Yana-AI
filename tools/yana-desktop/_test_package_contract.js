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
const bridgeRequires = ['governance-status.js', 'host-status.js']
  .flatMap((file) => {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    return [...source.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)]
      .map((match) => `${match[1]}.js`.replace(/\.js\.js$/, '.js'));
  })
  .sort();
const packagedFiles = new Set(packageJson.build.files);

assert.strictEqual(packageJson.version, packageLock.version);
assert.strictEqual(packageJson.version, packageLock.packages[''].version);
assert.deepStrictEqual(localRequires, [
  'code-server-launch.js',
  'connector-registry.js',
  'data-overview.js',
  'desktop-data.js',
  'git-actions.js',
  'git-status.js',
  'governance-status.js',
  'host-status.js',
  'list-dir.js',
  'memory-backup-policy.js',
  'memory-backup.js',
  'memory-reset.js',
  'memory-restore.js',
  'permission-actions.js',
  'process-lifecycle.js',
  'project-store.js',
  'read-file.js',
  'remote-tools-status.js',
  'runtime-paths.js',
  'search-code.js',
  'security.js',
  'task-actions.js',
  'trash-file.js',
  'workspace-resources.js',
  'zip-archive.js',
]);
assert.deepStrictEqual(bridgeRequires, ['runtime-json.js', 'runtime-json.js']);
for (const requiredFile of new Set([...localRequires, ...bridgeRequires])) {
  assert.ok(packagedFiles.has(requiredFile), `${requiredFile} must be included in build.files`);
}
assert.strictEqual(packageJson.engines.node, '>=24');
assert.strictEqual(packageJson.devDependencies.electron, '43.4.1');
assert.strictEqual(packageJson.devDependencies['electron-builder'], '26.15.3');

console.log('Desktop package contract tests passed: 23');
