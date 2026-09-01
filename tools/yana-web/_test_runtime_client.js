'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough, Writable } = require('stream');
const {
  parseRuntimeMode,
  resolveGovernedRuntime,
  supportsGovernedProvider,
  streamGovernedTurn,
} = require('./lib/runtime-client');
const { PROVIDERS } = require('./lib/providers');

function fakeSpawn({ stdout, stderr = '', code = 0, capture }) {
  return (command, args, options) => {
    capture.command = command;
    capture.args = args;
    capture.options = options;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        capture.stdin = (capture.stdin || '') + chunk.toString();
        callback();
      },
    });
    child.kill = signal => { capture.killed = signal; return true; };
    process.nextTick(() => {
      child.stdout.end(stdout);
      child.stderr.end(stderr);
      child.emit('close', code);
    });
    return child;
  };
}

async function testArgvAndStreaming() {
  const capture = {};
  const events = [];
  const result = await streamGovernedTurn({
    binaryPath: '/safe/yana-rt',
    rootDir: '/repo with spaces',
    cwd: '/selected workspace',
    provider: 'ollama',
    model: 'qwen 3:14b',
    input: {
      task: 'xin chào',
      api_key: 'secret only on stdin',
      images: [{ mimeType: 'image/png', data: 'aGVsbG8=' }],
    },
    onEvent: event => events.push(event),
    spawnImpl: fakeSpawn({
      capture,
      stdout: [
        JSON.stringify({ type: 'text_delta', text: 'xin ' }),
        JSON.stringify({ type: 'text_delta', text: 'chào' }),
        JSON.stringify({ type: 'metrics', input_tokens: 2, output_tokens: 3 }),
        JSON.stringify({ type: 'completed', message: 'xin chào' }),
        '',
      ].join('\n'),
    }),
  });
  assert.strictEqual(capture.command, '/safe/yana-rt');
  assert.deepStrictEqual(capture.args, ['chat', '--headless', '--provider', 'ollama', '--model', 'qwen 3:14b']);
  assert.strictEqual(capture.options.shell, undefined);
  assert.strictEqual(capture.options.cwd, '/selected workspace');
  assert.ok(!capture.args.join(' ').includes('secret only on stdin'));
  const stdin = JSON.parse(capture.stdin);
  assert.strictEqual(stdin.api_key, 'secret only on stdin');
  assert.deepStrictEqual(stdin.images, [{ mimeType: 'image/png', data: 'aGVsbG8=' }]);
  assert.deepStrictEqual(events.slice(0, 2).map(event => event.text), ['xin ', 'chào']);
  assert.deepStrictEqual(result.usage, { input_tokens: 2, output_tokens: 3 });
  assert.strictEqual(result.message, 'xin chào');
}

async function testFailureAndProviderGate() {
  assert.strictEqual(supportsGovernedProvider('anthropic'), true);
  assert.strictEqual(supportsGovernedProvider('groq'), true);
  assert.strictEqual(supportsGovernedProvider('gemini'), true);
  assert.strictEqual(supportsGovernedProvider('unknown'), false);
  await assert.rejects(
    streamGovernedTurn({ binaryPath: '/x', rootDir: '/', provider: 'unknown', input: {}, onEvent() {} }),
    /not available in the governed runtime/,
  );
  const capture = {};
  await assert.rejects(
    streamGovernedTurn({
      binaryPath: '/x', rootDir: '/', provider: 'ollama', input: { task: 'x' }, onEvent() {},
      spawnImpl: fakeSpawn({ capture, stdout: '{bad json}\n', code: 2 }),
    }),
    /invalid NDJSON/,
  );
}

function testDesktopProviderCoverage() {
  for (const provider of Object.keys(PROVIDERS)) {
    assert.strictEqual(
      supportsGovernedProvider(provider),
      true,
      `${provider} governed-runtime coverage drifted`,
    );
  }
}

function testAirLlmProviderContract() {
  const provider = PROVIDERS.airllm;
  assert.ok(provider, 'AirLLM must be registered with the desktop gateway');
  assert.strictEqual(provider.protocol, 'http');
  assert.strictEqual(provider.hostname, '127.0.0.1');
  assert.strictEqual(provider.port, 8100);
  assert.strictEqual(provider.keyless, true);
  assert.strictEqual(provider.local, true);
  const body = JSON.parse(provider.body('Qwen/Qwen3-32B', 'system', 'task'));
  assert.strictEqual(body.model, 'Qwen/Qwen3-32B');
  assert.strictEqual(body.stream, true);
  assert.deepStrictEqual(body.messages, [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'task' },
  ]);
}

function testRuntimeDiscovery() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-runtime-client-'));
  const releaseDir = path.join(rootDir, 'target', 'release');
  fs.mkdirSync(releaseDir, { recursive: true });
  // resolveGovernedRuntime's own no-explicit-path lookup (runtime-client.js)
  // hardcodes 'yana-rt.exe' on win32 -- this fixture must match, or the
  // lookup below can never find it there (real bug, found live on
  // windows-latest CI: the fixture was always named plain 'yana-rt').
  const binaryPath = path.join(releaseDir, process.platform === 'win32' ? 'yana-rt.exe' : 'yana-rt');
  fs.writeFileSync(binaryPath, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(binaryPath, 0o755);
  assert.strictEqual(
    resolveGovernedRuntime({ rootDir, env: { PATH: '' } }),
    fs.realpathSync(binaryPath),
  );

  const explicitPath = path.join(rootDir, 'custom yana-rt');
  fs.writeFileSync(explicitPath, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(explicitPath, 0o755);
  assert.strictEqual(
    resolveGovernedRuntime({ explicitPath, rootDir, env: { PATH: '' } }),
    fs.realpathSync(explicitPath),
  );
  assert.strictEqual(
    resolveGovernedRuntime({ explicitPath: 'missing-yana-rt', rootDir, env: { PATH: '' } }),
    '',
    'an explicit but invalid runtime path must fail instead of silently falling back',
  );
}

function testRuntimeMode() {
  assert.strictEqual(parseRuntimeMode(undefined), 'prefer');
  assert.strictEqual(parseRuntimeMode('required'), 'required');
  assert.strictEqual(parseRuntimeMode('legacy'), 'legacy');
  assert.throws(() => parseRuntimeMode('require'), /invalid YANA_RUNTIME_MODE/);
}

function testProductionImageRequiresGovernedRuntime() {
  const dockerfile = fs.readFileSync(path.join(__dirname, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /COPY --from=yana-runtime-builder .*yana-rt \/usr\/local\/bin\/yana-rt/);
  assert.match(dockerfile, /ENV YANA_RT_BIN=\/usr\/local\/bin\/yana-rt/);
  assert.match(dockerfile, /ENV YANA_RUNTIME_MODE=required/);
}

Promise.resolve()
  .then(testArgvAndStreaming)
  .then(testFailureAndProviderGate)
  .then(testDesktopProviderCoverage)
  .then(testAirLlmProviderContract)
  .then(testRuntimeDiscovery)
  .then(testRuntimeMode)
  .then(testProductionImageRequiresGovernedRuntime)
  .then(() => console.log('runtime-client: 7/7 PASS'))
  .catch(error => { console.error(error); process.exit(1); });
