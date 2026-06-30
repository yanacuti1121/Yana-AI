// server.js — Bridge: receives Claude Code agent-dispatch hook events over
// HTTP and relays them two ways:
//   1. socket.io broadcast — any generic frontend that wants raw events
//   2. forward to agent-office's own server — lets ITS Colyseus state/
//      animation (walk to desk, work, idle) drive the visual, no custom
//      rendering needed on our side. agent-office lives as a separate
//      sibling project at /workspaces/agent-office, started independently.
// Local dev tool only — binds to loopback.
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const AGENT_OFFICE_URL = process.env.AGENT_OFFICE_URL || 'http://127.0.0.1:3000';

const app = express();
app.use(express.json({ limit: '64kb' }));

async function forwardToAgentOffice(payload) {
  try {
    const res = await fetch(`${AGENT_OFFICE_URL}/api/external-agent-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) console.warn(`[bridge] agent-office responded ${res.status}`);
  } catch (e) {
    // agent-office not running — fine, this is best-effort
    console.warn(`[bridge] could not reach agent-office: ${e.message}`);
  }
}

const server = http.createServer(app);

// Restrict WebSocket origins to localhost — this is a local dev tool only.
// Wildcard CORS would let any page (including attacker-controlled) open a
// socket while the bridge is running, enabling CSRF-style event injection.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:8081', 'http://127.0.0.1:8081',
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:5000', 'http://127.0.0.1:5000',
  'http://localhost:8080', 'http://127.0.0.1:8080',
]);
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      // Allow requests without an Origin header (e.g. curl, Electron, same-origin)
      if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      cb(new Error(`CORS rejected: ${origin}`));
    },
  },
});

// Loopback-only guard — all endpoints require the request to originate from
// 127.0.0.1 / ::1. Defense-in-depth alongside the HOST=127.0.0.1 bind.
function requireLoopback(req, res, next) {
  const remote = req.socket.remoteAddress || '';
  if (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') {
    return next();
  }
  res.status(403).json({ error: 'Loopback only' });
}

app.get('/health', requireLoopback, (req, res) => {
  res.json({ status: 'ok', clients: io.engine.clientsCount });
});

// Generic event intake — any system (Claude Code hook, another AI tool,
// a script) can POST here as long as it sends this shape.
app.post('/webhook/agent-hook', requireLoopback, (req, res) => {
  const { event, tool_name, agent_type, subagent_type, description } = req.body || {};

  if (!event || !tool_name) {
    return res.status(400).json({ error: 'event and tool_name are required' });
  }

  // Sanitise string fields — clamp length and strip control characters
  const safeDesc = String(description || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 500);

  console.log(`[agent-hook] ${event} | tool=${tool_name} | subagent=${subagent_type || agent_type || '-'} | ${safeDesc}`);

  io.emit('agent_status_changed', {
    event,
    tool_name:   String(tool_name).slice(0, 200),
    agent_type:  String(agent_type || subagent_type || 'subagent').slice(0, 100),
    description: safeDesc,
    ts: new Date().toISOString(),
  });

  // Fire-and-forget — never block or fail the webhook response on this.
  forwardToAgentOffice({ event, description: safeDesc });

  res.sendStatus(200);
});

io.on('connection', (socket) => {
  console.log(`[bridge] frontend connected (${socket.id})`);
  socket.on('disconnect', () => console.log(`[bridge] frontend disconnected (${socket.id})`));
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`Bridge Server running at http://${HOST}:${PORT}`);
});
