'use strict';

const assert = require('assert');
const path = require('path');
const {
  binaryName,
  runtimeBinaryPath,
  parseServerReadyPort,
  serverUrl,
} = require('./runtime-paths');

assert.strictEqual(binaryName('yana-rt', 'darwin'), 'yana-rt');
assert.strictEqual(binaryName('pty_bridge', 'linux'), 'pty_bridge');
assert.strictEqual(binaryName('yana-rt', 'win32'), 'yana-rt.exe');
assert.strictEqual(
  runtimeBinaryPath({
    name: 'pty_bridge',
    packaged: true,
    resourcesPath: '/app/Resources',
    repoRoot: '/repo',
    platform: 'win32',
  }),
  path.join('/app/Resources', 'pty-bridge', 'pty_bridge.exe'),
);
assert.strictEqual(parseServerReadyPort({ type: 'yana-server-ready', port: 43123 }), 43123);
assert.strictEqual(parseServerReadyPort({ type: 'other', port: 43123 }), null);
assert.strictEqual(parseServerReadyPort({ type: 'yana-server-ready', port: 0 }), null);
assert.strictEqual(serverUrl(43123), 'http://127.0.0.1:43123');
assert.throws(() => serverUrl('invalid'), /invalid server port/);

console.log('Runtime path tests passed: 9');
