---
name: design-taste-frontend
description: >
  Apply high-taste UI/UX principles to frontend work: visual hierarchy,
  spacing discipline, typography, color restraint, and anti-slop patterns.
  Use when the user asks to "make it look better", "improve the UI",
  "make it more professional", "it feels off", or when delivering any
  frontend work that involves visual appearance.
  Do NOT use for pure logic/backend work with no visual output.
origin: adapted:taste-skill
license: MIT © 2026 Leonxlnx
version: 1.0.0
compatibility: "Any frontend stack. Framework-agnostic principles. CSS/Tailwind examples shown."
---

<!-- Adapted from taste-skill (MIT © 2026 Leonxlnx). Changes: added YAMTAM origin/Anti-Fake-Pass/compatibility fields, removed GPT-specific behavior, font stack changed to suggestions not mandates. -->

## When to Use

- Use when: user asks to improve visual quality ("make it nicer", "it looks cheap", "too plain")
- Use when: delivering any UI component and the design is visually underdefined
- Use when: user says the UI "feels off" without specifying why
- Use when: reviewing a design before marking it done
- Do NOT use when: the task is purely functional with no UI (API, scripts, migrations)
- Do NOT use when: user has an established design system — apply their tokens, don't override

## Pre-conditions

- [ ] Understand the visual context: is this a landing page, dashboard, app, or component?
- [ ] Check if the project has a design system or token file — apply it if it exists

## How It Works

1. **Audit the current state** — identify which of the anti-slop patterns below are present
2. **Apply hierarchy first** — establish clear primary / secondary / tertiary visual levels
3. **Fix spacing** — use a consistent scale (4px or 8px base unit), increase whitespace generously
4. **Tighten typography** — 2–3 type sizes max per view, strong weight contrast between heading and body
5. **Reduce color surface area** — one accent color, neutral backgrounds, color for signal not decoration
6. **Remove decorative clutter** — eliminate elements that carry no information or action
7. **Check at multiple sizes** — verify layout holds at mobile and desktop breakpoints

## Anti-Slop Patterns to Eliminate

These patterns signal low-quality UI — check for and remove them:

- **Gradient abuse** — gradients on backgrounds, cards, buttons simultaneously
- **Shadow everywhere** — box-shadow on every element with no hierarchy signal
- **Border + shadow + background all at once** — pick 2, not 3
- **Centered everything** — center-alignment is for hero sections, not body content
- **12-column grid used as 1 column** — content crammed into a narrow stripe, sides wasted
- **Emoji as icons** — use an icon library or SVG; emojis break at small sizes and look amateurish
- **All-caps headings with letter-spacing 0** — if using all-caps, add `letter-spacing: 0.05em`
- **Lorem ipsum left in** — replace with plausible domain content before any review
- **Inconsistent spacing** — mixing `px` and `rem` arbitrarily, or using random values (13px, 17px)
- **Too many font weights** — 2 weights per typeface (regular + semibold or bold) is usually enough
- **Interactive elements that don't look interactive** — buttons must have clear hover/focus states

## Output Format

When applying this skill, output in two parts:

**Part 1 — Audit findings** (before changes):
```
Issues found:
- [pattern]: [where in the code]
- [pattern]: [where in the code]
```

**Part 2 — Applied changes**:
- Show the diff or updated component
- Note which anti-slop patterns were addressed
- If font stack changed: state it as a suggestion, not a requirement

## Gotchas

- Never mandate a specific font unless the project already uses it — suggest a pairing, let the user decide
- Don't add animation as a substitute for spatial clarity — motion should reinforce layout, not cover it
- Accessibility: color contrast must remain ≥ 4.5:1 after any color changes (WCAG AA)
- If the user has a design system, apply their spacing tokens — do not introduce a new scale

## Anti-Fake-Pass Rules

Before claiming UI improvements are done, you MUST show:
- [ ] Audit findings list — which anti-slop patterns were found and addressed
- [ ] Diff or updated code shown — not just a description of changes
- [ ] At least one of: spacing, typography, or color hierarchy explicitly improved
- [ ] No Lorem ipsum remaining in the output

Reference: `gates/anti-fake-pass-gate.md`
