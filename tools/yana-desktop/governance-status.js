'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const { runRuntimeJson } = require('./runtime-json');

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
    runRuntimeJson({ repoRoot, yanaRtBin, args: ['os', 'status', '--dir', repoRoot, '--json'], exec, existsSync }),
    runRuntimeJson({ repoRoot, yanaRtBin, args: ['os', 'autonomy', 'policy', 'show', '--dir', repoRoot, '--json'], exec, existsSync }),
  ]);
  const safety = status.ok && validSafety(status.data?.safety) ? status.data.safety : null;
  const autonomy = policy.ok && validAutonomy(policy.data) ? policy.data : null;
  if (!safety && !autonomy) {
    return { ok: false, error: status.error || policy.error || 'governance status is unavailable' };
  }
  return { ok: true, safety, autonomy };
}

module.exports = { readGovernanceStatus };
