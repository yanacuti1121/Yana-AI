'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  EXCLUDED_SENSITIVE_FILES,
  exportPortableBackup,
} = require('./memory-backup');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-memory-backup-test-'));
const dataDir = path.join(root, 'data');
const tempDir = path.join(root, 'temp');
const runtime = path.join(root, 'yana-rt');
const output = path.join(root, 'backup.zip');
fs.mkdirSync(dataDir);
fs.mkdirSync(tempDir);
fs.writeFileSync(runtime, 'test');
fs.writeFileSync(path.join(dataDir, 'data-schema.json'), '{"dataSchemaVersion":1}');
fs.writeFileSync(path.join(dataDir, 'memory.json'), '[{"text":"portable"}]');
fs.writeFileSync(path.join(dataDir, 'auth.json'), '{"hash":"never export"}');
fs.writeFileSync(path.join(dataDir, 'sessions.json'), '{"token":"never export"}');

let capturedArgs = null;
const result = exportPortableBackup({
  dataDir,
  outputPath: output,
  applicationVersion: '1.4.2',
  yanaRtBin: runtime,
  temporaryRoot: tempDir,
  now: () => '2026-08-30T00:00:00.000Z',
  exec: (_binary, args) => {
    capturedArgs = args;
    const sourceRoot = args[args.indexOf('--source-root') + 1];
    assert.ok(fs.existsSync(path.join(sourceRoot, 'backup-manifest.json')));
    assert.ok(fs.existsSync(path.join(sourceRoot, 'memory.json')));
    assert.ok(!fs.existsSync(path.join(sourceRoot, 'auth.json')));
    assert.ok(!fs.existsSync(path.join(sourceRoot, 'sessions.json')));
    const paths = args.filter((_value, index) => args[index - 1] === '--path');
    fs.writeFileSync(output, 'fake zip');
    return JSON.stringify({ capability: 'archive.create', data: { file_count: paths.length } });
  },
});

assert.strictEqual(result.ok, true);
assert.deepStrictEqual(result.includedFiles, ['data-schema.json', 'memory.json']);
assert.deepStrictEqual(result.manifest.excludedSensitiveFiles, EXCLUDED_SENSITIVE_FILES);
assert.ok(capturedArgs.includes('backup-manifest.json'));
assert.ok(!capturedArgs.includes('auth.json'));
assert.ok(!capturedArgs.includes('sessions.json'));
assert.deepStrictEqual(fs.readdirSync(tempDir), [], 'staging directory must be removed');

const existing = exportPortableBackup({
  dataDir,
  outputPath: output,
  applicationVersion: '1.4.2',
  yanaRtBin: runtime,
  temporaryRoot: tempDir,
});
assert.strictEqual(existing.ok, false);
assert.match(existing.error, /already exists/);

const corruptOutput = path.join(root, 'corrupt.zip');
fs.writeFileSync(path.join(dataDir, 'memory.json'), 'not-json');
const corrupt = exportPortableBackup({
  dataDir,
  outputPath: corruptOutput,
  applicationVersion: '1.4.2',
  yanaRtBin: runtime,
  temporaryRoot: tempDir,
  exec: () => { throw new Error('must not execute'); },
});
assert.strictEqual(corrupt.ok, false);
assert.match(corrupt.error, /invalid JSON/);
assert.ok(!fs.existsSync(corruptOutput));
assert.deepStrictEqual(fs.readdirSync(tempDir), [], 'failed backup staging must be removed');

fs.rmSync(root, { recursive: true, force: true });
console.log('Desktop portable memory backup tests passed: 15');
