# yana-pixel-bridge

Relays Claude Code's Agent/Task tool-call hook events to a [Pixel Office](https://github.com/harishkotra/agent-office)
frontend, so dispatching a subagent shows up visually as a character walking
to a desk and working — a status monitor, not a place where real work happens.

The actual work always happens in the Claude Code session itself. This bridge
only forwards `start`/`stop` events; it does not hand off tasks to agent-office's
own agents, and agent-office's agents do not touch the Yana-AI codebase.

## How it works

```
Claude Code calls Agent/Task tool
  → .claude/hooks/agent-pixel-notify.sh fires
  → POST /webhook/agent-hook on this bridge
  → bridge broadcasts via socket.io (any listening frontend)
  → bridge forwards to agent-office's /api/external-agent-event (best-effort)
```

If agent-office isn't running, the bridge logs a warning and continues —
nothing breaks.

## Run

```bash
cd tools/yana-pixel-bridge
npm install
npm start          # binds 127.0.0.1:5000, local dev only
```

Check it's alive: `curl http://127.0.0.1:5000/health`

## Optional: visual frontend (agent-office)

agent-office is a separate sibling project, not part of this repo. To see
the pixel-art office react to events:

```bash
cd /workspaces/agent-office
npm install && npm run build
npm run start --workspace=@agent-office/server   # ws://localhost:3000
npm run dev --workspace=@agent-office/ui          # http://localhost:5173
```

Without Ollama configured, agent-office's own characters won't think on
their own — they'll just react to the events this bridge forwards, which is
enough for visualizing Claude Code's dispatch activity.

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Bridge listen port |
| `HOST` | `127.0.0.1` | Bridge listen host (loopback only) |
| `AGENT_OFFICE_URL` | `http://127.0.0.1:3000` | Where to forward events |
