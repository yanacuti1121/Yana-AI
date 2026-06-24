---
name: ai-system-prompts-intel
description: "Intelligence on leaked/published system prompts from 30+ AI coding tools — Cursor, Windsurf, Claude Code, GitHub Copilot, Devin, v0, Lovable, Replit, Warp, Perplexity. Use for competitive analysis, prompt engineering research, understanding how other tools instruct their models. Triggers on: 'system prompt of cursor', 'windsurf system prompt', 'claude code prompt', 'copilot system prompt', 'devin prompt', 'AI tool system prompt', 'leaked AI prompts', 'how cursor instructs AI', 'competitive prompt analysis', 'prompt engineering research', 'v0 system prompt', 'replit agent prompt'."
origin: x1xhlol/system-prompts-and-models-of-ai-tools (141k⭐)
license: see repo
version: "1.0.0"
compatibility: "yana-ai >= 0.41.0"
allowed-tools: Read, WebFetch
---

# AI System Prompts Intelligence
# Source: x1xhlol/system-prompts-and-models-of-ai-tools (141k⭐)
# Tier: TIER 3 — RESEARCH

Tập hợp system prompts từ 30+ AI coding tools đã bị leak hoặc công bố — dùng cho nghiên cứu prompt engineering và phân tích cạnh tranh.

**Do NOT use for:** tái sử dụng nguyên văn prompts của tool khác (vi phạm IP), hack hay bypass các tool này.

---

## Tools được cover

```
Code editors/IDEs:
  Cursor          Windsurf        VSCode Agent
  Xcode           Trae            Qoder

AI coding assistants:
  Claude Code     GitHub Copilot  Devin AI
  CodeBuddy       Comet

Low-code/gen UI:
  v0 (Vercel)     Lovable         Replit
  Same.dev        Leap.new

Research/productivity:
  Perplexity      NotionAI        Manus
  Warp.dev        Cluely
```

---

## Key patterns học được từ các tool hàng đầu

### Cursor — instruction style
```
- Explicit "do not" rules chiếm ~40% prompt
- Định nghĩa rõ từng tool và khi nào KHÔNG dùng
- Có section riêng về memory và context management
- Format: imperative, ngắn gọn, không giải thích
```

### GitHub Copilot — scope control
```
- Hard-coded scope limits ("only suggest completions for the current file")
- Explicit rejection of tasks outside coding domain
- Safety framing: "you are a coding assistant, not a general AI"
- Model chaining: fast model cho completions, slower cho chat
```

### Devin AI — agentic pattern
```
- Step-by-step planning trước khi execute (planning phase mandated)
- Explicit checkpoint requirements sau mỗi destructive action
- Tool use hierarchy: read first, write only after verify
- Error recovery: retry ≤ 3 lần, escalate nếu vẫn fail
```

### v0 (Vercel) — output constraints
```
- Strict format enforcement (JSX only, no raw HTML)
- Component isolation rules
- Explicit "never use" library list
- Design system tokens bắt buộc (no arbitrary hex)
```

### Windsurf — memory integration
```
- Session memory được inject vào prompt đầu mỗi turn
- Memories phân loại: factual vs preference vs constraint
- Explicit instruction về khi nào update memory vs bỏ qua
```

---

## Patterns áp dụng cho Yana AI

Những gì các tool hàng đầu làm và Yana AI đã có hoặc chưa:

| Pattern | Tool nguồn | Yana AI status |
|---------|-----------|----------------|
| Explicit "do not" rules (~40%) | Cursor | ✅ Có trong mỗi rule file |
| Planning phase bắt buộc | Devin | ✅ `/plan` + `golden-principles.md` |
| Scope limit per session | Copilot | ✅ `64-scope-drift-law.md` |
| Memory injection mỗi turn | Windsurf | ✅ L1/L2 memory system |
| Tool use hierarchy | Devin | ✅ `agent-hierarchy-law.md` |
| Design system enforcement | v0 | ✅ `color-rules.md` + `typography-rules.md` |
| Checkpoint sau destructive action | Devin | ✅ `63-autonomous-session-law.md` |
| Safety framing | Copilot | ✅ `00-meta-rule-enforcer.md` |

---

## Đọc prompt gốc

```bash
# Clone repo
git clone https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools
cd system-prompts-and-models-of-ai-tools

# Xem danh sách tools
ls

# Đọc prompt của một tool cụ thể
cat "Cursor/system_prompt.txt"
cat "Claude Code/system_prompt.txt"
cat "Windsurf/system_prompt.txt"
```

---

## Competitive intelligence — điểm Yana AI khác biệt

```
✅ Yana AI có:     Safety gates runtime (các tool khác không có)
✅ Yana AI có:     Rust core với AST scanning trước khi execute
✅ Yana AI có:     3,518 skills (vs 50 built-in tools của Devin)
✅ Yana AI có:     Multi-tier L1/L2 memory (Windsurf chỉ có 1 tầng)

⚠ Yana AI chưa:  Visual workflow builder (Dify có)
⚠ Yana AI chưa:  One-click deployment flow (Replit có)
```

---

## Anti-Fake-Pass Checks

```
❌ FAIL nếu dùng skill này để copy nguyên văn prompt của tool khác
❌ FAIL nếu claim "Cursor does X" mà không reference file prompt cụ thể
✅ PASS khi: phân tích pattern, không copy content
✅ PASS khi: link đến file gốc trong repo thay vì quote dài
```

## See also

- `deep-research` — research sâu hơn về một tool cụ thể
- `market-research` — phân tích cạnh tranh rộng hơn
