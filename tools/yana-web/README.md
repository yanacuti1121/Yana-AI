<p align="center">
  <h1 align="center">🌊 Yana AI — Web</h1>
</p>

<p align="center">
  <strong>The first interface built on YAMTAM core — chat, route, and orchestrate without touching the infrastructure.</strong>
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
User → Yana AI → YAMTAM Core (Router · Safety · Context) → Model
```

Zero-dependency Node.js server + React (via Babel standalone) glass-morphism UI.
No build step. No signup. Bring your own API key.

## Run

```bash
node server.js                 # → http://127.0.0.1:8081
PORT=3000 node server.js       # custom port
HOST=0.0.0.0 node server.js    # expose beyond loopback (containers only)
```

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

## Providers

Anthropic · OpenAI · Gemini · Groq · DeepSeek · OpenRouter — vision support where the provider allows it, live model lists for Groq/OpenRouter.

---

Part of [YAMTAM ENGINE](../../README.md) · Apache 2.0
