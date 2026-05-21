---
name: ui-redesign
description: >
  Diagnose and redesign an existing UI that looks dated, cluttered, or
  inconsistent. Produces a structured critique and a revised implementation.
  Use when the user asks to "redesign this page", "this UI looks bad",
  "make it modern", "clean this up", or "the layout is confusing".
  Do NOT use for net-new UI with no existing code to improve.
origin: adapted:taste-skill
license: MIT © 2026 Leonxlnx
version: 1.0.0
compatibility: "Any frontend stack. Reads existing code; outputs diff or replacement component."
---

<!-- Adapted from taste-skill (MIT © 2026 Leonxlnx). Changes: added YAMTAM origin/Anti-Fake-Pass/compatibility fields, structured critique format, removed GPT-specific behavior. -->

## When to Use

- Use when: user wants to improve an existing, working UI (not build from scratch)
- Use when: user describes the UI as ugly, dated, confusing, or inconsistent
- Use when: user says "this looks like 2012", "too much going on", "users complain about the layout"
- Do NOT use when: there is no existing UI — use `design-taste-frontend` to guide net-new work
- Do NOT use when: the user wants minor tweaks to a good design — just make the edits directly

## Pre-conditions

- [ ] Read the existing component/page code before proposing any changes
- [ ] Identify the target audience and use case if not obvious from code

## How It Works

1. **Read the existing code** — understand the current structure before critiquing it
2. **Run the 5-axis critique** (see Output Format)
3. **Propose a redesign direction** in 2–3 sentences — get alignment before coding
4. **Implement the redesign** — prefer evolution over revolution; preserve working logic
5. **Show before/after** — diff or side-by-side component comparison
6. **Flag anything preserved intentionally** — explain why (legacy constraint, accessibility requirement, etc.)

## 5-Axis Critique

Run this analysis before proposing changes:

| Axis | Check |
|------|-------|
| **Hierarchy** | Is there a clear primary action / primary content? Can the user find what matters? |
| **Spacing** | Is whitespace used consistently? Does the layout breathe or feel cramped? |
| **Typography** | Are there too many font sizes? Is weight contrast between heading and body clear? |
| **Color** | Is color used for signal or decoration? Is there a dominant neutral + one accent? |
| **Consistency** | Do similar elements look the same? Are padding, radius, and shadows consistent? |

## Output Format

**Critique:**
```
Hierarchy: [finding]
Spacing: [finding]
Typography: [finding]
Color: [finding]
Consistency: [finding]

Top 3 issues to address: [list]
```

**Redesign direction** (one paragraph — wait for user to confirm before implementing):

**Implementation** (after confirmation):
- Diff or replacement code
- Inline notes for any preserved behavior

## Gotchas

- Preserve all functional logic — only modify presentation layer unless instructed otherwise
- Do not remove content — if something looks cluttered, reorganize it; do not delete it without asking
- Don't introduce new dependencies (icon libraries, animation libs) without flagging them first
- If the redesign requires a design system that doesn't exist, create minimal tokens (3–4 colors, 2 type sizes) inline rather than proposing a full design system overhaul
- Respect existing breakpoints — don't break responsive behavior

## Anti-Fake-Pass Rules

Before claiming the redesign is done, you MUST show:
- [ ] 5-axis critique completed — all 5 axes assessed, not skipped
- [ ] Top 3 issues explicitly stated before implementation
- [ ] Before/after diff or comparison shown
- [ ] Functional logic preserved — no working code deleted without explicit approval

Reference: `gates/anti-fake-pass-gate.md`
