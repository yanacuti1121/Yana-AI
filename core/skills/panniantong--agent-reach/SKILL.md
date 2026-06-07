---
name: panniantong--agent-reach
description: "Agent Reach — give AI agent internet eyes: Twitter/X, Reddit, YouTube, GitHub, RSS, Xiaohongshu, Weibo... zero config, free, local-only credentials. Claude Code compatible. MIT."
allowed-tools: Bash, Read
user-invocable: true
---

Agent Reach: một lệnh cài xong — AI agent đọc được Twitter, Reddit, YouTube, GitHub, RSS và 10+ platform khác. No paid API, credentials local.

## Install

```bash
# Nói với agent:
# "Install agent-reach from [provided URL]"
# Agent tự chạy installer

# Hoặc manual:
agent-reach install
```

## Supported Platforms

```
Web browsing   — Jina Reader (any URL → markdown)
Twitter/X      — twitter-cli
Reddit         — rdt-cli
YouTube        — yt-dlp (video info + transcript)
Bilibili       — yt-dlp
GitHub         — gh CLI
RSS            — feedparser
Xiaohongshu    — rednote-mcp
Douyin         — yt-dlp
LinkedIn       — (browser-based)
WeChat         — WeChat RSS
Weibo          — weibo-cli
V2EX           — RSS
Xueqiu         — (finance platform)
```

## Diagnostics

```bash
agent-reach doctor   # check which platforms đang hoạt động
agent-reach list     # list installed backends
agent-reach uninstall --clean  # xóa hết kể cả credentials
```

## Architecture

```
"Scaffolding, not framework"
Each platform = independent backend → swap bất kỳ cái nào không ảnh hưởng cái khác
Installer creates skill file → agent tự nhận ra khi nào invoke

Safety mode: --dry-run preview trước khi install system packages
```

## Compatibility

Claude Code, Cursor, OpenClaw (Open Claude Code), Windsurf, và các agent có tool-use.

## Khi nào dùng

- Agent cần đọc social media / news để research
- Tự động monitor Reddit/Twitter về topic cụ thể
- Fetch YouTube transcript để summarize video
- Thay thế paid social media API

## Source

https://github.com/Panniantong/Agent-Reach · MIT · +148⭐/week
