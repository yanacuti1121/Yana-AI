'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');

// Delegates to `yana-rt task <subcommand> --json` — the SAME TaskStore
// (.yana-ai/tasks.json under the project root) any terminal user's
// `yana-rt task list` already reads/writes (roadmap Phase 8: "Reuse the
// existing Yana task model. Do not create a separate frontend-only todo
// system."). Unlike the capability:: adapters elsewhere in this dir,
// task.rs's storage is CWD-relative, not `--root`-parameterized — so
// `cwd: repoRoot` is passed to the child process instead of a --root arg.
function runTask(yanaRtBin, repoRoot, args, exec, existsSync) {
  if (!existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }
  let stdout;
  try {
    stdout = exec(yanaRtBin, args, { encoding: 'utf8', cwd: repoRoot });
  } catch (e) {
    const detail = (e.stderr || e.message || '').toString().trim();
    return { ok: false, error: detail || `task ${args[1]} failed` };
  }
  try {
    return { ok: true, data: JSON.parse(stdout) };
  } catch (e) {
    return { ok: false, error: `task ${args[1]} returned invalid JSON: ${e.message}` };
  }
}

function listTasks({ repoRoot, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const result = runTask(yanaRtBin, repoRoot, ['task', 'list', '--json'], exec, existsSync);
  if (!result.ok) return result;
  if (!Array.isArray(result.data.tasks)) return { ok: false, error: 'task list returned an invalid response' };
  return { ok: true, tasks: result.data.tasks };
}

function createTask({ repoRoot, name, scope, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const args = ['task', 'create', name, '--json'];
  if (scope) args.push('--scope', scope);
  const result = runTask(yanaRtBin, repoRoot, args, exec, existsSync);
  if (!result.ok) return result;
  return { ok: true, task: result.data };
}

function completeTask({ repoRoot, id, evidence, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const result = runTask(yanaRtBin, repoRoot, ['task', 'done', id, '--evidence', evidence, '--json'], exec, existsSync);
  if (!result.ok) return result;
  return { ok: true, task: result.data };
}

function dropTask({ repoRoot, id, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const result = runTask(yanaRtBin, repoRoot, ['task', 'drop', id, '--json'], exec, existsSync);
  if (!result.ok) return result;
  return { ok: true, id: result.data.id };
}

module.exports = { listTasks, createTask, completeTask, dropTask };
