'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');

// Delegates to `yana-rt capability git-diff-path` / `git-stage` /
// `git-unstage` / `git-commit` — canonical `crate::capability::git`
// implementations (roadmap Phase 7 items 27-28). See that module's own
// doc comment for why staging/committing stay outside RuntimeAuthority
// (same trust tier as the human PTY — a direct UI button click, not an
// AI tool call). Same shape as this dir's other capability adapters:
// every external dependency is a parameter, testable from plain `node`.

function runCapability(yanaRtBin, existsSync, exec, args, dataShapeOk) {
  if (!existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }
  let stdout;
  try {
    stdout = exec(yanaRtBin, args, { encoding: 'utf8' });
  } catch (e) {
    const detail = (e.stderr || e.message || '').toString().trim();
    return { ok: false, error: detail || `capability ${args[1]} failed` };
  }
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch (e) {
    return { ok: false, error: `capability ${args[1]} returned invalid JSON: ${e.message}` };
  }
  const data = envelope?.data;
  if (!data || !dataShapeOk(data)) {
    return { ok: false, error: `capability ${args[1]} returned an invalid response envelope` };
  }
  return { ok: true, data };
}

function gitDiffPath({ repoRoot, staged, relPath, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const result = runCapability(
    yanaRtBin, existsSync, exec,
    ['capability', 'git-diff-path', '--root', repoRoot, '--path', relPath, ...(staged ? ['--staged'] : [])],
    (d) => typeof d.output === 'string',
  );
  return result.ok ? { ok: true, output: result.data.output } : result;
}

function gitStage({ repoRoot, relPaths, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const args = ['capability', 'git-stage', '--root', repoRoot];
  for (const p of relPaths) args.push('--path', p);
  const result = runCapability(yanaRtBin, existsSync, exec, args, (d) => Array.isArray(d.paths));
  return result.ok ? { ok: true, paths: result.data.paths } : result;
}

function gitUnstage({ repoRoot, relPaths, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const args = ['capability', 'git-unstage', '--root', repoRoot];
  for (const p of relPaths) args.push('--path', p);
  const result = runCapability(yanaRtBin, existsSync, exec, args, (d) => Array.isArray(d.paths));
  return result.ok ? { ok: true, paths: result.data.paths } : result;
}

function gitCommit({ repoRoot, message, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  const result = runCapability(
    yanaRtBin, existsSync, exec,
    ['capability', 'git-commit', '--root', repoRoot, '--message', message],
    (d) => typeof d.output === 'string',
  );
  return result.ok ? { ok: true, output: result.data.output } : result;
}

module.exports = { gitDiffPath, gitStage, gitUnstage, gitCommit };
