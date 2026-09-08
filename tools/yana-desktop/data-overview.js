'use strict';

const fs = require('fs');
const path = require('path');

// The renderer receives only these coarse group totals. In particular, this
// module never opens JSON contents and never returns a path, file name, token,
// session id, or credential value.
const DATA_GROUPS = [
  { id: 'memory', files: ['memory.json', 'conversations.json', 'missions.json'] },
  { id: 'workspace', files: ['projects.json', 'usage-daily.json', 'cron-jobs.json'] },
  { id: 'settings', files: ['data-schema.json', 'memory-backup-settings.json'] },
  { id: 'credentials', files: ['auth.json', 'sessions.json'], sensitive: true },
];

function inspectRegularFile(filePath, { lstatSync = fs.lstatSync } = {}) {
  try {
    const metadata = lstatSync(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return null;
    return metadata.size;
  } catch {
    return null;
  }
}

function summarizeDesktopData(dataDir, dependencies = {}) {
  if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir) || dataDir.includes('\0')) {
    throw new Error('desktop data directory must be an absolute, NUL-free path');
  }

  const groups = DATA_GROUPS.map((group) => {
    let bytes = 0;
    let fileCount = 0;
    for (const filename of group.files) {
      const size = inspectRegularFile(path.join(dataDir, filename), dependencies);
      if (size === null) continue;
      bytes += size;
      fileCount += 1;
    }
    return { id: group.id, bytes, fileCount, sensitive: group.sensitive === true };
  });

  return {
    totalBytes: groups.reduce((total, group) => total + group.bytes, 0),
    groups,
  };
}

module.exports = { DATA_GROUPS, summarizeDesktopData };
