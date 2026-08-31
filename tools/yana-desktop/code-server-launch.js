'use strict';

const path = require('path');

function prepareCodeServerLaunch({ dataDir, repoRoot, port }) {
  if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir)) throw new Error('dataDir must be absolute');
  if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)) throw new Error('repoRoot must be absolute');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('code-server port is invalid');

  const configPath = path.join(dataDir, 'cache', 'code-server-desktop.yaml');
  const config = [
    `bind-addr: 127.0.0.1:${port}`,
    'auth: none',
    'disable-telemetry: true',
    'disable-update-check: true',
    '',
  ].join('\n');
  return {
    args: ['--config', configPath, repoRoot],
    config,
    configPath,
    url: `http://127.0.0.1:${port}`,
  };
}

module.exports = { prepareCodeServerLaunch };
