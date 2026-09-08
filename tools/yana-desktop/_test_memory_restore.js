'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  applyPreparedRestore,
  cleanupPreparedRestore,
  discardRestoreRollback,
  preparePortableRestore,
  rollbackPortableRestore,
} = require('./memory-restore');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-memory-restore-test-'));
const temporaryRoot = path.join(root, 'temp');
const dataDir = path.join(root, 'data');
const runtime = path.join(root, 'yana-rt');
const archive = path.join(root, 'backup.zip');
fs.mkdirSync(temporaryRoot);
fs.mkdirSync(dataDir);
fs.writeFileSync(runtime, 'test');
fs.writeFileSync(archive, 'fake zip');

const manifest = {
  format: 'yana-memory-backup',
  formatVersion: 1,
  createdAt: '2026-08-30T00:00:00.000Z',
  createdByAppVersion: '1.4.2',
  includedFiles: ['data-schema.json', 'memory.json'],
  excludedSensitiveFiles: ['auth.json', 'sessions.json'],
};

function inspection(names) {
  return {
    ok: true,
    entryCount: names.length,
    entriesTruncated: false,
    warnings: [],
    entries: names.map((name) => ({ name, isDir: false, compressedSize: 1, uncompressedSize: 1 })),
  };
}

function extractor(files) {
  return ({ dest }) => {
    for (const [name, value] of Object.entries(files)) {
      fs.writeFileSync(path.join(dest, name), typeof value === 'string' ? value : JSON.stringify(value));
    }
    return { ok: true, extractedFiles: Object.keys(files).length, extractedDirs: 0, totalBytes: 1 };
  };
}

function prepare(files, customInspection = inspection(Object.keys(files))) {
  return preparePortableRestore({
    archivePath: archive,
    yanaRtBin: runtime,
    temporaryRoot,
    inspect: () => customInspection,
    extract: extractor(files),
  });
}

const validFiles = {
  'backup-manifest.json': manifest,
  'data-schema.json': { dataSchemaVersion: 1 },
  'memory.json': [{ text: 'restored' }],
};
const prepared = prepare(validFiles);
assert.strictEqual(prepared.ok, true);
assert.deepStrictEqual(prepared.includedFiles, ['data-schema.json', 'memory.json']);
assert.ok(fs.existsSync(prepared.stagingDir));

fs.writeFileSync(path.join(dataDir, 'data-schema.json'), '{"dataSchemaVersion":1,"old":true}');
fs.writeFileSync(path.join(dataDir, 'memory.json'), '[{"text":"old"}]');
fs.writeFileSync(path.join(dataDir, 'auth.json'), '{"secret":"keep"}');
fs.writeFileSync(path.join(dataDir, 'sessions.json'), '{"token":"keep"}');

const transaction = applyPreparedRestore({ prepared, dataDir });
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'memory.json')))[0].text, 'restored');
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'auth.json'))).secret, 'keep');
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions.json'))).token, 'keep');
assert.ok(fs.existsSync(transaction.rollbackDir));

rollbackPortableRestore(transaction);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'memory.json')))[0].text, 'old');
discardRestoreRollback(transaction);
assert.ok(!fs.existsSync(transaction.rollbackDir));

const committed = applyPreparedRestore({ prepared, dataDir });
discardRestoreRollback(committed);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'memory.json')))[0].text, 'restored');

fs.writeFileSync(path.join(dataDir, 'data-schema.json'), '{"dataSchemaVersion":1,"stable":true}');
fs.writeFileSync(path.join(dataDir, 'memory.json'), '[{"text":"stable"}]');
assert.throws(() => applyPreparedRestore({
  prepared,
  dataDir,
  beforeWrite: (filename) => { if (filename === 'memory.json') throw new Error('simulated write failure'); },
}), /simulated write failure/);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'data-schema.json'))).stable, true);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'memory.json')))[0].text, 'stable');
assert.deepStrictEqual(fs.readdirSync(dataDir).filter((name) => name.startsWith('.restore-rollback-')), []);

cleanupPreparedRestore(prepared);
assert.ok(!fs.existsSync(prepared.stagingDir));

const unexpected = prepare(validFiles, inspection(['backup-manifest.json', 'data-schema.json', 'memory.json', 'auth.json']));
assert.strictEqual(unexpected.ok, false);
assert.match(unexpected.error, /unexpected file: auth\.json/);

const futureManifest = { ...manifest, formatVersion: 2 };
const future = prepare({ ...validFiles, 'backup-manifest.json': futureManifest });
assert.strictEqual(future.ok, false);
assert.match(future.error, /newer than this app supports/);

const mismatchedManifest = { ...manifest, includedFiles: ['memory.json'] };
const mismatched = prepare({ ...validFiles, 'backup-manifest.json': mismatchedManifest });
assert.strictEqual(mismatched.ok, false);
assert.match(mismatched.error, /missing data-schema/);

const corrupt = prepare({ ...validFiles, 'memory.json': 'not-json' });
assert.strictEqual(corrupt.ok, false);
assert.match(corrupt.error, /invalid JSON/);

const noExclusion = prepare({
  ...validFiles,
  'backup-manifest.json': { ...manifest, excludedSensitiveFiles: [] },
});
assert.strictEqual(noExclusion.ok, false);
assert.match(noExclusion.error, /credential and session exclusion/);

assert.deepStrictEqual(fs.readdirSync(temporaryRoot), [], 'all restore staging directories must be removed');
fs.rmSync(root, { recursive: true, force: true });
console.log('Desktop portable memory restore tests passed: 28');
