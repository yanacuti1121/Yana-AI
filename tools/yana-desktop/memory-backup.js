'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { writeJsonAtomic } = require('./desktop-data');

const PORTABLE_DATA_FILES = [
  'data-schema.json',
  'memory.json',
  'conversations.json',
  'missions.json',
];
const EXCLUDED_SENSITIVE_FILES = ['auth.json', 'sessions.json'];
const BACKUP_FORMAT_VERSION = 1;

function exportPortableBackup({
  dataDir,
  outputPath,
  applicationVersion,
  yanaRtBin,
  exec = execFileSync,
  existsSync = fs.existsSync,
  now = () => new Date().toISOString(),
  temporaryRoot = os.tmpdir(),
}) {
  if (!existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }
  if (existsSync(outputPath)) {
    return { ok: false, error: 'backup destination already exists; choose a new filename' };
  }

  const stagingDir = fs.mkdtempSync(path.join(temporaryRoot, 'yana-memory-backup-'));
  try {
    const includedFiles = [];
    for (const filename of PORTABLE_DATA_FILES) {
      const source = path.join(dataDir, filename);
      if (!existsSync(source)) continue;
      const metadata = fs.lstatSync(source);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        return { ok: false, error: `backup source is not a regular file: ${filename}` };
      }
      const contents = fs.readFileSync(source, 'utf8');
      try {
        JSON.parse(contents);
      } catch (error) {
        return { ok: false, error: `backup source contains invalid JSON (${filename}): ${error.message}` };
      }
      fs.writeFileSync(path.join(stagingDir, filename), contents, { mode: 0o600, flag: 'wx' });
      includedFiles.push(filename);
    }

    const manifest = {
      format: 'yana-memory-backup',
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: now(),
      createdByAppVersion: applicationVersion,
      includedFiles,
      excludedSensitiveFiles: EXCLUDED_SENSITIVE_FILES,
    };
    writeJsonAtomic(path.join(stagingDir, 'backup-manifest.json'), manifest);
    const archivePaths = ['backup-manifest.json', ...includedFiles];
    const args = [
      'capability', 'zip-create',
      '--source-root', stagingDir,
      '--output', outputPath,
      ...archivePaths.flatMap((filename) => ['--path', filename]),
    ];

    let stdout;
    try {
      stdout = exec(yanaRtBin, args, { encoding: 'utf8' });
    } catch (error) {
      const detail = (error.stderr || error.message || '').toString().trim();
      return { ok: false, error: detail || 'capability zip-create failed' };
    }
    let envelope;
    try {
      envelope = JSON.parse(stdout);
    } catch (error) {
      return { ok: false, error: `capability zip-create returned invalid JSON: ${error.message}` };
    }
    if (envelope?.capability !== 'archive.create' || envelope?.data?.file_count !== archivePaths.length) {
      return { ok: false, error: 'capability zip-create returned an invalid response envelope' };
    }
    return { ok: true, outputPath, includedFiles, manifest };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

module.exports = {
  BACKUP_FORMAT_VERSION,
  EXCLUDED_SENSITIVE_FILES,
  PORTABLE_DATA_FILES,
  exportPortableBackup,
};
