# Yana AI (the web product)

Moved from the main README (2026-07-05) so the top-level pitch stays short.
Content unchanged from the version that lived in `README.md`.

**[Live →](https://yanai-production.up.railway.app)** · **[Download Desktop →](https://yanacuti1121.github.io/Yana-AI/desktop.html)**

Yana is the first interface built on Yana AI core: a web UI that lets anyone chat with AI, switch providers, and use skill routing without knowing anything about the infrastructure underneath.

```
User → Yana AI → Yana AI Core (Router · Safety · Context) → Model
```

- Zero signup: bring your own API key
- 🔐 **Encrypted key vault** — keys stored AES-256-GCM, master key non-extractable (WebCrypto + IndexedDB), never plaintext
- Multi-provider: Anthropic · Groq · Gemini · OpenAI · DeepSeek · OpenRouter · 9Router · Ollama

**Provider setup**, bring your own key, keys encrypted locally (never sent to Yana AI):

| Provider | Type | Setup |
|----------|------|-------|
| **Claude** | Cloud | API key → [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **OpenAI** | Cloud | API key → [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Gemini** | Cloud | API key → [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| **Groq** | Cloud | API key → [console.groq.com/keys](https://console.groq.com/keys) |
| **DeepSeek** | Cloud | API key → [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) |
| **OpenRouter** | Cloud | API key → [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| **9Router** | Local | `npm install -g 9router` → `9router` (runs on `localhost:20128`) |
| **Ollama** | Local | [ollama.com/download](https://ollama.com/download) → `ollama serve` → `ollama pull llama3.2` |

- 📊 **100% real data** — live provider stats, L1 memory garden, audit-log health panel; zero demo numbers
- Skill routing built in, type naturally and Yana AI dispatches the right agent
- **Non-coding use cases:** learning (Socratic learning assistant), daily work (summarize / plan / draft)
- SSE streaming, mobile-friendly · **[Electron desktop app](https://yanacuti1121.github.io/Yana-AI/desktop.html)** — macOS, Windows, Linux

If Yana AI is the power grid, Yana is the first building plugged into it.

## Built by one person

One person. No team. No funding.

- Hook architecture, safety gates, Python CLI
- Rust runtime (`yana-rt`), 101 agents, 1,989 skills, multi-harness support
- 15 harness adapters (Claude Code, Cursor, Windsurf, Antigravity, Kiro, Zed, Gemini, Copilot, Aider...)

The 1,989 skills cover: frontend, backend, AI/LLM, security, Kubernetes, WebAssembly, DevOps, databases, testing, and more. Two new agent personas cover non-coding use cases: learning (`hoc-tap`) and daily productivity (`daily-assistant`).
