#!/usr/bin/env node

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const scriptPath = path.join(__dirname, 'sync_codex.py');

function runPython(args, stdio = 'inherit') {
  const python = process.env.PYTHON || 'python3';
  const result = spawnSync(python, [scriptPath, ...args], { stdio });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sync_codex.py exited with status ${result.status}`);
  }
  return result;
}

function syncCodex(_sourceRoot, targetRoot) {
  runPython(['--target', path.resolve(targetRoot)]);
}

if (require.main === module) {
  try {
    runPython(process.argv.slice(2));
  } catch (error) {
    console.error(`Codex sync failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { syncCodex };
