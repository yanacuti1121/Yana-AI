'use strict';

const path = require('path');

function binaryName(name, platform = process.platform) {
  return platform === 'win32' ? `${name}.exe` : name;
}

function runtimeBinaryPath({ name, packaged, resourcesPath, repoRoot, platform = process.platform }) {
  const filename = binaryName(name, platform);
  if (!packaged) return path.join(repoRoot, 'target', 'release', filename);
  const directory = name === 'yana-rt' ? 'bin' : 'pty-bridge';
  return path.join(resourcesPath, directory, filename);
}

// code-server's own layout, not yana-rt/pty_bridge's — a bundled
// bin/code-server launcher script (self-contained, bundles its own Node
// runtime under lib/node) rather than a single binary. Same packaged-vs-
// dev split as runtimeBinaryPath: dev mode reads the staging root
// scripts/stage-code-server.js writes to; packaged mode reads
// Resources/code-server, matching package.json's extraResources entry.
function codeServerPath({ packaged, resourcesPath, repoRoot }) {
  const root = packaged
    ? path.join(resourcesPath, 'code-server')
    : path.join(repoRoot, 'target', 'desktop-runtime', 'code-server');
  return path.join(root, 'bin', 'code-server');
}

function parseServerReadyPort(message) {
  if (!message || message.type !== 'yana-server-ready') return null;
  const port = Number(message.port);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function serverUrl(port) {
  const validPort = parseServerReadyPort({ type: 'yana-server-ready', port });
  if (!validPort) throw new TypeError(`invalid server port: ${port}`);
  return `http://127.0.0.1:${validPort}`;
}

module.exports = { binaryName, runtimeBinaryPath, codeServerPath, parseServerReadyPort, serverUrl };
