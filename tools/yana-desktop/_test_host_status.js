'use strict';

const assert = require('assert');
const { readHostStatus } = require('./host-status');

function fakeExec(response, captured) {
  return (binary, args, options, callback) => {
    captured.push({ binary, args, options });
    process.nextTick(() => callback(response.error || null, response.stdout || '', response.stderr || ''));
  };
}

async function main() {
  const captured = [];
  const profile = {
    schema_version: 1,
    os: 'macos',
    arch: 'aarch64',
    cpu: { logical_cores: 10, physical_cores: 10, vendor: 'Apple' },
    memory: { total_bytes: 17179869184, model: 'unified' },
    accelerators: [{ kind: 'gpu', name: 'Apple M4', telemetry: 'unknown' }],
    capabilities: { secure_secret_storage: 'supported' },
  };
  const success = await readHostStatus({
    repoRoot: '/project with spaces',
    yanaRtBin: '/safe/yana-rt',
    existsSync: () => true,
    exec: fakeExec({ stdout: JSON.stringify(profile) }, captured),
  });
  assert.deepEqual(success, { ok: true, host: profile });
  assert.deepEqual(captured[0].args, ['os', 'host', 'status', '--json']);
  assert.equal(captured[0].binary, '/safe/yana-rt');
  assert.equal(captured[0].options.cwd, '/project with spaces');

  const malformed = await readHostStatus({
    repoRoot: '/project', yanaRtBin: '/safe/yana-rt', existsSync: () => true,
    exec: fakeExec({ stdout: JSON.stringify({ os: 'macos' }) }, []),
  });
  assert.equal(malformed.ok, false);
  assert.match(malformed.error, /invalid host profile/);

  const missing = await readHostStatus({
    repoRoot: '/project', yanaRtBin: '/missing/yana-rt', existsSync: () => false,
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /not found/);
  console.log('host-status unit tests passed: 8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
