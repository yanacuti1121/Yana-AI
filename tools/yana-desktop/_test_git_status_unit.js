'use strict';
// Pure-function tests for git-status.js — no Electron, no real git process
// (mirrors _test_list_dir_unit.js's shape: inject exec/existsSync).
const assert = require('assert');
const { gitStatus, parsePorcelainV2 } = require('./git-status');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}

// parsePorcelainV2: branch header + modified/untracked counting
const sample = [
  '# branch.oid abc123',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +0 -0',
  '1 .M N... 100644 100644 100644 h h src/a.rs',
  '1 .M N... 100644 100644 100644 h h src/b.rs',
  '2 R. N... 100644 100644 100644 h h R100 src/c.rs\tsrc/old.rs',
  '? new-file.txt',
  '',
].join('\n');
const parsed = parsePorcelainV2(sample);
check('branch parsed', parsed.branch === 'main');
check('modified count includes 1/2/u lines', parsed.modifiedCount === 3);
check('untracked count', parsed.untrackedCount === 1);

// Roadmap Phase 7 item 26 — Changes View: files array with per-entry status.
check('ordinary modified file recorded with X/Y status', parsed.files.some((f) => f.path === 'src/a.rs' && f.indexStatus === '.' && f.worktreeStatus === 'M' && f.kind === 'ordinary'));
check('renamed file recorded with new path, not the old one', parsed.files.some((f) => f.path === 'src/c.rs' && f.kind === 'renamed'));
check('untracked file recorded', parsed.files.some((f) => f.path === 'new-file.txt' && f.kind === 'untracked'));
check('files array length matches modified+untracked counts', parsed.files.length === parsed.modifiedCount + parsed.untrackedCount);

const unmergedSample = [
  '# branch.head main',
  'u UU N... 100644 100644 100644 100644 h h h conflict.txt',
].join('\n');
const unmergedParsed = parsePorcelainV2(unmergedSample);
check('unmerged file path parsed correctly despite extra stage-mode fields', unmergedParsed.files[0].path === 'conflict.txt' && unmergedParsed.files[0].kind === 'unmerged');

// Detached HEAD / no branch line
const detached = '# branch.oid abc123\n# branch.head (detached)\n';
check('detached head branch label preserved as-is', parsePorcelainV2(detached).branch === '(detached)');

// Empty output (clean repo, no branch header at all — defensive)
const empty = parsePorcelainV2('');
check('empty output: branch null, counts zero, files empty', empty.branch === null && empty.modifiedCount === 0 && empty.untrackedCount === 0 && empty.files.length === 0);

// gitStatus(): missing binary
const missingBin = gitStatus({
  repoRoot: '/repo',
  yanaRtBin: '/does/not/exist',
  existsSync: () => false,
});
check('missing yana-rt binary reports ok:false', missingBin.ok === false && /not found/.test(missingBin.error));

// gitStatus(): exec throws (capability failure)
const execFails = gitStatus({
  repoRoot: '/repo',
  yanaRtBin: '/fake/yana-rt',
  existsSync: () => true,
  exec: () => { const e = new Error('boom'); e.stderr = 'not a git repository'; throw e; },
});
check('exec failure surfaces stderr detail', execFails.ok === false && execFails.error === 'not a git repository');

// gitStatus(): invalid JSON from the binary
const badJson = gitStatus({
  repoRoot: '/repo',
  yanaRtBin: '/fake/yana-rt',
  existsSync: () => true,
  exec: () => 'not json',
});
check('invalid JSON reports ok:false', badJson.ok === false && /invalid JSON/.test(badJson.error));

// gitStatus(): valid envelope, missing data.output shape
const badEnvelope = gitStatus({
  repoRoot: '/repo',
  yanaRtBin: '/fake/yana-rt',
  existsSync: () => true,
  exec: () => JSON.stringify({ capability: 'git.status', data: {} }),
});
check('missing data.output reports ok:false', badEnvelope.ok === false && /invalid response envelope/.test(badEnvelope.error));

// gitStatus(): full success path
const success = gitStatus({
  repoRoot: '/repo',
  yanaRtBin: '/fake/yana-rt',
  existsSync: () => true,
  exec: () => JSON.stringify({ capability: 'git.status', data: { output: '# branch.head main\n? untracked.txt\n' } }),
});
check('success path returns ok:true with parsed fields', success.ok === true && success.branch === 'main' && success.untrackedCount === 1);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('git-status unit tests passed: 14');
