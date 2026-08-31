'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_SCHEMA_VERSION = 1;
const SCHEMA_FILE = 'data-schema.json';
const LEGACY_DATA_FILES = [
  'auth.json',
  'sessions.json',
  'memory.json',
  'missions.json',
  'conversations.json',
  'usage-daily.json',
  'cron-jobs.json',
  'projects.json',
];

function resolveDesktopDataDir({ platform, homeDir, appDataDir, xdgDataHome }) {
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support', 'Yana');
  if (platform === 'win32') return path.win32.join(appDataDir, 'Yana');
  const dataRoot = xdgDataHome && path.isAbsolute(xdgDataHome)
    ? xdgDataHome
    : path.join(homeDir, '.local', 'share');
  return path.join(dataRoot, 'yana');
}

function writeJsonAtomic(filePath, value, { mode = 0o600 } = {}) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  const encoded = `${JSON.stringify(value, null, 2)}\n`;
  let fileDescriptor = null;

  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    fileDescriptor = fs.openSync(temporaryPath, 'wx', mode);
    fs.writeFileSync(fileDescriptor, encoded, 'utf8');
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = null;
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (fileDescriptor !== null) {
      try { fs.closeSync(fileDescriptor); } catch (_) {}
    }
    try { fs.unlinkSync(temporaryPath); } catch (_) {}
    throw error;
  }
}

function copyFileAtomic(sourcePath, targetPath) {
  const sourceStat = fs.lstatSync(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) return false;

  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  try {
    fs.copyFileSync(sourcePath, temporaryPath, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(temporaryPath, 0o600);
    const fileDescriptor = fs.openSync(temporaryPath, 'r');
    try { fs.fsyncSync(fileDescriptor); } finally { fs.closeSync(fileDescriptor); }
    fs.renameSync(temporaryPath, targetPath);
    return true;
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch (_) {}
    throw error;
  }
}

function migrateLegacyData({ legacyDir, targetDir }) {
  if (!legacyDir || path.resolve(legacyDir) === path.resolve(targetDir) || !fs.existsSync(legacyDir)) {
    return [];
  }
  if (!fs.lstatSync(legacyDir).isDirectory()) return [];

  const migrated = [];
  for (const filename of LEGACY_DATA_FILES) {
    const sourcePath = path.join(legacyDir, filename);
    const targetPath = path.join(targetDir, filename);
    if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) continue;
    if (copyFileAtomic(sourcePath, targetPath)) migrated.push(filename);
  }
  return migrated;
}

function ensureDesktopDataStore({ targetDir, legacyDir, applicationVersion, now = () => new Date().toISOString() }) {
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  const schemaPath = path.join(targetDir, SCHEMA_FILE);

  if (fs.existsSync(schemaPath)) {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    if (!Number.isInteger(schema.dataSchemaVersion) || schema.dataSchemaVersion < 1) {
      throw new Error('Yana desktop data schema metadata is invalid');
    }
    if (schema.dataSchemaVersion > DATA_SCHEMA_VERSION) {
      throw new Error(
        `Yana desktop data schema ${schema.dataSchemaVersion} is newer than this app supports (${DATA_SCHEMA_VERSION})`,
      );
    }
    return { directory: targetDir, schema, migratedFiles: [] };
  }

  const migratedFiles = migrateLegacyData({ legacyDir, targetDir });
  const schema = {
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    createdAt: now(),
    createdByAppVersion: applicationVersion,
    migratedFrom: migratedFiles.length ? legacyDir : null,
  };
  writeJsonAtomic(schemaPath, schema);
  return { directory: targetDir, schema, migratedFiles };
}

module.exports = {
  DATA_SCHEMA_VERSION,
  LEGACY_DATA_FILES,
  ensureDesktopDataStore,
  migrateLegacyData,
  resolveDesktopDataDir,
  writeJsonAtomic,
};
