'use strict';

const assert = require('assert');
const {
  configureConnector,
  disconnectConnector,
  listConnectors,
  syncConnector,
} = require('./connector-registry');

const connectorRows = [{
  name: 'github',
  description: 'Repository notifications',
  allowed_scopes: ['repo.read', 'issue.write'],
  enabled_scopes: ['repo.read'],
  enabled_at: '2026-08-30T00:00:00Z',
  resource_kinds: ['repository', 'notification'],
  credential_present: true,
  runtime_credential_available: true,
  authorization_mode: 'os-secret-or-environment',
  adapter_installed: true,
  connection_state: 'ready',
}];

function fakeExec(responses, captured) {
  let index = 0;
  return (binary, args, options, callback) => {
    captured.push({ binary, args, options });
    const response = responses[index++];
    process.nextTick(() => callback(response.error || null, response.stdout || '', response.stderr || ''));
  };
}

async function main() {
  const missing = await listConnectors({ repoRoot: '/project', yanaRtBin: '/missing', existsSync: () => false });
  assert.strictEqual(missing.ok, false);
  assert.match(missing.error, /not found/);

  const captured = [];
  const listed = await listConnectors({
    repoRoot: '/project with spaces',
    yanaRtBin: '/safe/yana-rt',
    existsSync: () => true,
    exec: fakeExec([{ stdout: JSON.stringify(connectorRows) }], captured),
  });
  assert.strictEqual(listed.ok, true);
  assert.deepStrictEqual(listed.connectors[0], {
    name: 'github', description: 'Repository notifications',
    allowedScopes: ['repo.read', 'issue.write'], enabledScopes: ['repo.read'],
    enabledAt: '2026-08-30T00:00:00Z', resourceKinds: ['repository', 'notification'],
    credentialPresent: true, runtimeCredentialAvailable: true,
    authorizationMode: 'os-secret-or-environment', adapterInstalled: true, connectionState: 'ready',
  });
  assert.deepStrictEqual(captured[0].args, ['connector', 'list', '--json']);
  assert.strictEqual(captured[0].options.cwd, '/project with spaces');
  assert.strictEqual(captured[0].options.timeout, 10_000);

  const configureCalls = [];
  const configured = await configureConnector({
    repoRoot: '/project', name: 'github', scopes: ['repo.read', 'repo.read'],
    yanaRtBin: '/safe/yana-rt', existsSync: () => true,
    exec: fakeExec([{ stdout: 'enabled' }, { stdout: JSON.stringify(connectorRows) }], configureCalls),
  });
  assert.strictEqual(configured.ok, true);
  assert.deepStrictEqual(configureCalls.map((call) => call.args), [
    ['connector', 'enable', 'github', '--scope', 'repo.read'],
    ['connector', 'list', '--json'],
  ]);

  const disconnectCalls = [];
  const disconnected = await disconnectConnector({
    repoRoot: '/project', name: 'github', yanaRtBin: '/safe/yana-rt', existsSync: () => true,
    exec: fakeExec([{ stdout: 'disabled' }, { stdout: JSON.stringify(connectorRows) }], disconnectCalls),
  });
  assert.strictEqual(disconnected.ok, true);
  assert.deepStrictEqual(disconnectCalls[0].args, ['connector', 'disable', 'github']);

  const syncCalls = [];
  const synced = await syncConnector({
    repoRoot: '/project', name: 'github', limit: 20, dryRun: true,
    yanaRtBin: '/safe/yana-rt', existsSync: () => true,
    exec: fakeExec([{ stdout: 'github notifications: 2 would be added' }], syncCalls),
  });
  assert.deepStrictEqual(synced, { ok: true, message: 'github notifications: 2 would be added' });
  assert.deepStrictEqual(syncCalls[0].args, ['connector', 'sync', 'github', '--limit', '20', '--dry-run']);
  assert.strictEqual(syncCalls[0].options.timeout, 30_000);

  const malformed = await listConnectors({
    repoRoot: '/project', yanaRtBin: '/safe/yana-rt', existsSync: () => true,
    exec: fakeExec([{ stdout: JSON.stringify([{ ...connectorRows[0], enabled_scopes: ['admin.root'] }]) }], []),
  });
  assert.strictEqual(malformed.ok, false);
  assert.match(malformed.error, /not in its allowlist/);

  const invalidMutation = await configureConnector({
    repoRoot: '/project', name: 'github', scopes: [], yanaRtBin: '/safe/yana-rt', existsSync: () => true,
  });
  assert.strictEqual(invalidMutation.ok, false);

  console.log('Desktop connector registry tests passed: 22');
}

main().catch((error) => { console.error(error); process.exit(1); });
