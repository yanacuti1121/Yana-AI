'use strict';
const assert = require('assert');
const { gitDiffPath, gitStage, gitUnstage, gitCommit } = require('./git-actions');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}

const missingBin = { yanaRtBin: '/does/not/exist', existsSync: () => false };

check('gitDiffPath: missing binary', gitDiffPath({ repoRoot: '/r', relPath: 'a.txt', staged: false, ...missingBin }).ok === false);
check('gitStage: missing binary', gitStage({ repoRoot: '/r', relPaths: ['a.txt'], ...missingBin }).ok === false);
check('gitUnstage: missing binary', gitUnstage({ repoRoot: '/r', relPaths: ['a.txt'], ...missingBin }).ok === false);
check('gitCommit: missing binary', gitCommit({ repoRoot: '/r', message: 'x', ...missingBin }).ok === false);

const execFails = () => { const e = new Error('boom'); e.stderr = 'not a git repository'; throw e; };
check('gitDiffPath: exec failure surfaces stderr', gitDiffPath({ repoRoot: '/r', relPath: 'a.txt', staged: false, yanaRtBin: '/fake', existsSync: () => true, exec: execFails }).error === 'not a git repository');

const diffSuccess = gitDiffPath({
  repoRoot: '/r', relPath: 'a.txt', staged: false, yanaRtBin: '/fake', existsSync: () => true,
  exec: () => JSON.stringify({ capability: 'git.diff', data: { staged: false, path: 'a.txt', output: '+hello' } }),
});
check('gitDiffPath: success maps output', diffSuccess.ok === true && diffSuccess.output === '+hello');

const stageSuccess = gitStage({
  repoRoot: '/r', relPaths: ['a.txt', 'b.txt'], yanaRtBin: '/fake', existsSync: () => true,
  exec: (bin, args) => {
    assert.deepStrictEqual(args, ['capability', 'git-stage', '--root', '/r', '--path', 'a.txt', '--path', 'b.txt']);
    return JSON.stringify({ capability: 'git.stage', data: { paths: ['a.txt', 'b.txt'] } });
  },
});
check('gitStage: builds one --path per file and maps result', stageSuccess.ok === true && stageSuccess.paths.length === 2);

const commitSuccess = gitCommit({
  repoRoot: '/r', message: 'fix bug', yanaRtBin: '/fake', existsSync: () => true,
  exec: () => JSON.stringify({ capability: 'git.commit', data: { output: 'ok' } }),
});
check('gitCommit: success maps output', commitSuccess.ok === true && commitSuccess.output === 'ok');

const badEnvelope = gitCommit({
  repoRoot: '/r', message: 'x', yanaRtBin: '/fake', existsSync: () => true,
  exec: () => JSON.stringify({ capability: 'git.commit', data: {} }),
});
check('gitCommit: malformed envelope reports ok:false', badEnvelope.ok === false && /invalid response envelope/.test(badEnvelope.error));

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('git-actions unit tests passed: 8');
