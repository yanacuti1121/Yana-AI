'use strict';

const assert = require('assert');
const { listWorkspaceResources, normalizeWorkspaceResource } = require('./workspace-resources');

const blocks = [
  {
    id: 'block-new', kind: 'pull_request', title: 'Fix connector bridge', body: 'PR body',
    attention: 'signal', created_at: '2026-08-30T00:00:00Z', updated_at: '2026-08-30T02:00:00Z',
    metadata: { connector: 'github', external_id: 'pr:42', repository: 'yana/Yana-AI', resource_kind: 'pull_request' },
  },
  {
    id: 'block-old', kind: 'message', title: 'No GitHub word required', body: '',
    attention: 'review', created_at: '2026-08-30T00:00:00Z', updated_at: '2026-08-30T01:00:00Z',
    metadata: { connector: 'gmail', external_id: 'message:7', resource_kind: 'message' },
  },
];

function fakeExec(stdout, captured) {
  return (binary, args, options, callback) => {
    captured.push({ binary, args, options });
    process.nextTick(() => callback(null, stdout, ''));
  };
}

async function main() {
  const missing = await listWorkspaceResources({ repoRoot: '/repo', yanaRtBin: '/missing', existsSync: () => false });
  assert.strictEqual(missing.ok, false);
  assert.match(missing.error, /not found/);

  const captured = [];
  const listed = await listWorkspaceResources({
    repoRoot: '/repo with spaces', connector: 'github', yanaRtBin: '/safe/yana-rt',
    existsSync: () => true, exec: fakeExec(JSON.stringify(blocks), captured),
  });
  assert.strictEqual(listed.ok, true);
  assert.strictEqual(listed.resources.length, 1);
  assert.strictEqual(listed.resources[0].id, 'block-new');
  assert.strictEqual(listed.resources[0].metadata.external_id, 'pr:42');
  assert.deepStrictEqual(captured[0].args, ['workspace', 'inbox', '--include-noise', '--json']);
  assert.strictEqual(captured[0].options.cwd, '/repo with spaces');
  assert.strictEqual(captured[0].options.timeout, 10_000);
  assert.strictEqual(captured[0].options.maxBuffer, 2 * 1024 * 1024);

  const all = await listWorkspaceResources({
    repoRoot: '/repo', limit: 1, yanaRtBin: '/safe/yana-rt', existsSync: () => true,
    exec: fakeExec(JSON.stringify(blocks), []),
  });
  assert.strictEqual(all.resources.length, 1);
  assert.strictEqual(all.resources[0].id, 'block-new');

  const noTitleHeuristic = await listWorkspaceResources({
    repoRoot: '/repo', connector: 'gmail', yanaRtBin: '/safe/yana-rt', existsSync: () => true,
    exec: fakeExec(JSON.stringify(blocks), []),
  });
  assert.strictEqual(noTitleHeuristic.resources[0].title, 'No GitHub word required');

  const invalidConnector = await listWorkspaceResources({ repoRoot: '/repo', connector: '../github', yanaRtBin: '/safe/yana-rt' });
  assert.strictEqual(invalidConnector.ok, false);
  const invalidLimit = await listWorkspaceResources({ repoRoot: '/repo', limit: 201, yanaRtBin: '/safe/yana-rt' });
  assert.strictEqual(invalidLimit.ok, false);

  assert.throws(() => normalizeWorkspaceResource({ ...blocks[0], attention: 'urgent' }), /attention/);
  const malformed = await listWorkspaceResources({
    repoRoot: '/repo', yanaRtBin: '/safe/yana-rt', existsSync: () => true,
    exec: fakeExec('{not json', []),
  });
  assert.strictEqual(malformed.ok, false);
  assert.match(malformed.error, /invalid JSON/);

  console.log('Desktop workspace resource tests passed: 20');
}

main().catch((error) => { console.error(error); process.exit(1); });
