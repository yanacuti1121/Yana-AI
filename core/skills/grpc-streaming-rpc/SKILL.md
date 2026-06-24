---
name: grpc-streaming-rpc
description: gRPC bidirectional streaming RPC over HTTP/2 for real-time agent clusters. Service definition, unary/server-stream/bidi-stream patterns, deadline propagation, and TLS mutual auth. Sources: grpc/grpc-node (Apache-2.0).
origin: yana-ai — synthesized from grpc/grpc-node (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.50
---

# /grpc-streaming-rpc

## When to Use

- Real-time bidirectional streams between agents (task dispatch ↔ progress events)
- Strongly-typed RPC contracts enforced by .proto service definition
- Long-lived connections with automatic flow control (HTTP/2 multiplexing)
- mTLS: mutual TLS authentication between agent nodes

## Do NOT use for

- Simple request-response over HTTP (use [[http-client-auth-patterns]])
- Browser clients (gRPC-Web requires a proxy; use WebSocket instead)

---

## Service definition (.proto)

```protobuf
syntax = "proto3";
package yamtam;

service AgentBus {
  // Unary
  rpc DispatchTask(TaskRequest) returns (TaskAck);

  // Server streaming: subscribe to events from a task
  rpc WatchTask(WatchRequest) returns (stream TaskEvent);

  // Bidirectional streaming: interactive agent session
  rpc AgentSession(stream AgentMessage) returns (stream AgentMessage);
}

message TaskRequest  { string tool = 1; string params_json = 2; }
message TaskAck      { string task_id = 1; bool accepted = 2; }
message WatchRequest { string task_id = 1; }
message TaskEvent    { string task_id = 1; string status = 2; bytes output = 3; }
message AgentMessage { string agent_id = 1; bytes payload = 2; }
```

---

## gRPC server (Node.js)

```javascript
import grpc      from '@grpc/grpc-js'
import protoLoader from '@grpc/proto-loader'

const packageDef = protoLoader.loadSync('agent_bus.proto', {
  keepCase:   true,
  longs:      String,
  enums:      String,
  defaults:   true,
  oneofs:     true,
})
const { yamtam } = grpc.loadPackageDefinition(packageDef)

const server = new grpc.Server()

server.addService(yamtam.AgentBus.service, {
  dispatchTask(call, callback) {
    const { tool, params_json } = call.request
    const taskId = `task-${Date.now()}`
    callback(null, { task_id: taskId, accepted: true })
  },

  watchTask(call) {
    const { task_id } = call.request
    let seq = 0
    const timer = setInterval(() => {
      call.write({ task_id, status: 'running', output: Buffer.from(`step ${seq++}`) })
      if (seq >= 5) { clearInterval(timer); call.end() }
    }, 500)
    call.on('cancelled', () => clearInterval(timer))
  },

  agentSession(call) {
    call.on('data', (msg) => {
      call.write({ agent_id: 'server', payload: msg.payload })
    })
    call.on('end', () => call.end())
  },
})

server.bindAsync('0.0.0.0:50051',
  grpc.ServerCredentials.createInsecure(),
  () => server.start()
)
```

---

## gRPC client with deadline

```javascript
const client = new yamtam.AgentBus(
  'localhost:50051',
  grpc.credentials.createInsecure()
)

// Unary with 5s deadline
const deadline = new Date(Date.now() + 5000)
client.dispatchTask(
  { tool: 'bash', params_json: '{"cmd":"ls"}' },
  { deadline },
  (err, response) => {
    if (err) console.error('[grpc] error:', err.code, err.message)
    else     console.log('[grpc] ack:', response.task_id)
  }
)

// Server streaming
const stream = client.watchTask({ task_id: 'task-123' })
stream.on('data',  (event) => console.log('[grpc] event:', event.status))
stream.on('error', (err)   => console.error('[grpc] stream error:', err))
stream.on('end',   ()      => console.log('[grpc] stream done'))
```

---

## mTLS credentials

```javascript
import { readFileSync } from 'fs'

const credentials = grpc.credentials.createSsl(
  readFileSync('ca.crt'),          // CA certificate
  readFileSync('agent.key'),       // client private key
  readFileSync('agent.crt'),       // client certificate
)
const client = new yamtam.AgentBus('agent-node-2:50051', credentials)
```

---

## Anti-Fake-Pass Checklist

```
❌ createInsecure() in production → plaintext RPC, credentials interceptable
❌ No deadline on unary calls → hangs forever if server is down
❌ call.write() after call.end() on server stream → gRPC error, client receives RST_STREAM
❌ Bidirectional stream: not handling 'error' event → unhandled rejection crashes process
❌ protoLoader without keepCase: true → camelCase conversion breaks field name matching
❌ server.bindAsync callback not checked → server silently fails to bind on port conflict
```
