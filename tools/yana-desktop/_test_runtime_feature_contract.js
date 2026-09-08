'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  DESKTOP_RUNTIME_CONTRACT,
  parseRuntimeCommands,
  validateRuntimeHelp,
} = require('./runtime-feature-contract');
const { verifyStagedRuntime } = require('./scripts/verify-staged-runtime');

const defaultHelp = [
  'Yana AI Runtime',
  '',
  'Commands:',
  '  capability     Canonical capability runtime',
  '  os             Host status',
  '  chat           Interactive chat',
  '  help           Print help',
  '',
  'Options:',
  '  -h, --help     Print help',
].join('\n');

assert.deepStrictEqual(
  [...parseRuntimeCommands(defaultHelp)].sort(),
  ['capability', 'chat', 'help', 'os'],
);
assert.deepStrictEqual(validateRuntimeHelp(defaultHelp), {
  schemaVersion: 1,
  commandCount: 4,
  optionalFeatures: { discord: false, mcp: false },
});
assert.throws(
  () => validateRuntimeHelp(defaultHelp.replace('  chat', '  talk')),
  /missing required command\(s\): chat/,
);
assert.throws(
  () => validateRuntimeHelp(defaultHelp.replace('  help', '  remote').replace('Options:', '  mcp             MCP server\n\nOptions:')),
  /feature mismatch for discord/,
);
assert.throws(() => validateRuntimeHelp('Usage: yana-rt'), /parseable Commands section/);
assert.strictEqual(DESKTOP_RUNTIME_CONTRACT.optionalFeatures.discord.command, 'remote');
assert.strictEqual(DESKTOP_RUNTIME_CONTRACT.optionalFeatures.mcp.command, 'mcp');

const calls = [];
const result = verifyStagedRuntime({
  binaryPath: '/safe/yana-rt',
  existsSync: (candidate) => candidate === '/safe/yana-rt',
  exec: (binary, args, options) => {
    calls.push({ binary, args, options });
    return defaultHelp;
  },
});
assert.strictEqual(result.commandCount, 4);
assert.deepStrictEqual(calls.map((call) => call.args), [['--help']]);
assert.throws(
  () => verifyStagedRuntime({ binaryPath: '/missing/yana-rt', existsSync: () => false }),
  /staged yana-rt binary is missing/,
);

const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'desktop.yml'), 'utf8');
const packageJson = require('./package.json');
assert.match(workflow, /name: Verify staged runtime feature contract/);
assert.match(workflow, /run: npm run verify:runtime/);
assert.strictEqual(packageJson.scripts['verify:runtime'], 'node scripts/verify-staged-runtime.js');

console.log('Desktop runtime feature contract tests passed: 14');
