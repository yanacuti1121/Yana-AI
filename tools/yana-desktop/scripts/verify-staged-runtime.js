'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { binaryName } = require('../runtime-paths');
const { validateRuntimeHelp } = require('../runtime-feature-contract');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function stagedRuntimePath({ root = repoRoot, platform = process.platform } = {}) {
  return path.join(root, 'target', 'desktop-runtime', 'bin', binaryName('yana-rt', platform));
}

function verifyStagedRuntime({
  binaryPath = stagedRuntimePath(),
  exec = execFileSync,
  existsSync = fs.existsSync,
} = {}) {
  if (!existsSync(binaryPath)) {
    throw new Error(`staged yana-rt binary is missing: ${binaryPath}`);
  }
  let help;
  try {
    help = exec(binaryPath, ['--help'], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(`staged yana-rt did not run --help: ${error.message}`);
  }
  return validateRuntimeHelp(String(help || ''));
}

if (require.main === module) {
  const result = verifyStagedRuntime();
  const featureSummary = Object.entries(result.optionalFeatures)
    .map(([feature, available]) => `${feature}=${available ? 'included' : 'excluded'}`)
    .join(', ');
  console.log(`Desktop staged runtime contract verified: ${result.commandCount} commands; ${featureSummary}`);
}

module.exports = { stagedRuntimePath, verifyStagedRuntime };
