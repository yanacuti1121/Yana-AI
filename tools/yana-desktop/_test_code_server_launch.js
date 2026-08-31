'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { prepareCodeServerLaunch } = require('./code-server-launch');

const launch = prepareCodeServerLaunch({
  dataDir: '/Users/test/Library/Application Support/Yana',
  repoRoot: '/Users/test/Projects/Yana AI',
  port: 8092,
});

assert.deepStrictEqual(launch.args, ['--config', launch.configPath, '/Users/test/Projects/Yana AI']);
assert.ok(launch.configPath.endsWith('/cache/code-server-desktop.yaml'));
assert.match(launch.config, /^bind-addr: 127\.0\.0\.1:8092$/m);
assert.match(launch.config, /^auth: none$/m);
assert.doesNotMatch(launch.config, /^open:/m);
assert.match(launch.config, /^disable-telemetry: true$/m);
assert.ok(!launch.args.includes('--open'));
assert.strictEqual(launch.url, 'http://127.0.0.1:8092');
assert.throws(() => prepareCodeServerLaunch({ dataDir: '/tmp', repoRoot: '/repo', port: 80 }), /port/);
const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
assert.doesNotMatch(mainSource, /restoreProjectRoot\(\);\s*startServer\(\);\s*startCodeServer\(\)/);
assert.match(mainSource, /handleTrusted\('yana:ide-open'/);
assert.match(mainSource, /await shell\.openExternal\(result\.url\)/);

console.log('Desktop code-server launch tests passed: 12');
