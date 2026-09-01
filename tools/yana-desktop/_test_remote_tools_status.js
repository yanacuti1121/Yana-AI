'use strict';

const assert = require('assert');
const {
  executableOnPath,
  readDiscordConfiguration,
  readRemoteToolsStatus,
} = require('./remote-tools-status');

function fakeExec(response, calls) {
  return (binary, args, options, callback) => {
    calls.push({ binary, args, options });
    process.nextTick(() => callback(response.error || null, response.stdout || ''));
  };
}

async function main() {
  const config = readDiscordConfiguration('/project', {
    existsSync: (candidate) => candidate === '/project/.yana-ai/os/discord-config.json',
    readFileSync: () => JSON.stringify({ allowed_channel_ids: ['100', '200'], allowed_user_ids: ['300'] }),
    // Real path.join emits backslashes on Windows, which would never match
    // the POSIX-style literal above -- inject a portable join so this test
    // exercises the same fake path on every platform (real bug: this was
    // missing here, so this exact assertion failed on windows-latest CI).
    join: (...segments) => segments.join('/'),
  });
  assert.deepEqual(config, { present: true, valid: true, allowedChannels: 2, allowedUsers: 1 });

  const malformed = readDiscordConfiguration('/project', {
    existsSync: () => true,
    readFileSync: () => '{',
  });
  assert.deepEqual(malformed, { present: true, valid: false, allowedChannels: 0, allowedUsers: 0 });

  assert.equal(executableOnPath('codex', {
    pathEnv: '/a:/b', delimiter: ':', platform: 'darwin',
    existsSync: (candidate) => candidate === '/b/codex',
    statSync: () => ({ isFile: () => true }),
  }), true);
  assert.equal(executableOnPath('codex', {
    pathEnv: '/a', delimiter: ':', platform: 'darwin',
    existsSync: () => true,
    statSync: () => ({ isFile: () => false }),
  }), false);

  const calls = [];
  const status = await readRemoteToolsStatus({
    repoRoot: '/project',
    yanaRtBin: '/safe/yana-rt',
    existsSync: (candidate) => candidate === '/safe/yana-rt' || candidate === '/tools/claude' || candidate === '/project/.yana-ai/os/discord-config.json',
    statSync: () => ({ isFile: () => true }),
    readFileSync: () => JSON.stringify({ allowed_channel_ids: ['one'], allowed_user_ids: [] }),
    exec: fakeExec({ stdout: 'Commands:\n  remote\n  mcp\n' }, calls),
    pathEnv: '/tools', delimiter: ':', platform: 'darwin',
  });
  assert.equal(status.ok, true);
  assert.equal(status.runtimeAvailable, true);
  assert.equal(status.runtimeInspected, true);
  assert.equal(status.discord.available, true);
  assert.equal(status.discord.configuration.allowedChannels, 1);
  assert.equal(status.mcp.available, true);
  assert.equal(status.externalTools.find((tool) => tool.command === 'claude').available, true);
  assert.equal(status.externalTools.find((tool) => tool.command === 'codex').available, false);
  assert.deepEqual(calls.map((call) => call.args), [['--help']]);

  const unavailable = await readRemoteToolsStatus({
    repoRoot: '/project', yanaRtBin: '/missing/yana-rt', existsSync: () => false,
    pathEnv: '',
  });
  assert.equal(unavailable.runtimeAvailable, false);
  assert.equal(unavailable.runtimeInspected, false);
  assert.equal(unavailable.discord.available, false);
  assert.equal(unavailable.mcp.available, false);
  console.log('remote-tools-status unit tests passed: 17');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
