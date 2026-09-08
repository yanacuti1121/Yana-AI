'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DAILY_INTERVAL_MS,
  isBackupDue,
  normalizeBackupSettings,
  readBackupSettings,
  runAutomaticBackup,
  setBackupDirectory,
  setBackupEnabled,
  validatePersistedSettings,
} = require('./memory-backup-policy');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-memory-backup-policy-test-'));
const dataDir = path.join(root, 'data');
const destination = path.join(root, 'backups');
fs.mkdirSync(dataDir);
fs.mkdirSync(destination);

assert.deepStrictEqual(normalizeBackupSettings(null), {
  enabled: false,
  directory: null,
  cadence: 'daily',
  lastSuccessfulBackupAt: null,
  lastError: null,
});
assert.throws(() => validatePersistedSettings({ enabled: 'yes' }), /enabled flag is invalid/);
assert.throws(() => setBackupEnabled(dataDir, true), /choose an automatic backup folder/);
const selected = setBackupDirectory(dataDir, destination);
assert.strictEqual(selected.directory, fs.realpathSync(destination));
assert.strictEqual(selected.enabled, false);
const enabled = setBackupEnabled(dataDir, true);
assert.strictEqual(enabled.enabled, true);
assert.strictEqual(isBackupDue(enabled, Date.now()), true);

let exportCalls = 0;
const now = new Date('2026-08-30T00:00:00.000Z');
const result = runAutomaticBackup({
  dataDir,
  applicationVersion: '1.4.2',
  yanaRtBin: '/fake/yana-rt',
  now: () => now,
  suffix: () => '1234abcd',
  exportBackup: ({ outputPath }) => {
    exportCalls += 1;
    assert.strictEqual(path.dirname(outputPath), fs.realpathSync(destination));
    assert.match(path.basename(outputPath), /^Yana-memory-auto-2026-08-30T00-00-00-000Z-1234abcd\.zip$/);
    return { ok: true, outputPath, includedFiles: ['data-schema.json'] };
  },
});
assert.strictEqual(result.ok, true);
assert.strictEqual(result.automatic, true);
assert.strictEqual(exportCalls, 1);
assert.strictEqual(readBackupSettings(dataDir).lastSuccessfulBackupAt, now.toISOString());

const notDue = runAutomaticBackup({
  dataDir,
  applicationVersion: '1.4.2',
  yanaRtBin: '/fake/yana-rt',
  now: () => new Date(now.getTime() + DAILY_INTERVAL_MS - 1),
  exportBackup: () => { throw new Error('must not run'); },
});
assert.strictEqual(notDue.skipped, true);
assert.strictEqual(exportCalls, 1);

const dueAgain = runAutomaticBackup({
  dataDir,
  applicationVersion: '1.4.2',
  yanaRtBin: '/fake/yana-rt',
  now: () => new Date(now.getTime() + DAILY_INTERVAL_MS),
  suffix: () => '87654321',
  exportBackup: () => ({ ok: false, error: 'disk full' }),
});
assert.strictEqual(dueAgain.ok, false);
assert.match(dueAgain.error, /disk full/);
assert.strictEqual(readBackupSettings(dataDir).lastError, 'disk full');

setBackupEnabled(dataDir, false);
assert.strictEqual(isBackupDue(readBackupSettings(dataDir), now.getTime() + DAILY_INTERVAL_MS * 2), false);

fs.writeFileSync(path.join(dataDir, 'memory-backup-settings.json'), '{broken');
assert.throws(() => readBackupSettings(dataDir), /could not read automatic backup settings/);
const corruptRun = runAutomaticBackup({
  dataDir,
  applicationVersion: '1.4.2',
  yanaRtBin: '/fake/yana-rt',
});
assert.strictEqual(corruptRun.ok, false);
assert.match(corruptRun.error, /could not read automatic backup settings/);

fs.rmSync(root, { recursive: true, force: true });
console.log('Desktop automatic memory backup policy tests passed: 22');
