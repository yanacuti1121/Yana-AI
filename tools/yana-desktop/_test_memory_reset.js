'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  RESETTABLE_MEMORY_FILES,
  beginMemoryReset,
  discardMemoryResetRollback,
  rollbackMemoryReset,
} = require('./memory-reset');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-memory-reset-test-'));
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir);

function seed() {
  fs.writeFileSync(path.join(dataDir, 'data-schema.json'), '{"dataSchemaVersion":1}');
  fs.writeFileSync(path.join(dataDir, 'memory.json'), '[{"text":"remember"}]');
  fs.writeFileSync(path.join(dataDir, 'conversations.json'), '[{"id":"chat"}]');
  fs.writeFileSync(path.join(dataDir, 'missions.json'), '[{"id":"mission"}]');
  fs.writeFileSync(path.join(dataDir, 'auth.json'), '{"secret":"keep"}');
  fs.writeFileSync(path.join(dataDir, 'sessions.json'), '{"token":"keep"}');
}

assert.deepStrictEqual(RESETTABLE_MEMORY_FILES, ['memory.json', 'conversations.json', 'missions.json']);
seed();
const transaction = beginMemoryReset({ dataDir });
for (const filename of RESETTABLE_MEMORY_FILES) assert.ok(!fs.existsSync(path.join(dataDir, filename)));
assert.ok(fs.existsSync(path.join(dataDir, 'data-schema.json')));
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'auth.json'))).secret, 'keep');
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions.json'))).token, 'keep');
rollbackMemoryReset(transaction);
for (const filename of RESETTABLE_MEMORY_FILES) assert.ok(fs.existsSync(path.join(dataDir, filename)));
discardMemoryResetRollback(transaction);
assert.ok(!fs.existsSync(transaction.rollbackDir));

const withRegenerated = beginMemoryReset({ dataDir });
fs.writeFileSync(path.join(dataDir, 'memory.json'), '[{"text":"new-on-failed-start"}]');
rollbackMemoryReset(withRegenerated);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'memory.json')))[0].text, 'remember');
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(withRegenerated.rollbackDir, 'memory.json.failed-new')))[0].text, 'new-on-failed-start');
discardMemoryResetRollback(withRegenerated);

const committed = beginMemoryReset({ dataDir });
discardMemoryResetRollback(committed);
for (const filename of RESETTABLE_MEMORY_FILES) assert.ok(!fs.existsSync(path.join(dataDir, filename)));
assert.ok(fs.existsSync(path.join(dataDir, 'auth.json')));

seed();
assert.throws(() => beginMemoryReset({
  dataDir,
  beforeMove: (filename) => { if (filename === 'conversations.json') throw new Error('simulated reset failure'); },
}), /simulated reset failure/);
for (const filename of RESETTABLE_MEMORY_FILES) assert.ok(fs.existsSync(path.join(dataDir, filename)));
assert.deepStrictEqual(fs.readdirSync(dataDir).filter((name) => name.startsWith('.reset-rollback-')), []);

fs.rmSync(path.join(dataDir, 'memory.json'));
fs.symlinkSync(path.join(dataDir, 'auth.json'), path.join(dataDir, 'memory.json'));
assert.throws(() => beginMemoryReset({ dataDir }), /non-regular data file/);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'auth.json'))).secret, 'keep');

fs.rmSync(root, { recursive: true, force: true });
console.log('Desktop portable memory reset tests passed: 26');
