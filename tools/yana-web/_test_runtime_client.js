'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const { PassThrough, Writable } = require('stream');
const {
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
  assert.strictEqual(capture.options.cwd, '/repo with spaces');
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

Promise.resolve()
  .then(testArgvAndStreaming)
  .then(testFailureAndProviderGate)
  .then(testDesktopProviderCoverage)
  .then(() => console.log('runtime-client: 3/3 PASS'))
  .catch(error => { console.error(error); process.exit(1); });
