'use strict';

const fs = require('fs');
const path = require('path');
const { PORTABLE_DATA_FILES } = require('./memory-backup');

const RESETTABLE_MEMORY_FILES = PORTABLE_DATA_FILES.filter((name) => name !== 'data-schema.json');

function validateResetSource(filePath, filename) {
  const metadata = fs.lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`refusing to reset non-regular data file: ${filename}`);
  }
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`refusing to reset invalid JSON (${filename}): ${error.message}`);
  }
}

function rollbackMemoryReset(transaction) {
  if (!transaction?.rollbackDir || !Array.isArray(transaction.movedFiles)) return;
  for (const filename of [...transaction.movedFiles].reverse()) {
    const source = path.join(transaction.rollbackDir, filename);
    const target = path.join(transaction.dataDir, filename);
    if (!fs.existsSync(source)) continue;
    if (fs.existsSync(target)) {
      const metadata = fs.lstatSync(target);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(`refusing to overwrite non-regular data created during rollback: ${filename}`);
      }
      fs.renameSync(target, path.join(transaction.rollbackDir, `${filename}.failed-new`));
    }
    fs.renameSync(source, target);
  }
}

function discardMemoryResetRollback(transaction) {
  if (transaction?.rollbackDir) fs.rmSync(transaction.rollbackDir, { recursive: true, force: true });
}

function beginMemoryReset({ dataDir, beforeMove }) {
  const rollbackDir = fs.mkdtempSync(path.join(dataDir, '.reset-rollback-'));
  const transaction = { dataDir, rollbackDir, movedFiles: [] };
  try {
    for (const filename of RESETTABLE_MEMORY_FILES) {
      const source = path.join(dataDir, filename);
      if (!fs.existsSync(source)) continue;
      validateResetSource(source, filename);
      if (beforeMove) beforeMove(filename);
      fs.renameSync(source, path.join(rollbackDir, filename));
      transaction.movedFiles.push(filename);
    }
    return transaction;
  } catch (error) {
    let rollbackSucceeded = false;
    try {
      rollbackMemoryReset(transaction);
      rollbackSucceeded = true;
    } catch (rollbackError) {
      throw new Error(`${error.message}; rollback also failed: ${rollbackError.message}; rollback retained at ${rollbackDir}`);
    } finally {
      if (rollbackSucceeded) discardMemoryResetRollback(transaction);
    }
    throw error;
  }
}

module.exports = {
  RESETTABLE_MEMORY_FILES,
  beginMemoryReset,
  discardMemoryResetRollback,
  rollbackMemoryReset,
};
