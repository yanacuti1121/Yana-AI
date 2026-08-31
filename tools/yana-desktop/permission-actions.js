'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');

// Roadmap Phase 16 (Permissions & Autonomy), items 61-63 — Permission
// Inspector / Approval UI (read-only) / Autonomy Controls (lease list +
// revoke). Two different backends, two different argument conventions —
// deliberately not unified into one runner, matching how task-actions.js
// (CWD-relative) and the capability:: adapters elsewhere in this dir
// (`--root`-parameterized) already coexist without a shared helper (see
// capability/cli.rs's own header comment on why no generic dispatcher
// exists yet):
//   - `yana-rt capability list --root <repoRoot>`     (capability:: family)
//   - `yana-rt authority pending-approvals --json`    (CWD-relative, like task.rs)
//   - `yana-rt lease list|revoke --json`               (CWD-relative, like task.rs)
function run(yanaRtBin, args, options, exec, existsSync) {
  if (!existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }
  let stdout;
  try {
    stdout = exec(yanaRtBin, args, { encoding: 'utf8', ...options });
  } catch (e) {
    const detail = (e.stderr || e.message || '').toString().trim();
    return { ok: false, error: detail || `${args.join(' ')} failed` };
  }
  try {
    return { ok: true, data: JSON.parse(stdout) };
  } catch (e) {
    return { ok: false, error: `${args.join(' ')} returned invalid JSON: ${e.message}` };
  }
}

function listCapabilities({ repoRoot, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const result = run(yanaRtBin, ['capability', 'list', '--root', repoRoot], {}, exec, existsSync);
  if (!result.ok) return result;
  if (!Array.isArray(result.data.capabilities)) {
    return { ok: false, error: 'capability list returned an invalid response' };
  }
  return { ok: true, capabilities: result.data.capabilities };
}

function listPendingApprovals({ repoRoot, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const result = run(yanaRtBin, ['authority', 'pending-approvals', '--json'], { cwd: repoRoot }, exec, existsSync);
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return { ok: false, error: 'authority pending-approvals returned an invalid response' };
  }
  return { ok: true, approvals: result.data };
}

function listLeases({ repoRoot, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const result = run(yanaRtBin, ['lease', 'list', '--json'], { cwd: repoRoot }, exec, existsSync);
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return { ok: false, error: 'lease list returned an invalid response' };
  }
  return { ok: true, leases: result.data };
}

function revokeLease({ repoRoot, id, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const result = run(yanaRtBin, ['lease', 'revoke', id, '--json'], { cwd: repoRoot }, exec, existsSync);
  if (!result.ok) return result;
  return { ok: true, id: result.data.revoked };
}

module.exports = { listCapabilities, listPendingApprovals, listLeases, revokeLease };
