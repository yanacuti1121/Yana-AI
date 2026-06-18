# Hacker News — Show HN

## Title
```
Show HN: Yana AI – Safety OS for AI coding agents (Rust runtime, 9-layer gates, 3,432 skills)
```

## Body
```
I'm 17, from Vietnam. I spent the last month building a safety layer for AI coding agents after 
watching Claude Code and Cursor make real mistakes — force-push to main, rm -rf the wrong directory, 
suggest installing typosquatted packages.

Yana AI sits between the agent and your system. Every tool call passes through 9 gates before executing.

What each gate catches:
- L1 Anti-evasion: base64 decode+exec, pipe-to-shell (curl | bash)
- L2 Shell sanitization: unquoted variables, metacharacter injection
- L3 Egress: SSRF to 169.254.169.254 (AWS metadata), RFC1918 ranges
- L4 Supply chain: typosquatting detection (req-uests vs requests), CVE scan before every install
- L5 Blast radius: caps how destructive a single action can be
- L6 Permission tiers: agents have R/W/X/P authority levels
- L7 ECDSA signing: generated code signed before execution
- L8 Merkle audit log: hash-chained, tamper-detected instantly
- L9 Sovereign gate: human can freeze all agents, full rollback to last verified snapshot

Beyond the safety gates:
- yana-ai scan: security scanner — secrets, CVEs, supply chain risks
- yana-ai graph: knowledge graph — file deps, import resolution (Rust/TS/Python/Go)
- yana-ai map: blast radius map — what can the agent actually touch in your repo?
- yana-ai vault: searchable skill library
- yana-ai doctor: full system health check

3,432 skill definitions, 93 specialist agents, 61 enforced rules, 46 hooks.
12 harness adapters: Claude Code, Cursor, OpenCode, Zed, Gemini, Copilot, Aider.

The Rust runtime (yana-rt) is 1256x faster than the Python equivalent on a 10k-file repo.

Total: 1,026,000 lines, 15,502 files. One person, one month.

Repo: https://github.com/yanacuti1121/yana-ai
Docs: https://yanacuti1121.github.io/yana-ai/

Happy to go deep on any of the gate implementations or the Rust architecture.
```

---

## Notes
- Post Tuesday–Thursday 9–11am EST
- Reply every comment in first 2 hours
- Don't say "excited" or "thrilled" — HN hates that
- If asked about the 3,432 skills: honest answer — mix of curated + imported, all searchable
