---
name: ai-system-prompts-intel
description: "Intelligence on leaked/published system prompts from 30+ AI coding tools (Cursor, Windsurf, Claude Code, GitHub Copilot, Devin, v0, Lovable, Replit, Warp) and general chat products (Claude, ChatGPT, Gemini, Grok, Perplexity, Mistral, Notion AI). Use for competitive analysis, prompt engineering research, understanding how other tools/products instruct their models. Triggers on: 'system prompt of cursor', 'windsurf system prompt', 'claude code prompt', 'copilot system prompt', 'devin prompt', 'AI tool system prompt', 'leaked AI prompts', 'how cursor instructs AI', 'competitive prompt analysis', 'prompt engineering research', 'v0 system prompt', 'replit agent prompt', 'chatgpt system prompt', 'gemini system prompt', 'grok system prompt', 'how does claude.ai instruct itself'."
origin: x1xhlol/system-prompts-and-models-of-ai-tools (141k⭐, coding tools) + asgeirtj/system_prompts_leaks (56k⭐, CC0, general chat products)
license: see each repo
version: "2.0.0"
compatibility: "yana-ai >= 0.41.0"
allowed-tools: Read, WebFetch
---

# AI System Prompts Intelligence
# Sources: x1xhlol/system-prompts-and-models-of-ai-tools (141k⭐, coding tools)
#          asgeirtj/system_prompts_leaks (56k⭐, CC0, general chat products)
# Tier: TIER 3 — RESEARCH

Tập hợp system prompts từ 30+ AI coding tools và các chat product lớn (Claude, ChatGPT, Gemini, Grok, Perplexity, Mistral, Notion AI) đã bị leak hoặc công bố — dùng cho nghiên cứu prompt engineering và phân tích cạnh tranh.

**Do NOT use for:** tái sử dụng nguyên văn prompts của tool/product khác (vi phạm IP dù nguồn tổng hợp là CC0 — nội dung leak bên trong không tự động CC0 theo), hack hay bypass các tool này. Đặc biệt: không copy verbatim các đoạn chính sách nhạy cảm (self-harm, child-safety...) từ chat products — chỉ phân tích structure, không nhân bản nội dung.

---

## Tools/products được cover

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

Research/productivity (coding-adjacent):
  Perplexity      NotionAI        Manus
  Warp.dev        Cluely

General chat products (asgeirtj source):
  Claude (claude.ai)   ChatGPT/Codex   Gemini (all surfaces)
  Grok (xAI)           Perplexity Comet   Mistral (Le Chat)
  Notion AI            Meta AI            Microsoft Copilot
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

## Key patterns — general chat products

Register khác hẳn coding tools: ít "do this task", nhiều "how to behave
as a product used by millions". Quan sát từ mẫu đại diện, không toàn bộ.

### Claude (claude.ai web/mobile/desktop) — worked policy, not terse rules
```
- Các domain nhạy cảm (child-safety, self-harm, political evenhandedness)
  được viết thành đoạn văn suy luận đầy đủ (why + edge cases), không phải
  bullet "do/don't" ngắn như coding tools
- Deferred tool discovery: danh sách tool hiển thị chỉ là một phần, còn
  lại load qua tool_search khi cần — kiến trúc giống hệt ToolSearch của
  Yana AI cho MCP tools (xem network-egress-law.md, agent-tool-poisoning-
  guard.md) — không phải trùng hợp, đây là pattern chung cho context
  budget lớn
- Nguồn ghi nhận claude.ai's own prompt yêu cầu Claude không tự nhận
  hành vi là "do system prompt yêu cầu" khi trả lời người dùng cuối —
  observation về prompt của SẢN PHẨM KHÁC, không phải chỉ thị cho phiên
  làm việc hiện tại đang đọc skill này
```

### Gemini — component-based response rendering
```
- Response không chỉ là text: có tag riêng cho Image/Carousel/Sequence/
  Timeline/GenerateWidget/ElicitationsGroup/FollowUp — model chọn
  component phù hợp thay vì luôn trả markdown thuần
- Section riêng cho "User Data Hierarchy Conflict Resolution" — quy tắc
  rõ ràng khi saved memory mâu thuẫn với yêu cầu hiện tại
```

### Grok (xAI) — platform-native tool integration
```
- Có bash/read_file/write_file/edit_file như một coding agent, không chỉ
  chat — ranh giới "chat product" vs "agentic tool" khá mờ ở Grok
- Tool riêng cho X/Twitter (x_keyword_search, x_semantic_search,
  x_user_search, x_thread_fetch) — tích hợp sâu vào platform riêng của
  công ty mẹ, pattern chỉ áp dụng được nếu có platform tương tự
```

### Perplexity Comet & Mistral — verbose, example-driven guidelines
```
- Comet: mỗi tool (browser control, email/calendar, code interpreter,
  memory) có block "Tool Guidelines" riêng, khá dài — ưu tiên rõ ràng
  hơn terseness khi tool nhiều edge case
- Mistral: quy tắc format cụ thể kèm ví dụ minh họa (vd. "THE DIVIDER
  RULES" cho chia section) — không chỉ mô tả chung chung "format rõ"
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
| Deferred tool discovery (load-on-demand) | Claude (claude.ai) | ✅ `ToolSearch` for MCP/deferred tools |
| Per-tool guideline blocks (long-form, not terse) | Perplexity Comet | ⚠ Yana AI chưa — rule files hiện terser hơn |

---

## Đọc prompt gốc

```bash
# Coding tools
git clone https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools
cd system-prompts-and-models-of-ai-tools
ls
cat "Cursor/system_prompt.txt"
cat "Claude Code/system_prompt.txt"
cat "Windsurf/system_prompt.txt"

# General chat products (CC0)
git clone https://github.com/asgeirtj/system_prompts_leaks
cd system_prompts_leaks
ls  # Anthropic/ OpenAI/ Google/ xAI/ Perplexity/ Mistral/ Notion/ Meta/ Microsoft/ Qwen/
cat "Anthropic/Official/README.md"  # dated snapshots of claude.ai's own system prompt over time
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
❌ FAIL nếu dùng skill này để copy nguyên văn prompt của tool/product khác
❌ FAIL nếu claim "Cursor does X" hoặc "Claude's system prompt says X" mà
   không reference file nguồn cụ thể (path trong repo tương ứng)
❌ FAIL nếu reproduce verbatim các đoạn chính sách nhạy cảm (self-harm,
   child-safety, weapons...) từ chat products — kể cả khi nguồn CC0
✅ PASS khi: phân tích pattern/structure, không copy content
✅ PASS khi: link đến file gốc trong repo thay vì quote dài
```

## See also

- `deep-research` — research sâu hơn về một tool cụ thể
- `market-research` — phân tích cạnh tranh rộng hơn
