---
name: llm-ui-patterns
description: >
  Design UI for LLM-powered features — streaming response display, hallucination
  states, RAG source attribution, generative UI patterns, and AI trust calibration.
  Use when asked to "show streaming output", "display AI response", "cite sources",
  "handle AI errors", "show confidence", "build a chatbot UI", or "design for
  generative AI". Do NOT use for: backend LLM API integration or RAG pipeline
  design — those are separate concerns.
origin: adapted:ux-ui-mastery
license: MIT © phazurlabs
version: 1.0.0
compatibility: "Any frontend framework. Patterns apply to chat, copilot, and embedded AI UIs."
---

<!-- Adapted from phazurlabs/ux-ui-mastery (MIT) — LLM UI Patterns skill #17.
     Streaming response, hallucination states, RAG attribution, trust calibration.
     YAMTAM structure, Anti-Fake-Pass gate, and Vietnamese localization notes are original. -->

## When to Use

- Use when: building any UI that displays LLM-generated content
- Use when: streaming responses feel jarring or incomplete-looking
- Use when: users can't tell what AI generated vs what is factual
- Use when: error states from LLM calls have no recovery UI
- Do NOT use for: prompt design — use `prompt-engineering`
- Do NOT use for: RAG retrieval architecture — use `rag-architect`

---

## Streaming Response UI

### Core principle
Show tokens as they arrive — never wait for complete response.
Users perceive streaming as faster even when total time is equal.

### Implementation pattern
```
States during streaming:
1. Thinking     → subtle pulsing indicator (not a spinner — implies processing)
2. Streaming    → text renders token by token; cursor blink at end
3. Complete     → cursor disappears; copy/action buttons appear
4. Error        → replace content with error state (preserve partial if useful)
```

### Cursor pattern
```css
/* Blinking cursor at end of streaming text */
.streaming-cursor::after {
  content: '▋';
  animation: blink 0.7s step-end infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
/* Remove when streaming completes */
.complete .streaming-cursor::after { display: none; }
```

### Interrupted stream handling
- Network drop mid-stream: show partial content + "Response interrupted" banner + retry
- Never silently show partial content as complete
- Preserve partial content for retry — don't discard

---

## Hallucination and Uncertainty States

AI content needs uncertainty signals — users cannot judge correctness without them.

### Confidence levels (display)

| Confidence | Visual treatment |
|---|---|
| High (cited, grounded) | Normal text |
| Medium (inferred) | Subtle italic or muted color |
| Low (speculative) | Inline warning badge: "Not verified" |
| Unknown (uncited) | Always label — never display as fact |

### Attribution pattern (RAG)
```
[AI response text here with a cited claim¹]

───
¹ Source: Employee Handbook, Section 4.2 (updated 2025-01-10)
  "Vacation accrues at 1.5 days per month after 90 days."
```

Rules:
- Sources must link to the actual document/section, not just "database"
- Show retrieval timestamp when data freshness matters
- "Based on X documents" is not attribution — show which documents

### Hallucination error state
When model explicitly signals low confidence or when retrieval returns nothing:
```
╔════════════════════════════════════════════╗
║  ⚠  I don't have reliable information      ║
║     about this.                            ║
║                                            ║
║  I searched 3 knowledge sources and found  ║
║  no matching content.                      ║
║                                            ║
║  [Search the web]  [Ask a human]           ║
╚════════════════════════════════════════════╝
```
Never display a confident-sounding hallucination. Surface uncertainty.

---

## Generative UI Patterns

### Progressive disclosure for long responses
```
Short response (< 200 words): show in full
Long response (> 200 words):  show first 100 words + "Show more"
Very long (> 1000 words):     summarize + collapsible sections
```

### Regenerate and edit patterns
Every AI response needs:
- **Regenerate**: "Try again" — same prompt, new generation
- **Edit prompt**: let user refine query without full re-type
- **Copy**: one-click copy of full response
- **Thumbs up/down**: inline feedback for RLHF signal (if applicable)

### Structured output rendering
When LLM returns structured data, render it — don't dump raw text:
```
LLM returns: {"items": [{"name": "Setup", "status": "done"}, ...]}
Render as:   ✓ Setup    ✗ Deploy    ○ Test
Not as:      {"items": [{"name": "Setup" ...
```

---

## AI Trust Calibration

Users over-trust or under-trust AI outputs — design for the right level.

### Over-trust signals (add friction)
- Users submitting AI-generated legal/medical content without review
- No human review step before high-stakes actions

**Fix:** Add explicit confirmation: "Review this AI-generated content before sending."
Add edit affordance so users feel ownership, not passthrough.

### Under-trust signals (reduce friction)
- Users re-asking the same question 5 times with slight wording changes
- Users copying AI output to verify in Google separately

**Fix:** Show sources inline. Show confidence. Make AI reasoning visible ("Here's why I think this...").

### Trust vocabulary (copy guidelines)
| Instead of | Use |
|---|---|
| "The answer is..." | "Based on [source], ..." |
| "Always..." | "In most cases, ..." |
| "I know that..." | "According to the docs, ..." |
| Error code dump | Plain language + action |

---

## AI UI States (7-state mapping)

Map `ui-states` 7-state model onto AI-specific scenarios:

| State | AI-specific behavior |
|---|---|
| Empty | "Ask me anything about [domain]" + suggested prompts |
| Loading/Thinking | Pulsing indicator — not spinner |
| Streaming | Token-by-token render + blinking cursor |
| Partial | Show retrieved sources while generating |
| Complete | Full response + copy/regenerate/feedback actions |
| Error | Plain-language AI error + retry + escalation path |
| Offline | Queue prompt, show "Will respond when reconnected" |

Reference `ui-states` skill for implementation details per state.

---

## Anti-Fake-Pass Rules

Before claiming an AI UI is done, you MUST show:
- [ ] Streaming: thinking → streaming → complete → error states all implemented
- [ ] Interrupted stream handled (not silently shown as complete)
- [ ] Hallucination/uncertainty: at least "low confidence" visual treatment defined
- [ ] RAG attribution: sources shown per claim, not just "AI-powered"
- [ ] Regenerate + copy actions on every AI response
- [ ] Trust-appropriate copy — no confident absolutes on uncertain outputs

Reference: `gates/anti-fake-pass-gate.md` | `gates/ui-quality-gate.md`
