# codexmate

**Source:** SakuraByteCore/codexmate (Apache 2.0)
**Stack:** Node.js, local-first, zero cloud

## When to use

- Quản lý nhiều AI coding tools (Codex, Claude Code, OpenClaw) từ 1 dashboard
- Browse/export sessions cross-tool
- Import/export skills giữa các agent apps
- Cần OpenAI-compatible bridge cho Codex
- Orchestrate tasks với DAG dependency tracking
- Expose local tools qua MCP stdio

## Do NOT use for

- Cloud-based agent management
- Production deployment (early stage)

---

## Install

```bash
# Homebrew (macOS / Linux)
brew tap SakuraByteCore/codexmate
brew install codexmate

# npm
npm install -g codexmate

# curl
curl -fsSL https://raw.githubusercontent.com/SakuraByteCore/codexmate/main/scripts/install.sh -o /tmp/codexmate-install.sh
# Inspect first: head -40 /tmp/codexmate-install.sh — then run if safe:
bash /tmp/codexmate-install.sh
```

---

## Core commands

```bash
codexmate run          # start dashboard (CLI + Web UI)
codexmate status       # live agent sync — show Codex/Claude config & status
codexmate sessions     # list + filter sessions across all tools
codexmate sessions export --tool claude --format json
codexmate skills       # local skills marketplace
codexmate skills import ./my-skill.md
codexmate tasks        # DAG task queue
codexmate bridge start # OpenAI-compatible bridge (port 3100)
codexmate update       # self-update
```

---

## Skills Marketplace (YAMTAM integration)

Codexmate có skills marketplace tương thích với format YAMTAM:

```bash
# Export YAMTAM skills sang codexmate
codexmate skills import core/skills/moss-tts-nano/SKILL.md

# Import skill từ codexmate về YAMTAM
codexmate skills export my-skill > core/skills/my-skill/SKILL.md
```

---

## OpenAI Bridge

```bash
# Start bridge — Codex Responses API → OpenAI format
codexmate bridge start --port 3100

# Dùng với bất kỳ OpenAI-compatible client
curl http://localhost:3100/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"codex","messages":[{"role":"user","content":"hello"}]}'
```

---

## MCP Integration

```bash
# Expose local tools via MCP stdio
codexmate mcp start

# Add to Claude Code settings
# .claude/settings.json → mcpServers → codexmate
```

```json
{
  "mcpServers": {
    "codexmate": {
      "command": "codexmate",
      "args": ["mcp", "start"]
    }
  }
}
```

---

## Session Browser

```bash
# Search sessions across Codex / Claude / Gemini
codexmate sessions --search "authentication"
codexmate sessions --tool claude --since 7d
codexmate sessions export --output sessions.json
```

---

## Web UI

```bash
codexmate run --ui   # mở web dashboard tại http://localhost:4200
```

Dashboard có: provider switcher, session browser, usage analytics, task queue, prompt templates.

---

## References

- Repo: https://github.com/SakuraByteCore/codexmate
- Docs: https://sakurabytecore.github.io/codexmate/
- npm: https://www.npmjs.com/package/codexmate
