'use strict';

const assert = require('assert');
const path = require('path');
const {
  executableOnPath,
  readDiscordConfiguration,
  readRemoteToolsStatus,
} = require('./remote-tools-status');

// Every existsSync predicate below builds its expected path via the real
// path.join, the same function the production code under test actually
// uses -- never a hardcoded forward-slash literal. path.join emits
// backslashes on Windows; a hardcoded '/a/b' literal compared against its
// output would silently never match there. This is not hypothetical: two
// separate assertions in this exact file were written with hardcoded
// literals and both passed on every platform this test suite happened to
// run on (mac/linux, in every PR's required checks) until the first one
// was actually exercised on a real windows-latest runner, where it failed
// (desktop.yml's win-x64 matrix leg is the only CI job that runs this
// file on real Windows -- no PR-level required check does). Building the
// expected path with the same join function removes the whole class of
// bug instead of patching one hardcoded literal at a time.

function fakeExec(response, calls) {
  return (binary, args, options, callback) => {
    calls.push({ binary, args, options });
    process.nextTick(() => callback(response.error || null, response.stdout || ''));
  };
}

async function main() {
  const discordConfigPath = path.join('/project', '.yana-ai/os/discord-config.json');
  const config = readDiscordConfiguration('/project', {
    existsSync: (candidate) => candidate === discordConfigPath,
    readFileSync: () => JSON.stringify({ allowed_channel_ids: ['100', '200'], allowed_user_ids: ['300'] }),
  });
  assert.deepEqual(config, { present: true, valid: true, allowedChannels: 2, allowedUsers: 1 });

  const malformed = readDiscordConfiguration('/project', {
    existsSync: () => true,
    readFileSync: () => '{',
  });
  assert.deepEqual(malformed, { present: true, valid: false, allowedChannels: 0, allowedUsers: 0 });

  const codexOnPathB = path.join('/b', 'codex');
  assert.equal(executableOnPath('codex', {
    pathEnv: '/a:/b', delimiter: ':', platform: 'darwin',
    existsSync: (candidate) => candidate === codexOnPathB,
    statSync: () => ({ isFile: () => true }),
  }), true);
  assert.equal(executableOnPath('codex', {
    pathEnv: '/a', delimiter: ':', platform: 'darwin',
    existsSync: () => true,
    statSync: () => ({ isFile: () => false }),
  }), false);

  const claudeOnPathTools = path.join('/tools', 'claude');
  const calls = [];
  const status = await readRemoteToolsStatus({
    repoRoot: '/project',
    yanaRtBin: '/safe/yana-rt',
    existsSync: (candidate) => candidate === '/safe/yana-rt' || candidate === claudeOnPathTools || candidate === discordConfigPath,
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
