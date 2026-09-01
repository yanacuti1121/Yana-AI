'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Plain forward-slash literal, NOT path.join('.yana-ai', 'os', ...): that
// would bake in a platform-native separator (backslash on Windows) into
// this module-level constant at require() time, before readDiscordConfiguration's
// injectable `join` param ever runs -- so a test-level join override could
// never make this deterministic across platforms (the real bug this fixes;
// see readDiscordConfiguration's own test for the CI failure this caused).
// Node's path.join happily accepts forward slashes as input on every OS
// and still normalizes the result correctly, so this is safe in production too.
const DISCORD_CONFIG_PATH = '.yana-ai/os/discord-config.json';
const EXTERNAL_TOOLS = [
  { id: 'claude-code', name: 'Claude Code', command: 'claude' },
  { id: 'codex', name: 'Codex', command: 'codex' },
  { id: 'cursor', name: 'Cursor', command: 'cursor' },
  { id: 'antigravity', name: 'Antigravity', command: 'antigravity' },
];

function readAllowlist(value) {
  return Array.isArray(value) && value.length <= 256
    ? value.filter((item) => typeof item === 'string' && item.length <= 128).length
    : 0;
}

function readDiscordConfiguration(repoRoot, {
  existsSync = fs.existsSync,
  readFileSync = fs.readFileSync,
  join = path.join,
} = {}) {
  const configPath = join(repoRoot, DISCORD_CONFIG_PATH);
  if (!existsSync(configPath)) {
    return { present: false, valid: false, allowedChannels: 0, allowedUsers: 0 };
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { present: true, valid: false, allowedChannels: 0, allowedUsers: 0 };
    }
    return {
      present: true,
      valid: true,
      allowedChannels: readAllowlist(parsed.allowed_channel_ids),
      allowedUsers: readAllowlist(parsed.allowed_user_ids),
    };
  } catch (_) {
    return { present: true, valid: false, allowedChannels: 0, allowedUsers: 0 };
  }
}

function executableOnPath(command, {
  pathEnv = process.env.PATH,
  platform = process.platform,
  existsSync = fs.existsSync,
  statSync = fs.statSync,
  delimiter = path.delimiter,
  join = path.join,
} = {}) {
  const suffixes = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const folders = typeof pathEnv === 'string' ? pathEnv.split(delimiter).filter(Boolean) : [];
  return folders.some((folder) => suffixes.some((suffix) => {
    const candidate = join(folder, `${command}${suffix}`);
    try {
      return existsSync(candidate) && statSync(candidate).isFile();
    } catch (_) {
      return false;
    }
  }));
}

function listExternalTools(options = {}) {
  return EXTERNAL_TOOLS.map((tool) => ({
    ...tool,
    available: executableOnPath(tool.command, options),
  }));
}

function readRuntimeHelp({
  repoRoot,
  yanaRtBin,
  exec = execFile,
  existsSync = fs.existsSync,
}) {
  if (!existsSync(yanaRtBin)) return Promise.resolve(null);
  return new Promise((resolve) => {
    exec(yanaRtBin, ['--help'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 2500,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    }, (error, stdout) => resolve(error ? null : String(stdout || '')));
  });
}

function hasSubcommand(help, command) {
  return typeof help === 'string' && new RegExp(`\\b${command}\\b`, 'i').test(help);
}

async function readRemoteToolsStatus({
  repoRoot,
  yanaRtBin,
  exec = execFile,
  existsSync = fs.existsSync,
  readFileSync = fs.readFileSync,
  statSync = fs.statSync,
  pathEnv = process.env.PATH,
  platform = process.platform,
}) {
  const runtimeAvailable = existsSync(yanaRtBin);
  const [configuration, help] = await Promise.all([
    Promise.resolve(readDiscordConfiguration(repoRoot, { existsSync, readFileSync })),
    readRuntimeHelp({ repoRoot, yanaRtBin, exec, existsSync }),
  ]);
  return {
    ok: true,
    runtimeAvailable,
    runtimeInspected: typeof help === 'string',
    discord: { available: hasSubcommand(help, 'remote'), configuration },
    mcp: { available: hasSubcommand(help, 'mcp'), transport: 'stdio' },
    externalTools: listExternalTools({ pathEnv, platform, existsSync, statSync }),
  };
}

module.exports = {
  DISCORD_CONFIG_PATH,
  EXTERNAL_TOOLS,
  executableOnPath,
  listExternalTools,
  readDiscordConfiguration,
  readRemoteToolsStatus,
};
