'use strict';

const fs = require('fs');
const path = require('path');
const { binaryName } = require('../runtime-paths');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const releaseDir = path.join(repoRoot, 'target', 'release');
const stageDir = path.join(repoRoot, 'target', 'desktop-runtime');

function stage(name, directory) {
  const filename = binaryName(name);
  const source = path.join(releaseDir, filename);
  const destination = path.join(stageDir, directory, filename);
  if (!fs.existsSync(source)) throw new Error(`missing runtime binary: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (process.platform !== 'win32') fs.chmodSync(destination, 0o755);
  console.log(`staged ${destination}`);
}

stage('yana-rt', 'bin');
stage('pty_bridge', 'pty-bridge');
