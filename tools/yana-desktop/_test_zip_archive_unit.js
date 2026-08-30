'use strict';
// Pure-function tests for zip-archive.js — no Electron, no real yana-rt binary.
const assert = require('assert');
const { inspectZip, extractZip } = require('./zip-archive');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}

// --- inspectZip ---

const missingBinInspect = inspectZip({ zipPath: '/a.zip', yanaRtBin: '/does/not/exist', existsSync: () => false });
check('inspectZip: missing binary reports ok:false', missingBinInspect.ok === false && /not found/.test(missingBinInspect.error));

const inspectExecFails = inspectZip({
  zipPath: '/a.zip', yanaRtBin: '/fake/yana-rt', existsSync: () => true,
  exec: () => { const e = new Error('boom'); e.stderr = 'not a valid zip archive'; throw e; },
});
check('inspectZip: exec failure surfaces stderr detail', inspectExecFails.ok === false && inspectExecFails.error === 'not a valid zip archive');

const inspectBadJson = inspectZip({ zipPath: '/a.zip', yanaRtBin: '/fake/yana-rt', existsSync: () => true, exec: () => 'not json' });
check('inspectZip: invalid JSON reports ok:false', inspectBadJson.ok === false && /invalid JSON/.test(inspectBadJson.error));

const inspectBadEnvelope = inspectZip({
  zipPath: '/a.zip', yanaRtBin: '/fake/yana-rt', existsSync: () => true,
  exec: () => JSON.stringify({ capability: 'archive.inspect', data: {} }),
});
check('inspectZip: missing entries array reports ok:false', inspectBadEnvelope.ok === false && /invalid response envelope/.test(inspectBadEnvelope.error));

const inspectSuccess = inspectZip({
  zipPath: '/a.zip', yanaRtBin: '/fake/yana-rt', existsSync: () => true,
  exec: () => JSON.stringify({
    capability: 'archive.inspect',
    data: {
      entry_count: 1, total_uncompressed_size: 11, total_compressed_size: 11, entries_truncated: false,
      entries: [{ name: 'a.txt', is_dir: false, compressed_size: 11, uncompressed_size: 11 }],
      warnings: ['a.txt: symbolic link entries are never extracted'],
    },
  }),
});
check('inspectZip: success path maps fields correctly', inspectSuccess.ok === true
  && inspectSuccess.entryCount === 1
  && inspectSuccess.entries[0].name === 'a.txt'
  && inspectSuccess.warnings.length === 1);

// --- extractZip ---

const missingBinExtract = extractZip({ zipPath: '/a.zip', dest: '/out', yanaRtBin: '/does/not/exist', existsSync: () => false });
check('extractZip: missing binary reports ok:false', missingBinExtract.ok === false && /not found/.test(missingBinExtract.error));

const extractExecFails = extractZip({
  zipPath: '/a.zip', dest: '/out', yanaRtBin: '/fake/yana-rt', existsSync: () => true,
  exec: () => { const e = new Error('boom'); e.stderr = 'symbolic link entries are not permitted'; throw e; },
});
check('extractZip: exec failure surfaces stderr detail', extractExecFails.ok === false && extractExecFails.error === 'symbolic link entries are not permitted');

const extractSuccess = extractZip({
  zipPath: '/a.zip', dest: '/out', yanaRtBin: '/fake/yana-rt', existsSync: () => true,
  exec: () => JSON.stringify({ capability: 'archive.extract', data: { extracted_files: 2, extracted_dirs: 1, total_bytes: 42 } }),
});
check('extractZip: success path maps fields correctly', extractSuccess.ok === true
  && extractSuccess.extractedFiles === 2 && extractSuccess.extractedDirs === 1 && extractSuccess.totalBytes === 42);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('zip-archive unit tests passed: 8');
