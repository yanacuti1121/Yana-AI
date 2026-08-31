'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_SCHEMA_VERSION, writeJsonAtomic } = require('./desktop-data');
const {
  BACKUP_FORMAT_VERSION,
  EXCLUDED_SENSITIVE_FILES,
  PORTABLE_DATA_FILES,
} = require('./memory-backup');
const { inspectZip, extractZip } = require('./zip-archive');

const BACKUP_FORMAT = 'yana-memory-backup';
const MANIFEST_FILE = 'backup-manifest.json';

function fail(error) {
  return { ok: false, error };
}

function sameMembers(left, right) {
  return [...left].sort().join('\n') === [...right].sort().join('\n');
}

function readRegularJson(filePath, label) {
  const metadata = fs.lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} is not a regular file`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} contains invalid JSON: ${error.message}`);
  }
}

function validateInspection(inspection) {
  if (!inspection?.ok) return fail(inspection?.error || 'could not inspect backup archive');
  if (inspection.entriesTruncated || inspection.entryCount !== inspection.entries.length) {
    return fail('backup archive entry list is incomplete');
  }
  if (inspection.warnings?.length) {
    return fail(`backup archive failed safety inspection: ${inspection.warnings.join('; ')}`);
  }

  const allowed = new Set([MANIFEST_FILE, ...PORTABLE_DATA_FILES]);
  const names = [];
  for (const entry of inspection.entries) {
    if (entry.isDir) return fail(`backup archive contains an unexpected directory: ${entry.name}`);
    if (!allowed.has(entry.name)) return fail(`backup archive contains an unexpected file: ${entry.name}`);
    if (names.includes(entry.name)) return fail(`backup archive contains a duplicate file: ${entry.name}`);
    names.push(entry.name);
  }
  if (!names.includes(MANIFEST_FILE)) return fail(`backup archive is missing ${MANIFEST_FILE}`);
  return { ok: true, names };
}

function validateManifest(manifest, extractedNames) {
  if (!manifest || manifest.format !== BACKUP_FORMAT) {
    return fail('backup manifest format is not supported');
  }
  if (!Number.isInteger(manifest.formatVersion) || manifest.formatVersion < 1) {
    return fail('backup manifest version is invalid');
  }
  if (manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    return fail(`backup format ${manifest.formatVersion} is newer than this app supports (${BACKUP_FORMAT_VERSION})`);
  }
  if (!Array.isArray(manifest.includedFiles) || new Set(manifest.includedFiles).size !== manifest.includedFiles.length) {
    return fail('backup manifest includedFiles is invalid');
  }
  if (!manifest.includedFiles.includes('data-schema.json')) {
    return fail('backup manifest is missing data-schema.json');
  }
  if (manifest.includedFiles.some((name) => !PORTABLE_DATA_FILES.includes(name))) {
    return fail('backup manifest requests a non-portable or sensitive file');
  }
  const actualDataFiles = extractedNames.filter((name) => name !== MANIFEST_FILE);
  if (!sameMembers(manifest.includedFiles, actualDataFiles)) {
    return fail('backup manifest does not match the archive contents');
  }
  if (!Array.isArray(manifest.excludedSensitiveFiles)
      || EXCLUDED_SENSITIVE_FILES.some((name) => !manifest.excludedSensitiveFiles.includes(name))) {
    return fail('backup manifest does not declare credential and session exclusion');
  }
  return { ok: true };
}

function preparePortableRestore({
  archivePath,
  yanaRtBin,
  inspect = inspectZip,
  extract = extractZip,
  temporaryRoot = os.tmpdir(),
}) {
  let stagingDir = null;
  try {
    const archiveMetadata = fs.lstatSync(archivePath);
    if (!archiveMetadata.isFile() || archiveMetadata.isSymbolicLink()) {
      return fail('backup archive is not a regular file');
    }

    const inspection = validateInspection(inspect({ zipPath: archivePath, yanaRtBin }));
    if (!inspection.ok) return inspection;

    stagingDir = fs.mkdtempSync(path.join(temporaryRoot, 'yana-memory-restore-'));
    const extraction = extract({ zipPath: archivePath, dest: stagingDir, yanaRtBin });
    if (!extraction?.ok) return fail(extraction?.error || 'could not extract backup archive');

    const extractedNames = fs.readdirSync(stagingDir);
    if (!sameMembers(extractedNames, inspection.names)) {
      return fail('extracted backup contents do not match the inspected archive');
    }

    const manifest = readRegularJson(path.join(stagingDir, MANIFEST_FILE), 'backup manifest');
    const manifestValidation = validateManifest(manifest, extractedNames);
    if (!manifestValidation.ok) return manifestValidation;

    for (const filename of manifest.includedFiles) {
      const value = readRegularJson(path.join(stagingDir, filename), filename);
      if (filename === 'data-schema.json') {
        if (!Number.isInteger(value?.dataSchemaVersion) || value.dataSchemaVersion < 1) {
          return fail('backup data schema metadata is invalid');
        }
        if (value.dataSchemaVersion > DATA_SCHEMA_VERSION) {
          return fail(`backup data schema ${value.dataSchemaVersion} is newer than this app supports (${DATA_SCHEMA_VERSION})`);
        }
      }
    }

    const prepared = {
      ok: true,
      archivePath,
      stagingDir,
      includedFiles: [...manifest.includedFiles],
      manifest,
    };
    stagingDir = null;
    return prepared;
  } catch (error) {
    return fail(`could not prepare memory restore: ${error.message}`);
  } finally {
    if (stagingDir) fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

function rollbackPortableRestore(transaction) {
  if (!transaction?.rollbackDir || !Array.isArray(transaction.files)) return;
  for (const entry of transaction.files) {
    const target = path.join(transaction.dataDir, entry.filename);
    if (entry.existed) {
      const previous = readRegularJson(path.join(transaction.rollbackDir, entry.filename), `rollback ${entry.filename}`);
      writeJsonAtomic(target, previous);
    } else if (fs.existsSync(target)) {
      const metadata = fs.lstatSync(target);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(`refusing to remove unexpected restore target: ${entry.filename}`);
      }
      fs.unlinkSync(target);
    }
  }
}

function discardRestoreRollback(transaction) {
  if (transaction?.rollbackDir) {
    fs.rmSync(transaction.rollbackDir, { recursive: true, force: true });
  }
}

function applyPreparedRestore({ prepared, dataDir, beforeWrite }) {
  if (!prepared?.ok || !prepared.stagingDir || !Array.isArray(prepared.includedFiles)) {
    throw new Error('restore has not been prepared and validated');
  }
  const rollbackDir = fs.mkdtempSync(path.join(dataDir, '.restore-rollback-'));
  const transaction = { dataDir, rollbackDir, files: [] };

  try {
    for (const filename of prepared.includedFiles) {
      if (!PORTABLE_DATA_FILES.includes(filename)) {
        throw new Error(`restore file is not portable: ${filename}`);
      }
      const source = path.join(prepared.stagingDir, filename);
      const value = readRegularJson(source, filename);
      const target = path.join(dataDir, filename);
      const existed = fs.existsSync(target);
      if (existed) {
        const previous = readRegularJson(target, `current ${filename}`);
        writeJsonAtomic(path.join(rollbackDir, filename), previous);
      }
      transaction.files.push({ filename, existed });
      if (beforeWrite) beforeWrite(filename);
      writeJsonAtomic(target, value);
    }
    return transaction;
  } catch (error) {
    let rollbackSucceeded = false;
    try {
      rollbackPortableRestore(transaction);
      rollbackSucceeded = true;
    } catch (rollbackError) {
      throw new Error(`${error.message}; rollback also failed: ${rollbackError.message}; rollback retained at ${rollbackDir}`);
    } finally {
      if (rollbackSucceeded) discardRestoreRollback(transaction);
    }
    throw error;
  }
}

function cleanupPreparedRestore(prepared) {
  if (prepared?.stagingDir) fs.rmSync(prepared.stagingDir, { recursive: true, force: true });
}

module.exports = {
  BACKUP_FORMAT,
  MANIFEST_FILE,
  applyPreparedRestore,
  cleanupPreparedRestore,
  discardRestoreRollback,
  preparePortableRestore,
  rollbackPortableRestore,
  validateInspection,
  validateManifest,
};
