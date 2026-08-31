'use strict';

const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

function stop(child) {
  if (!child || child.killed) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('close', resolve);
    child.kill('SIGTERM');
    setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 1500).unref();
  });
}

async function main() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-custom-models-'));
  let mockServer;
  let yanaServer;
  try {
    const runtimeCapturePath = path.join(temporaryRoot, 'runtime-input.json');
    const runtimePath = path.join(temporaryRoot, 'fake-yana-rt.js');
    fs.writeFileSync(runtimePath, `#!/usr/bin/env node
const fs = require('fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.YANA_TEST_CAPTURE, JSON.stringify({ args: process.argv.slice(2), input: JSON.parse(input) }));
  process.stdout.write(JSON.stringify({ type: 'text_delta', text: 'governed custom reply' }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'metrics', input_tokens: 3, output_tokens: 4 }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'completed', message: 'governed custom reply' }) + '\\n');
});
`);
    fs.chmodSync(runtimePath, 0o700);
    let requestedPath = '';
    mockServer = http.createServer((request, response) => {
      requestedPath = request.url;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'my-local-qwen' }, { id: 'my-local-coder' }] }));
    });
    const localPort = await listen(mockServer);
    yanaServer = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: {
        ...process.env,
        PORT: '0',
        YANA_DATA_DIR: path.join(temporaryRoot, 'data'),
        YANA_ROOT_DIR: path.resolve(__dirname, '..', '..'),
        YANA_RT_BIN: runtimePath,
        YANA_TEST_CAPTURE: runtimeCapturePath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const yanaPort = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error(`Yana server did not start: ${output}`)), 8000);
      yanaServer.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/Yana AI on http:\/\/[^:]+:(\d+)/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
      yanaServer.stderr.on('data', (chunk) => { output += chunk; });
      yanaServer.once('error', reject);
    });

    const origin = `http://127.0.0.1:${yanaPort}`;
    const setupResponse = await fetch(`${origin}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ username: 'local-model-test', password: 'temporary-test-password' }),
    });
    assert.equal(setupResponse.status, 200);
    const sessionCookie = (setupResponse.headers.get('set-cookie') || '').split(';', 1)[0];
    assert.ok(sessionCookie.startsWith('yana_sid='));

    const response = await fetch(`${origin}/api/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: sessionCookie },
      body: JSON.stringify({
        provider: 'custom',
        baseUrl: `http://127.0.0.1:${localPort}/v1/chat/completions`,
        customKeyless: true,
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.models.map((model) => model.id), ['my-local-coder', 'my-local-qwen']);
    assert.equal(requestedPath, '/v1/models');

    const chatResponse = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: sessionCookie },
      body: JSON.stringify({
        task: 'Reply through the governed custom provider.',
        provider: 'custom',
        model: 'my-local-coder',
        baseUrl: `http://127.0.0.1:${localPort}/v1/chat/completions`,
        customKeyless: true,
      }),
    });
    assert.equal(chatResponse.status, 200);
    assert.match(await chatResponse.text(), /governed custom reply/);
    const runtimeCapture = JSON.parse(fs.readFileSync(runtimeCapturePath, 'utf8'));
    assert.deepEqual(runtimeCapture.args, ['chat', '--headless', '--provider', 'custom', '--model', 'my-local-coder']);
    assert.equal(runtimeCapture.input.base_url, `http://127.0.0.1:${localPort}/v1/chat/completions`);
    assert.equal(runtimeCapture.input.custom_keyless, true);
    console.log('custom local model integration: discovery + governed chat PASS');
  } finally {
    await stop(yanaServer);
    if (mockServer) await new Promise((resolve) => mockServer.close(resolve));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
