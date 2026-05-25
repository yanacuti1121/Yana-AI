---
name: minimalist-ui
description: >
  Simplify an overloaded UI by removing visual noise, establishing
  whitespace discipline, and reducing to essential elements.
  Use when the user says "too busy", "simplify this", "less is more",
  "cleaner look", "feels overwhelming", or "too many things on screen".
  Do NOT use when the user wants to add features or content — this skill removes and simplifies only.
origin: adapted:taste-skill
license: MIT © 2026 Leonxlnx
version: 1.0.0
compatibility: "Any frontend stack. CSS-level changes primarily."
---

<!-- Adapted from taste-skill (MIT © 2026 Leonxlnx). Changes: added YAMTAM origin/Anti-Fake-Pass/compatibility fields, structured around removal discipline, removed GPT-specific behavior. -->

## When to Use

- Use when: the UI has too many competing elements, colors, or calls-to-action
- Use when: user describes cognitive overload ("I don't know where to look")
- Use when: cleaning up a design that accumulated complexity over time
- Use when: user explicitly asks for a "minimal", "clean", or "focused" aesthetic
- Do NOT use when: the complexity is functional (e.g., data-dense dashboard the user relies on)
- Do NOT use when: user wants to add or keep all existing content — flag the conflict instead

## Pre-conditions

- [ ] Read the existing code to understand what can and cannot be removed
- [ ] Confirm which content is required vs decorative before removing anything

## The Minimalist Reduction Protocol

Work through these layers in order — earlier layers are safer (reversible), later layers are more impactful (confirm with user):

**Layer 1 — Visual noise (safe, no content removed):**
- Remove decorative borders, dividers, and backgrounds that carry no information
- Reduce shadow count: keep 1 level max (card elevation), remove the rest
- Standardize spacing to a 4px or 8px scale — remove arbitrary px values
- Collapse color palette: identify the 3 colors that remain (background, text, accent)

**Layer 2 — Typography (safe, content preserved):**
- Reduce to 2 type sizes per view (heading + body); a third for labels is acceptable
- Remove bold used for decoration — keep bold only for hierarchy signal
- Increase line-height to ≥ 1.5 for body text if currently under

**Layer 3 — Element reduction (requires user confirmation):**
- Identify elements with zero interaction rate (decorative icons, redundant labels)
- Propose removal — do not remove without user confirmation
- Merge duplicated CTAs into one primary action

**Layer 4 — Layout restructure (high impact — always confirm):**
- Increase padding/margin aggressively — whitespace is content in minimalist design
- Move secondary information to a collapsed section, tooltip, or separate view
- Reduce column count if the content does not justify the grid complexity

## Output Format

```
## Minimalist Reduction Report

Layer 1 — Visual noise:
  Removed: [list]
  Kept: [list with reason]

Layer 2 — Typography:
  Changes: [list]

Layer 3 — Element reduction (pending confirmation):
  Proposed: [list — not yet applied]

Layer 4 — Layout restructure:
  [Applied if user confirmed / Proposed if not yet confirmed]

Net change: X elements removed, Y spacing adjustments, Z color values consolidated
```

Then: code output.

## Gotchas

- Whitespace is the primary tool — most "too busy" problems are fixed by increasing padding, not removing content
- Never remove navigation or primary actions without explicit instruction
- Minimalism ≠ empty — the goal is signal clarity, not bareness
- If the project has a brand guide, keep the brand colors even if they seem "too much" — adjust how they are used, not what they are

## Anti-Fake-Pass Rules

Before claiming simplification is done, you MUST show:
- [ ] Reduction report — all 4 layers assessed (applied or pending-confirmation noted)
- [ ] Net change summary: elements removed, spacing changes, color palette before/after
- [ ] Code diff shown — not just a description
- [ ] Layer 3 and Layer 4 changes were either confirmed by user or marked as proposals

Reference: `gates/anti-fake-pass-gate.md`
