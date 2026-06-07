---
name: openai--codex-plugins
description: "OpenAI Codex Plugins — collection plugin examples cho Codex AI coding agent: Figma, Notion, iOS (SwiftUI), Expo, Netlify, Remotion, Google Slides. Plugin manifest format."
allowed-tools: Read
user-invocable: true
---

openai/plugins: example plugins cho Codex — mỗi plugin là một scaffolding dạy Codex cách build app cho một platform cụ thể.

## Plugin Structure

```
plugins/<name>/
  .codex-plugin/
    plugin.json     ← required manifest
  skills/           ← optional skill files
  agents/           ← optional agent definitions
  commands/         ← optional slash commands
  hooks/            ← optional hooks
  assets/           ← optional assets
```

## Available Example Plugins

```
figma       — Code to Canvas, Code Connect, design system rules
notion      — planning, research, meetings, knowledge capture
ios         — SwiftUI, native iOS patterns
macos       — SwiftUI + AppKit patterns
web         — web app development patterns
expo        — React Native, SDK upgrades, EAS workflows
netlify     — deployment workflows
remotion    — video generation (remotion-creator)
google-slides — presentation generation
```

## Khi nào dùng

- Reference khi muốn tạo Codex plugin cho yamtam
- Template `plugin.json` format
- Xem cách OpenAI structuring agent skills theo platform

## Source

https://github.com/openai/plugins · MIT
