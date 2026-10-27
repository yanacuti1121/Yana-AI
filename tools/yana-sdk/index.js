'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync, spawn } = require('child_process');

function resolveYanaRtBin(explicitBin) {
  if (explicitBin) return explicitBin;
  const repoRoot = path.join(__dirname, '..', '..');
  const ext = process.platform === 'win32' ? '.exe' : '';
  for (const profile of ['debug', 'release']) {
    const candidate = path.join(repoRoot, 'target', profile, `yana-rt${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  if (process.env.YANA_RT_BIN && fs.existsSync(process.env.YANA_RT_BIN)) {
    return process.env.YANA_RT_BIN;
  }
  return `yana-rt${ext}`;
}

function runJson(args, opts = {}) {
  const bin = resolveYanaRtBin(opts.yanaRtBin);
  const stdout = execFileSync(bin, args, {
    encoding: 'utf8',
    cwd: opts.cwd || process.cwd(),
    timeout: opts.timeoutMs || 30_000,
    maxBuffer: opts.maxBuffer || 16 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function createCheckpoint(root, label = 'sdk-snapshot', opts = {}) {
  return runJson(
    ['capability', 'checkpoint-snapshot', '--root', root, '--label', label],
    opts,
  );
}

function listCheckpoints(root, opts = {}) {
  return runJson(['capability', 'checkpoint-list', '--root', root], opts);
}

function rewindFiles(root, checkpointId, opts = {}) {
  const args = [
    'capability',
    'checkpoint-rewind',
    '--root',
    root,
    '--id',
    String(checkpointId),
  ];
  if (opts.file) args.push('--file', opts.file);
  const dryRun = opts.dryRun !== undefined ? Boolean(opts.dryRun) : true;
  if (dryRun) args.push('--dry-run');
  return runJson(args, opts);
}

function workspaceRefresh(root, ignore = [], opts = {}) {
  const args = ['capability', 'workspace-refresh', '--root', root];
  for (const pat of ignore) {
    args.push('--ignore', pat);
  }
  return runJson(args, opts);
}

function compileSop(file, opts = {}) {
  const args = ['spec', 'compile-sop', file, '--json'];
  for (const kv of opts.vars || []) {
    args.push('--set', kv);
  }
  if (opts.outDir) {
    args.push('--out-dir', opts.outDir);
  }
  return runJson(args, opts);
}

function blindRubric(specFile, opts = {}) {
  const args = ['spec', 'blind-rubric', specFile, '--json'];
  if (opts.diffBase) args.push('--diff-base', opts.diffBase);
  if (opts.dir) args.push('--dir', opts.dir);
  return runJson(args, opts);
}

function doctorHarness(dir = '.', opts = {}) {
  return runJson(['doctor', 'harness', dir, '--json'], opts);
}

function memoryDream(opts = {}) {
  const args = ['memory', 'dream', '--json'];
  if (opts.apply) args.push('--apply');
  return runJson(args, opts);
}

function graphWiki(dir = '.', outDir = '.yana-ai/repowiki', opts = {}) {
  return runJson(['graph', 'wiki', dir, '--out-dir', outDir, '--json'], opts);
}

/**
 * Streams NDJSON events from `yana-rt chat --headless` as an AsyncGenerator.
 * Preserves the single canonical TurnEngine + RuntimeAuthority + HMAC receipt chain.
 */
async function* query({
  prompt,
  provider = 'ollama',
  model,
  cwd = process.cwd(),
  history = [],
  apiKey,
  yanaRtBin,
}) {
  const bin = resolveYanaRtBin(yanaRtBin);
  const args = ['chat', '--headless', '--provider', provider];
  if (model) args.push('--model', model);

  const child = spawn(bin, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderrBuf = '';
  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      if (stderrBuf.length < 65536) stderrBuf += chunk.toString('utf8');
    });
  }
  const payload = JSON.stringify({
    message: prompt,
    history,
    ...(apiKey ? { api_key: apiKey } : {}),
  });
  child.stdin.write(`${payload}\n`);
  child.stdin.end();

  const rl = readline.createInterface({ input: child.stdout });
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      yield JSON.parse(line);
    }
  } finally {
    rl.close();
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM');
    }
  }
}

/**
 * Resumes a paused `awaiting_approval` turn via `yana-rt chat --resume-approval`.
 */
async function* resumeApproval({
  approvalId,
  decision,
  decidedBy = 'sdk-operator',
  provider = 'ollama',
  cwd = process.cwd(),
  apiKey,
  yanaRtBin,
}) {
  const bin = resolveYanaRtBin(yanaRtBin);
  const child = spawn(bin, ['chat', '--resume-approval', '--provider', provider], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderrBuf = '';
  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      if (stderrBuf.length < 65536) stderrBuf += chunk.toString('utf8');
    });
  }
  const payload = JSON.stringify({
    approval_id: approvalId,
    decision,
    decided_by: decidedBy,
    ...(apiKey ? { api_key: apiKey } : {}),
  });
  child.stdin.write(`${payload}\n`);
  child.stdin.end();

  const rl = readline.createInterface({ input: child.stdout });
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      yield JSON.parse(line);
    }
  } finally {
    rl.close();
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM');
    }
  }
}

module.exports = {
  resolveYanaRtBin,
  createCheckpoint,
  listCheckpoints,
  rewindFiles,
  workspaceRefresh,
  compileSop,
  blindRubric,
  doctorHarness,
  memoryDream,
  graphWiki,
  query,
  resumeApproval,
};
