'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DATA_SCHEMA_VERSION,
  ensureDesktopDataStore,
  resolveDesktopDataDir,
} = require('./desktop-data');

assert.strictEqual(
  resolveDesktopDataDir({ platform: 'darwin', homeDir: '/Users/tam', appDataDir: '/ignored' }),
  path.join('/Users/tam', 'Library', 'Application Support', 'Yana'),
);
assert.strictEqual(
  resolveDesktopDataDir({ platform: 'linux', homeDir: '/home/tam', appDataDir: '/ignored' }),
  path.join('/home/tam', '.local', 'share', 'yana'),
);
assert.strictEqual(
  resolveDesktopDataDir({ platform: 'linux', homeDir: '/home/tam', appDataDir: '/ignored', xdgDataHome: '/data' }),
  path.join('/data', 'yana'),
);
assert.strictEqual(
  resolveDesktopDataDir({ platform: 'win32', homeDir: 'C:\\Users\\tam', appDataDir: 'C:\\Users\\tam\\AppData\\Roaming' }),
  'C:\\Users\\tam\\AppData\\Roaming\\Yana',
);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-desktop-data-test-'));
const legacyDir = path.join(root, 'legacy');
const targetDir = path.join(root, 'target');
fs.mkdirSync(legacyDir);
fs.writeFileSync(path.join(legacyDir, 'memory.json'), '[{"text":"keep me"}]');
fs.writeFileSync(path.join(legacyDir, 'sessions.json'), '{"secret-session":"keep locally"}');
fs.writeFileSync(path.join(legacyDir, 'unknown.json'), '{"ignored":true}');

const first = ensureDesktopDataStore({
  targetDir,
  legacyDir,
  applicationVersion: '1.4.2',
  now: () => '2026-08-30T00:00:00.000Z',
});
assert.strictEqual(first.schema.dataSchemaVersion, DATA_SCHEMA_VERSION);
assert.strictEqual(first.schema.migratedFrom, legacyDir);
assert.deepStrictEqual(first.migratedFiles.sort(), ['memory.json', 'sessions.json']);
assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(targetDir, 'memory.json'), 'utf8')), [{ text: 'keep me' }]);
assert.ok(fs.existsSync(path.join(legacyDir, 'memory.json')), 'legacy rollback copy must remain');
assert.ok(!fs.existsSync(path.join(targetDir, 'unknown.json')), 'unknown files must not migrate implicitly');
assert.strictEqual(fs.statSync(path.join(targetDir, 'memory.json')).mode & 0o777, 0o600);

fs.writeFileSync(path.join(legacyDir, 'memory.json'), '[{"text":"new legacy value"}]');
const second = ensureDesktopDataStore({ targetDir, legacyDir, applicationVersion: '1.4.3' });
assert.deepStrictEqual(second.migratedFiles, []);
assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(targetDir, 'memory.json'), 'utf8')), [{ text: 'keep me' }]);

const futureDir = path.join(root, 'future');
fs.mkdirSync(futureDir);
fs.writeFileSync(path.join(futureDir, 'data-schema.json'), JSON.stringify({ dataSchemaVersion: 999 }));
assert.throws(
  () => ensureDesktopDataStore({ targetDir: futureDir, legacyDir, applicationVersion: '1.4.2' }),
  /newer than this app supports/,
);

fs.rmSync(root, { recursive: true, force: true });
console.log('Desktop data directory and migration tests passed: 14');
