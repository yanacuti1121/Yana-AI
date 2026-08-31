'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./desktop-data');
const { exportPortableBackup } = require('./memory-backup');

const SETTINGS_FILE = 'memory-backup-settings.json';
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

function defaults() {
  return {
    enabled: false,
    directory: null,
    cadence: 'daily',
    lastSuccessfulBackupAt: null,
    lastError: null,
  };
}

function normalizeBackupSettings(value) {
  const fallback = defaults();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return {
    enabled: value.enabled === true,
    directory: typeof value.directory === 'string' && path.isAbsolute(value.directory)
      ? value.directory
      : null,
    cadence: 'daily',
    lastSuccessfulBackupAt: typeof value.lastSuccessfulBackupAt === 'string'
      ? value.lastSuccessfulBackupAt
      : null,
    lastError: typeof value.lastError === 'string' ? value.lastError : null,
  };
}

function validatePersistedSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('automatic backup settings must be a JSON object');
  }
  if (typeof value.enabled !== 'boolean') throw new Error('automatic backup enabled flag is invalid');
  if (value.directory !== null && (typeof value.directory !== 'string' || !path.isAbsolute(value.directory))) {
    throw new Error('automatic backup directory is invalid');
  }
  if (value.cadence !== 'daily') throw new Error('automatic backup cadence is not supported');
  for (const field of ['lastSuccessfulBackupAt', 'lastError']) {
    if (value[field] !== null && typeof value[field] !== 'string') {
      throw new Error(`automatic backup ${field} is invalid`);
    }
  }
  return normalizeBackupSettings(value);
}

function settingsPath(dataDir) {
  return path.join(dataDir, SETTINGS_FILE);
}

function readBackupSettings(dataDir) {
  try {
    return validatePersistedSettings(JSON.parse(fs.readFileSync(settingsPath(dataDir), 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return defaults();
    throw new Error(`could not read automatic backup settings: ${error.message}`);
  }
}

function writeBackupSettings(dataDir, settings) {
  const normalized = normalizeBackupSettings(settings);
  writeJsonAtomic(settingsPath(dataDir), normalized);
  return normalized;
}

function setBackupDirectory(dataDir, directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.includes('\0')) {
    throw new Error('automatic backup directory must be an absolute, NUL-free path');
  }
  const resolved = fs.realpathSync(directory);
  const metadata = fs.lstatSync(resolved);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('automatic backup destination must be a real directory');
  }
  return writeBackupSettings(dataDir, { ...readBackupSettings(dataDir), directory: resolved, lastError: null });
}

function setBackupEnabled(dataDir, enabled) {
  const current = readBackupSettings(dataDir);
  if (enabled && !current.directory) throw new Error('choose an automatic backup folder before enabling backups');
  return writeBackupSettings(dataDir, { ...current, enabled: enabled === true, lastError: null });
}

function isBackupDue(settings, nowMs = Date.now()) {
  if (!settings.enabled || !settings.directory) return false;
  const previous = Date.parse(settings.lastSuccessfulBackupAt || '');
  return !Number.isFinite(previous) || nowMs - previous >= DAILY_INTERVAL_MS;
}

function automaticBackupName(date, suffix) {
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `Yana-memory-auto-${timestamp}-${suffix}.zip`;
}

function runAutomaticBackup({
  dataDir,
  applicationVersion,
  yanaRtBin,
  now = () => new Date(),
  suffix = () => crypto.randomBytes(4).toString('hex'),
  exportBackup = exportPortableBackup,
}) {
  let settings;
  try {
    settings = readBackupSettings(dataDir);
  } catch (error) {
    return { ok: false, error: error.message, automatic: true };
  }
  const currentDate = now();
  if (!isBackupDue(settings, currentDate.getTime())) return { ok: true, skipped: true, settings };

  try {
    const metadata = fs.lstatSync(settings.directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('configured automatic backup destination is not a real directory');
    }
    const outputPath = path.join(settings.directory, automaticBackupName(currentDate, suffix()));
    const result = exportBackup({ dataDir, outputPath, applicationVersion, yanaRtBin });
    if (!result.ok) throw new Error(result.error || 'automatic backup failed');
    const updated = writeBackupSettings(dataDir, {
      ...settings,
      lastSuccessfulBackupAt: currentDate.toISOString(),
      lastError: null,
    });
    return { ...result, automatic: true, settings: updated };
  } catch (error) {
    const updated = writeBackupSettings(dataDir, { ...settings, lastError: error.message });
    return { ok: false, error: error.message, automatic: true, settings: updated };
  }
}

module.exports = {
  DAILY_INTERVAL_MS,
  SETTINGS_FILE,
  automaticBackupName,
  isBackupDue,
  normalizeBackupSettings,
  validatePersistedSettings,
  readBackupSettings,
  runAutomaticBackup,
  setBackupDirectory,
  setBackupEnabled,
  writeBackupSettings,
};
