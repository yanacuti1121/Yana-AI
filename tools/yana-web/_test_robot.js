'use strict';
// Tests for robot.js's WebSocket handshake + MCP client handshake, against
// a real running server (not server.js itself, per its own header comment
// in _test_provider_usage_shapes.js noting server.js can't be required in
// isolation because it calls server.listen() at module load). Spins up a
// minimal http.Server + robot.attach(server) directly instead.
//
// Does NOT exercise the ASR/chat/TTS pipeline (processUtterance) — that
// needs real Groq + tts-sidecar HTTP calls, out of scope for an
// unattended test that shouldn't spend API quota. This only verifies the
// hello handshake and MCP initialize/tools/list request/response cycle
// robot.js drives as the MCP *client* (docs/mcp-protocol.md's flow),
// using a mock "device" WebSocket client to answer them.

const http = require('http');
const assert = require('assert');
const WebSocket = require('ws');
const robot = require('./robot');

const PORT = 18234;
let failures = 0;

function check(name, cond) {
  if (cond) {
    console.log(`  ok - ${name}`);
  } else {
    console.error(`  FAIL - ${name}`);
    failures++;
  }
}

async function main() {
  const server = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  robot.attach(server);
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/robot/ws`);
  const received = [];
  let sessionId = null;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('handshake timed out')), 5000);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'hello',
          version: 1,
          features: { mcp: true },
          transport: 'websocket',
          audio_params: { format: 'opus', sample_rate: 16000, channels: 1, frame_duration: 60 },
        }),
      );
    });

    ws.on('message', data => {
      const msg = JSON.parse(data.toString('utf8'));
      received.push(msg);
      sessionId = msg.session_id || sessionId;

      if (msg.type === 'hello') {
        check('hello reply has transport=websocket', msg.transport === 'websocket');
        check('hello reply has audio_params', !!msg.audio_params && msg.audio_params.sample_rate === 16000);
      }

      if (msg.type === 'mcp' && msg.payload && msg.payload.method === 'initialize') {
        // Respond as the device (MCP server) would.
        ws.send(
          JSON.stringify({
            session_id: sessionId,
            type: 'mcp',
            payload: {
              jsonrpc: '2.0',
              id: msg.payload.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'test-device', version: '0.0.0' },
              },
            },
          }),
        );
      }

      if (msg.type === 'mcp' && msg.payload && msg.payload.method === 'tools/list') {
        ws.send(
          JSON.stringify({
            session_id: sessionId,
            type: 'mcp',
            payload: {
              jsonrpc: '2.0',
              id: msg.payload.id,
              result: {
                tools: [
                  {
                    name: 'self.wheelbot.move_forward',
                    description: 'Drive forward',
                    inputSchema: { type: 'object', properties: {} },
                  },
                ],
                nextCursor: '',
              },
            },
          }),
        );
        clearTimeout(timeout);
        // Give the client a beat to process the tools/list result, then finish.
        setTimeout(resolve, 200);
      }
    });

    ws.on('error', reject);
  });

  const helloMsg = received.find(m => m.type === 'hello');
  const initMsg = received.find(m => m.type === 'mcp' && m.payload && m.payload.method === 'initialize');
  const listMsg = received.find(m => m.type === 'mcp' && m.payload && m.payload.method === 'tools/list');

  check('server sent a hello reply', !!helloMsg);
  check('server initiated MCP initialize (device is MCP server, backend is client)', !!initMsg);
  check('server followed up with MCP tools/list', !!listMsg);
  check('every mcp payload is JSON-RPC 2.0', received.filter(m => m.type === 'mcp').every(m => m.payload.jsonrpc === '2.0'));

  ws.close();
  server.close();

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll robot.js handshake tests passed.');
}

main().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
