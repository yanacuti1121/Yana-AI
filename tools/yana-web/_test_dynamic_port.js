'use strict';

const assert = require('assert');
const { fork } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-dynamic-port-'));
const child = fork(path.join(__dirname, 'server.js'), [], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
    YANA_DATA_DIR: dataDir,
    YANA_ROOT_DIR: path.join(__dirname, '..', '..'),
  },
  silent: true,
});

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
  console.error('FAIL  dynamic port server did not become ready');
  process.exit(1);
}, 10000);

child.on('message', message => {
  if (!message || message.type !== 'yana-server-ready') return;
  assert(Number.isInteger(message.port) && message.port > 0);
  http.get(`http://127.0.0.1:${message.port}/health`, res => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(body.ok, true);
      clearTimeout(timeout);
      child.kill('SIGTERM');
      console.log(`PASS  dynamic port health on ${message.port}`);
    });
  }).on('error', error => {
    clearTimeout(timeout);
    child.kill('SIGTERM');
    throw error;
  });
});
