'use strict';
const { execFile } = require('child_process');
const fs = require('fs');

function runJson(yanaRtBin, repoRoot, args, exec, existsSync) {
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

function validSafety(value) {
  return value && typeof value.mode === 'string';
}

function validAutonomy(value) {
  return value
    && typeof value.enabled === 'boolean'
    && typeof value.max_automatic_level === 'string'
    && Number.isInteger(value.max_attempts);
}

async function readGovernanceStatus({
  repoRoot,
  yanaRtBin,
  exec = execFile,
  existsSync = fs.existsSync,
}) {
  const [status, policy] = await Promise.all([
    runJson(yanaRtBin, repoRoot, ['os', 'status', '--dir', repoRoot, '--json'], exec, existsSync),
    runJson(yanaRtBin, repoRoot, ['os', 'autonomy', 'policy', 'show', '--dir', repoRoot, '--json'], exec, existsSync),
  ]);
  const safety = status.ok && validSafety(status.data?.safety) ? status.data.safety : null;
  const autonomy = policy.ok && validAutonomy(policy.data) ? policy.data : null;
  if (!safety && !autonomy) {
    return { ok: false, error: status.error || policy.error || 'governance status is unavailable' };
  }
  return { ok: true, safety, autonomy };
}

module.exports = { readGovernanceStatus };
