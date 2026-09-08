'use strict';

const { execFile } = require('child_process');
const fs = require('fs');

const CONNECTOR_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SCOPE_NAME = /^[a-z][a-z0-9.-]{0,63}$/;
const CONNECTION_STATES = new Set(['disabled', 'adapter-unavailable', 'credential-required', 'ready']);

function run(yanaRtBin, repoRoot, args, { exec, existsSync, timeout = 10_000, env }) {
  if (!existsSync(yanaRtBin)) {
    return Promise.resolve({ ok: false, error: `yana-rt binary not found at ${yanaRtBin}` });
  }
  return new Promise((resolve) => {
    exec(yanaRtBin, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout,
      maxBuffer: 512 * 1024,
      windowsHide: true,
      // Only set when a caller passes one (e.g. syncConnector's accessToken
      // for github) — omitting `env` here lets execFile default to
      // inheriting process.env, unchanged for every other connector.
      ...(env ? { env } : {}),
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message || '').trim();
        resolve({ ok: false, error: detail || 'yana-rt connector command failed' });
        return;
      }
      resolve({ ok: true, stdout: String(stdout || '') });
    });
  });
}

function stringList(value, field) {
  if (!Array.isArray(value) || value.length > 64 || value.some((item) => typeof item !== 'string')) {
    throw new Error(`connector ${field} is invalid`);
  }
  return [...value];
}

function normalizeConnector(value) {
  if (!value || typeof value !== 'object' || !CONNECTOR_NAME.test(value.name || '')) {
    throw new Error('connector name is invalid');
  }
  const allowedScopes = stringList(value.allowed_scopes, 'allowed scopes');
  if (allowedScopes.some((scope) => !SCOPE_NAME.test(scope))) throw new Error('connector allowed scope is invalid');
  const enabledScopes = value.enabled_scopes == null ? [] : stringList(value.enabled_scopes, 'enabled scopes');
  if (enabledScopes.some((scope) => !allowedScopes.includes(scope))) {
    throw new Error('connector enabled scope is not in its allowlist');
  }
  if (!CONNECTION_STATES.has(value.connection_state)) throw new Error('connector connection state is invalid');
  return {
    name: value.name,
    description: typeof value.description === 'string' ? value.description : '',
    allowedScopes,
    enabledScopes,
    enabledAt: typeof value.enabled_at === 'string' ? value.enabled_at : null,
    resourceKinds: stringList(value.resource_kinds, 'resource kinds'),
    credentialPresent: value.credential_present === true,
    runtimeCredentialAvailable: value.runtime_credential_available === true,
    authorizationMode: value.authorization_mode === 'os-secret-or-environment'
      ? value.authorization_mode
      : 'unknown',
    adapterInstalled: value.adapter_installed === true,
    connectionState: value.connection_state,
  };
}

async function listConnectors({
  repoRoot,
  yanaRtBin,
  exec = execFile,
  existsSync = fs.existsSync,
}) {
  const result = await run(yanaRtBin, repoRoot, ['connector', 'list', '--json'], { exec, existsSync });
  if (!result.ok) return result;
  try {
    const parsed = JSON.parse(result.stdout);
    if (!Array.isArray(parsed) || parsed.length > 50) throw new Error('connector list is not a bounded array');
    return { ok: true, connectors: parsed.map(normalizeConnector) };
  } catch (error) {
    return { ok: false, error: `connector list returned invalid JSON: ${error.message}` };
  }
}

async function configureConnector({
  repoRoot,
  name,
  scopes,
  yanaRtBin,
  exec = execFile,
  existsSync = fs.existsSync,
}) {
  if (!CONNECTOR_NAME.test(name || '')) return { ok: false, error: 'connector name is invalid' };
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.length > 32
      || scopes.some((scope) => typeof scope !== 'string' || !SCOPE_NAME.test(scope))) {
    return { ok: false, error: 'connector scopes must be a non-empty bounded list' };
  }
  const result = await run(
    yanaRtBin,
    repoRoot,
    ['connector', 'enable', name, '--scope', [...new Set(scopes)].join(',')],
    { exec, existsSync },
  );
  if (!result.ok) return result;
  return listConnectors({ repoRoot, yanaRtBin, exec, existsSync });
}

async function disconnectConnector({
  repoRoot,
  name,
  yanaRtBin,
  exec = execFile,
  existsSync = fs.existsSync,
}) {
  if (!CONNECTOR_NAME.test(name || '')) return { ok: false, error: 'connector name is invalid' };
  const result = await run(yanaRtBin, repoRoot, ['connector', 'disable', name], { exec, existsSync });
  if (!result.ok) return result;
  return listConnectors({ repoRoot, yanaRtBin, exec, existsSync });
}

// Connectors whose Rust-side sync reads its credential from an
// environment variable (src/connector.rs's sync_github reads
// YANA_GITHUB_ACCESS_TOKEN) rather than YanaVault-in-the-renderer +
// per-request token (Gmail/Calendar's path — see connector-oauth.js).
// Adding a connector here means syncConnector's accessToken param gets
// threaded into the subprocess's environment for exactly that one call,
// never written to disk or logged.
const SYNC_ENV_VAR_BY_CONNECTOR = { github: 'YANA_GITHUB_ACCESS_TOKEN' };

async function syncConnector({
  repoRoot,
  name,
  limit = 20,
  dryRun = false,
  accessToken,
  yanaRtBin,
  exec = execFile,
  existsSync = fs.existsSync,
}) {
  if (!CONNECTOR_NAME.test(name || '')) return { ok: false, error: 'connector name is invalid' };
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return { ok: false, error: 'connector sync limit must be 1..50' };
  const args = ['connector', 'sync', name, '--limit', String(limit)];
  if (dryRun) args.push('--dry-run');
  const envVarName = SYNC_ENV_VAR_BY_CONNECTOR[name];
  const env = envVarName && typeof accessToken === 'string' && accessToken
    ? { ...process.env, [envVarName]: accessToken }
    : undefined;
  const result = await run(yanaRtBin, repoRoot, args, { exec, existsSync, timeout: 30_000, env });
  if (!result.ok) return result;
  return { ok: true, message: result.stdout.trim() };
}

module.exports = {
  configureConnector,
  disconnectConnector,
  listConnectors,
  normalizeConnector,
  syncConnector,
};
