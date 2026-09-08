'use strict';
const assert = require('assert');
const { readGovernanceStatus } = require('./governance-status');

function fakeExec(responses, captured) {
  let index = 0;
  return (binary, args, options, callback) => {
    captured.push({ binary, args, options });
    const response = responses[index++];
    process.nextTick(() => callback(response.error || null, response.stdout || '', response.stderr || ''));
  };
}

async function main() {
  const missing = await readGovernanceStatus({
    repoRoot: '/project',
    yanaRtBin: '/missing/yana-rt',
    existsSync: () => false,
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /not found/);

  const captured = [];
  const success = await readGovernanceStatus({
    repoRoot: '/project with spaces',
    yanaRtBin: '/safe/yana-rt',
    existsSync: () => true,
    exec: fakeExec([
      { stdout: JSON.stringify({ safety: { mode: 'normal', receipt_chain_valid: true } }) },
      { stdout: JSON.stringify({ enabled: true, max_automatic_level: 'bounded', max_attempts: 1 }) },
    ], captured),
  });
  assert.deepEqual(success, {
    ok: true,
    safety: { mode: 'normal', receipt_chain_valid: true },
    autonomy: { enabled: true, max_automatic_level: 'bounded', max_attempts: 1 },
  });
  assert.deepEqual(captured.map((entry) => entry.args), [
    ['os', 'status', '--dir', '/project with spaces', '--json'],
    ['os', 'autonomy', 'policy', 'show', '--dir', '/project with spaces', '--json'],
  ]);
  for (const entry of captured) {
    assert.equal(entry.binary, '/safe/yana-rt');
    assert.equal(entry.options.cwd, '/project with spaces');
    assert.equal(entry.options.timeout, 5000);
  }

  const partial = await readGovernanceStatus({
    repoRoot: '/project',
    yanaRtBin: '/safe/yana-rt',
    existsSync: () => true,
    exec: fakeExec([
      { error: new Error('status unavailable'), stderr: 'status unavailable' },
      { stdout: JSON.stringify({ enabled: false, max_automatic_level: 'observe', max_attempts: 0 }) },
    ], []),
  });
  assert.deepEqual(partial, {
    ok: true,
    safety: null,
    autonomy: { enabled: false, max_automatic_level: 'observe', max_attempts: 0 },
  });

  const malformed = await readGovernanceStatus({
    repoRoot: '/project',
    yanaRtBin: '/safe/yana-rt',
    existsSync: () => true,
    exec: fakeExec([{ stdout: '{}' }, { stdout: '{}' }], []),
  });
  assert.equal(malformed.ok, false);
  assert.match(malformed.error, /unavailable/);

  console.log('governance-status unit tests passed: 14');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
