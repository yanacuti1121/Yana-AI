'use strict';

const { execFile } = require('child_process');
const fs = require('fs');

function runRuntimeJson({
  repoRoot,
  yanaRtBin,
  args,
  exec = execFile,
  existsSync = fs.existsSync,
}) {
  if (!existsSync(yanaRtBin)) {
    return Promise.resolve({ ok: false, error: `yana-rt binary not found at ${yanaRtBin}` });
  }
  return new Promise((resolve) => {
    exec(yanaRtBin, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message || '').trim();
        resolve({ ok: false, error: detail || 'yana-rt command failed' });
        return;
      }
      try {
        resolve({ ok: true, data: JSON.parse(stdout) });
      } catch (parseError) {
        resolve({ ok: false, error: `yana-rt returned invalid JSON: ${parseError.message}` });
      }
    });
  });
}

module.exports = { runRuntimeJson };
