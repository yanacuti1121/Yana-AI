#!/usr/bin/env node
// Entry point cho lệnh `yana`
// Forward mọi args xuống yana-rt binary

const { execFileSync } = require('child_process');
const { join, dirname } = require('path');
const { existsSync } = require('fs');

const binaryName = process.platform === 'win32' ? 'yana-rt.exe' : 'yana-rt';
const localBin = join(dirname(__dirname), 'bin', binaryName);

// Ưu tiên binary local (được install.js download về)
// Fallback về PATH nếu user cài qua cargo
const binary = existsSync(localBin) ? localBin : binaryName;

try {
  execFileSync(binary, process.argv.slice(2), { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status ?? 1);
}
