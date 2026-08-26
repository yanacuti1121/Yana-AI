<p align="center">
  <h1 align="center">🌊 Yana AI — Web</h1>
</p>

<p align="center">
  <strong>The first interface built on Yana AI core — chat, route, and orchestrate without touching the infrastructure.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Node.js_≥18-339933?style=flat-square&logo=node.js" />
  <img src="https://img.shields.io/badge/dependencies-zero-2f7e6e?style=flat-square" />
  <img src="https://img.shields.io/badge/keys-AES--256--GCM-7d6aa8?style=flat-square" />
  <img src="https://img.shields.io/badge/data-100%25_real-b96b80?style=flat-square" />
  <img src="https://img.shields.io/badge/providers-6-3a7ca5?style=flat-square" />
</p>

---

```
User → Yana AI → Yana AI Core (Router · Safety · Context) → Model
```

Zero-dependency Node.js server + React (via Babel standalone) glass-morphism UI.
No build step. No signup. Bring your own API key.

## Run

```bash
npm start                      # build:desktop, then node server.js → http://127.0.0.1:8081
PORT=3000 npm start            # custom port
HOST=0.0.0.0 npm start         # expose beyond loopback (containers only)
```

`npm start` runs `build:desktop` first — the UI is served from `desktop/`
(Vite build output), so a plain `node server.js` only works if that build
already exists from a previous run.

## Screens — all real data

| Screen | Source |
|---|---|
| 🌊 Welcome | first-run intro page — what Yana is, feature highlights, "Get started" → login |
| 🔑 Login | create password on first run (scrypt hash), then HttpOnly session cookie — AI-app style, VI/EN, remember-30d, Caps Lock hint, strength meter |
| 🏠 Dashboard | `/api/status` (MANIFEST) · `/api/dashboard` (L1 memory + audit log + uptime) |
| 💬 Chat | SSE streaming to 6 providers, provider picker, route classify + skill, history survives reloads |
| 🎯 Missions | `/api/missions` — file-backed CRUD, "Plan with Yana" LLM task breakdown, click-to-advance tasks |
| 🤖 Agent Space | `/api/agents` — 95 real agents from `core/agents/` frontmatter |
| 🌸 Memory Garden | `/api/memories` — L1 atomic facts with confidence + freshness |
| 🧩 Skills | `/api/skills` — on-disk counts grouped by import pack |
| 🔌 Providers | encrypted vault status + `/api/models` live model lists + `/api/usage` |

## Security

- 🔑 **Login gate** (`auth.js`) — single-user password (scrypt, random salt) in `.yana/auth.json` (mode 600), 256-bit session tokens in an HttpOnly SameSite=Lax cookie, login rate-limited 5/15min per IP. Every page and API except `/health`, `/login.html`, and `/api/auth/*` requires a session.
- 🔐 **Key vault** (`crypto-store.js`) — provider keys encrypted at rest with AES-256-GCM; the master key is a non-extractable WebCrypto `CryptoKey` in IndexedDB. localStorage only ever holds ciphertext. See rule `66-client-secret-encryption-law`.
- 🛡️ Server binds `127.0.0.1` by default, per-IP rate limiting (60 POST/min), CSP + security headers, path-traversal-proof static serving, no API keys in URLs.

## API

```
GET  /health             GET  /api/status        GET  /api/dashboard
GET  /api/agents         GET  /api/memories      GET  /api/skills
GET  /api/usage          GET  /api/missions      POST /api/missions
POST /api/missions/update POST /api/missions/delete
POST /api/models         POST /api/route         POST /api/chat
POST /api/index          GET  /api/auth/status   POST /api/auth/setup
POST /api/auth/login     POST /api/auth/logout
```

## Robot bridge

`robot.js` lets an ESP32 device speaking the XiaoZhi/yana-robot WebSocket
protocol (`docs/websocket.md`, `docs/mcp-protocol.md` in the `yana-robot`
firmware repo) use this server as its voice AI backend, instead of
`xiaozhi.me` or a self-hosted XiaoZhi server. No firmware changes needed —
point the device's server URL at `wss://<this-host>/robot/ws`.

- Device connects, sends `hello`; this server replies `hello` and (if the
  device advertises `features.mcp`) opens an MCP session as the **client**
  (the device is the MCP **server** — it owns the tools).
- Voice pipeline: ASR + chat both use `YANA_ROBOT_LLM_PROVIDER` (default
  `groq`) via the same `PROVIDERS`/`connectToProvider` table `/api/chat`
  uses (now in `lib/providers.js`). Groq's ASR endpoint
  (`/openai/v1/audio/transcriptions`) reuses the same key as chat — no
  second provider needed.
- TTS defaults to the VieNeu-TTS v3 Turbo sidecar (`tts-sidecar/`, same as
  `/api/tts`). Its ONNX stream is converted from 48 kHz float audio to 24 kHz
  mono PCM16, then Opus-encoded and paced in 60 ms packets for the device.
  VieNeu only produces Vietnamese/English — set `YANA_ROBOT_TTS_PROVIDER=openai`
  to speak other languages instead (e.g. Korean), via OpenAI's
  `/v1/audio/speech` endpoint (requires its own API key; voices are
  English-optimized but multilingual, following Whisper's language list).
- Tool calls the model decides to make are translated into real MCP
  `tools/call` requests sent to the device (e.g. `self.wheelbot.move_forward`)
  — see the `yana-robot` repo's board `README.md` for the full tool list.

Env vars (Railway/production):

| Var | Purpose |
|---|---|
| `YANA_ROBOT_DEVICE_TOKEN` | Bearer token the device must send (`Authorization` header) to connect. Leave unset only for local testing. |
| `YANA_ROBOT_LLM_API_KEY` | API key for `YANA_ROBOT_LLM_PROVIDER`, used for both chat and ASR. |
| `YANA_ROBOT_LLM_PROVIDER` | Key into `PROVIDERS` (default `groq`). |
| `YANA_ROBOT_LLM_MODEL` | Overrides the provider's default chat model. |
| `YANA_ROBOT_ASR_MODEL` | Groq transcription model (default `whisper-large-v3-turbo`). |
| `YANA_ROBOT_WS_PATH` | WebSocket path (default `/robot/ws`). |
| `YANA_ROBOT_TTS_PROVIDER` | `vieneu` (default, local, free, Vietnamese/English) or `openai` (cloud, multilingual — use this for Korean). |
| `YANA_ROBOT_TTS_API_KEY` | API key for OpenAI TTS. Falls back to `YANA_ROBOT_LLM_API_KEY` if unset. |
| `YANA_ROBOT_TTS_OPENAI_MODEL` | OpenAI TTS model (default `gpt-4o-mini-tts`). |
| `YANA_ROBOT_TTS_OPENAI_VOICE` | OpenAI TTS voice (default `alloy`). |
| `YANA_ROBOT_TTS_PACKET_INTERVAL_MS` | Delay between 60 ms Opus packets (default `55`) to avoid overflowing the firmware's 1.2 s decode queue. |

### Local VieNeu-TTS v3 setup

VieNeu v3 requires Python 3.10–3.13. On macOS and CPU servers, use its
torch-free ONNX backend:

```sh
cd tools/yana-web/tts-sidecar
python3.13 -m venv .venv  # or any Python 3.10–3.13
.venv/bin/python -m pip install -r requirements.txt
./run.sh
```

The first synthesis downloads the VieNeu model; `GET http://127.0.0.1:7861/health`
stays lightweight and reports whether it has been loaded. Useful sidecar settings:

| Var | Default | Purpose |
|---|---|---|
| `VIENEU_SIDECAR_PORT` | `7861` | Local sidecar port. |
| `VIENEU_VOICE` | `Phạm Tuyên` | Preset voice used when a request omits `voice`. |
| `VIENEU_BACKEND` | `onnx` | Low-latency CPU streaming backend. |
| `VIENEU_PRECISION` | `int8` | Fast ONNX precision; use `fp32` for maximum quality. |
| `VIENEU_THREADS` | `0` | ONNX worker threads (`0` lets VieNeu choose). |

Compatibility endpoints: `POST /tts` returns a 24 kHz WAV for desktop/mobile;
`POST /tts/stream` returns 24 kHz mono PCM16 for the robot bridge. VieNeu v3
ignores the old `style` field; choose a preset voice to change character.

Not yet verified on real hardware — see `_test_robot.js` for what's covered
(WebSocket handshake + MCP `initialize`/`tools/list` handshake only; the
ASR/chat/TTS pipeline needs a real device + real API calls to test).

**Local testing:** run this server locally (`npm start`, see Run above),
then point the device's server URL at `ws://<your-machine's-LAN-IP>:8081/robot/ws`
instead of the Railway `wss://` URL — same protocol either way, just plain
`ws://` since there's no TLS on localhost.

## Providers

Anthropic · OpenAI · Gemini · Groq · DeepSeek · OpenRouter — vision support where the provider allows it, live model lists for Groq/OpenRouter.

---

Part of [Yana AI](../../README.md) · Apache 2.0
