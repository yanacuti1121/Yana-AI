# Reddit Posts

---

## r/ClaudeAI  ← đăng trước

**Title:**
```
I built a safety layer for Claude Code — intercepts dangerous actions before they execute (3,432 skills, Rust runtime, open source)
```

**Body:**
```
We all know Claude Code is powerful. But it also makes real mistakes — force-push to main, 
wrong rm -rf, suggesting packages that turn out to be typosquatted. By the time you notice, 
it's done.

I spent the last month building Yana AI: a hook layer that sits between Claude Code 
and your system, acting like a vigilant safety net for every tool call.

What it catches:
- git push --force → blocked instantly
- curl http://169.254.169.254 (AWS metadata SSRF) → blocked at egress gate
- pip install req-uests (typosquatted) → flagged before install
- Agent claiming "tests pass" without running them → verification gate
- Secrets in code → scan before commit

Also works with Cursor, OpenCode, Zed, Gemini, Copilot — 12 harness adapters total.

What's included:
- 3,432 skill definitions (frontend, backend, AI/LLM, K8s, security, WASM...)  
- 93 specialist agent definitions
- Rust CLI: yana-ai scan, yana-ai graph, yana-ai vault, yana-ai doctor
- Blast radius map — shows exactly what the agent can touch in your repo

Install:
  npm install yana-ai && npx yana-ai-install

Built by one person (17yo, Vietnam) in ~1 month. Apache 2.0, free forever.

Repo: https://github.com/yanacuti1121/yana-ai
Docs: https://yanacuti1121.github.io/yana-ai/
```

---

## r/rust  ← đăng song song với HN

**Title:**
```
yana-rt: Rust CLI for AI agent safety — 17 subcommands, 1256x faster than Python (scan, graph, vault, blast-radius map)
```

**Body:**
```
Released yana-rt on crates.io — the Rust runtime powering Yana AI, 
a safety OS for AI coding agents.

cargo install yana-rt

17 subcommands. The main ones:

yana-ai scan .       — secrets, CVEs, supply chain risks
yana-ai graph .      — knowledge graph (import resolution: Rust/TS/Python/Go)
yana-ai vault search — search 3,432 skill definitions
yana-ai hunt .       — OWASP pattern hunting (injection, SSRF, XSS...)
yana-ai map .        — blast radius map (what can the agent access?)
yana-ai fix .        — auto-fix rule violations
yana-ai doctor .     — full system health check
yana-ai ci           — CI gate runner (826 rule checks)
yana-ai watch .      — file watcher with hook triggers

Stack: clap, serde, walkdir, regex, sha2, ureq, rayon

Benchmark: yana-ai scan on a 10k-file repo → 1256x faster than the Python equivalent.

Repo: https://github.com/yanacuti1121/yana-ai
Crate: https://crates.io/crates/yana-rt
```

---

## r/artificial  ← sau HN

**Title:**
```
Built a 9-layer safety system for AI coding agents — here's what each gate catches and why
```

**Body:**
```
After months of using Claude Code and Cursor daily, I catalogued every dangerous action 
an AI agent can take and built a gate for each. Here's what surprised me:

The biggest risk isn't rm -rf — it's supply chain.
Agents suggest pip install req-uests (typosquatted). Users trust and run it.
Gate: pattern-match against top packages, flag 1-2 char differences.

SSRF via AI is real.
Agents with WebFetch tools can be prompted to hit 169.254.169.254 (AWS metadata).
Gate: resolve DNS before request, check against RFC1918 + link-local ranges.

Prompt injection through tool results.
External URL → agent fetches → result says "ignore previous instructions".
Gate: scan every tool result for injection markers before returning to context.

Context flooding.
Attacker controls a tool result → returns 500KB → blows context window.
Gate: 16KB hard cap on all tool results.

Audit logs can be deleted.
An agent can write to logs, then delete evidence of its own mistakes.
Gate: Merkle hash chain — every entry includes SHA256 of previous.
Deletion breaks the chain → detected instantly.

The full system (Yana AI) is open source:
https://github.com/yanacuti1121/yana-ai

1,026,000 lines, built by one person (17yo) in ~1 month. AMA.
```

---

## r/programming  ← sau r/artificial

**Title:**
```
How I built a Merkle-chained audit log and 9-layer gate system for AI coding agents in Rust (Show r/programming)
```

**Body:**
```
I built Yana AI — a safety OS for AI coding tools — and wanted to share some 
implementation details that might be interesting.

Two things I'm most proud of technically:

1. Merkle audit chain
Every agent action is logged as: timestamp | session | event | message | prev_hash | this_hash
where this_hash = SHA256(all fields including prev_hash).
If any line is deleted or modified, the chain breaks → tamper detected instantly.
This was inspired by Google's Trillian verifiable log.

2. Blast radius mapping (yana-ai map)
Reads agent configs, MCP settings, .claude/settings.json, GitHub workflows.
Outputs a permission map: what files/commands/endpoints can this agent actually reach?
Useful for auditing before you give an agent more permissions.

Other gates: SSRF prevention (resolves DNS then checks RFC1918/link-local), 
supply chain (typosquatting + CVE scan), shell sanitization (shellcheck-inspired), 
ECDSA code signing, BFT consensus for core infra writes.

Stack: Rust (yana-rt) + Python CLI + 46 bash hooks + 61 rule files.

Repo: https://github.com/yanacuti1121/yana-ai

Built by one person in ~1 month, 17yo from Vietnam.
```

---

## Thứ tự đăng
1. **r/ClaudeAI** — ngay, audience rộng nhất
2. **HN Show HN** — cùng ngày hoặc hôm sau
3. **r/rust** — song song với HN
4. **r/artificial** — sau 1-2 ngày
5. **r/programming** — sau r/artificial
