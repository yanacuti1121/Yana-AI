---
name: image-to-code
description: >
  Convert a UI screenshot, mockup, or design image into production-quality
  frontend code. Analyzes layout, spacing, component hierarchy, and visual
  states from the image, then outputs clean, semantic code.
  Use when the user provides an image/screenshot and asks to "code this",
  "build this UI", "implement this design", or "turn this into a component".
  Do NOT use for generating new designs — only for converting existing visuals to code.
origin: adapted:taste-skill
license: MIT © 2026 Leonxlnx
version: 1.0.0
compatibility: "React/JSX output by default. Mention stack preference to get Vue, HTML, or other output."
---

<!-- Adapted from taste-skill (MIT © 2026 Leonxlnx). Changes: added YAMTAM origin/Anti-Fake-Pass/compatibility fields, removed GPT-specific behavior, generalized to any frontend stack. -->

## When to Use

- Use when: user uploads an image or screenshot and asks to implement it as code
- Use when: user pastes a Figma/design URL description and wants the layout coded
- Use when: user says "match this", "replicate this UI", "build exactly what's shown"
- Do NOT use when: no image is provided — use `design-taste-frontend` for improvements from description only
- Do NOT use when: image contains sensitive/personal data — flag it and ask for a redacted version

## Pre-conditions

- [ ] Confirm the image is visible and has sufficient resolution to analyze layout
- [ ] Confirm the target stack (React, Vue, plain HTML) — default to React/JSX if not stated
- [ ] Confirm whether to use a CSS framework (Tailwind, CSS Modules, styled-components) — default to Tailwind if project uses it

## How It Works

1. **Analyze the image** — identify: layout grid, component boundaries, spacing rhythm, color palette, typography hierarchy, interactive elements
2. **Decompose into components** — name each logical piece (Card, Header, NavItem, Badge, etc.)
3. **Map spacing** — convert visual spacing to a consistent scale (4px/8px base); estimate if pixel values are not given
4. **Extract colors** — identify background, surface, text, accent, border colors; name them semantically
5. **Identify interactive states** — note buttons, links, inputs; mark which states are shown vs assumed
6. **Write the component hierarchy** — top-level layout wrapper first, then nested components
7. **Output the code** — semantic HTML structure, accessible roles and labels, responsive considerations noted
8. **Flag assumptions** — list any visual detail that was estimated, not clearly visible, or left as TODO

## Output Format

```
## Component: [Name]
[Description — what this component does]

## Assumptions
- [Visual detail inferred, not clearly visible]
- [State assumed but not shown in image]

## Code
[component code]
```

If multiple components: output one block per component, ordered parent → child.

## Gotchas

- Do not hallucinate exact font names or pixel values — use estimates and flag them
- If the image shows only one state (e.g., default), generate only that state; add a `// TODO: hover/active/disabled states` comment
- Images often compress gradients — treat subtle color differences as flat backgrounds unless clearly a gradient
- Accessibility: any text in the image that is decorative gets `aria-hidden`; text that is content gets proper `alt` or label
- Do not output inline styles unless the framework requires it — prefer class-based styling

## Anti-Fake-Pass Rules

Before claiming the implementation is done, you MUST show:
- [ ] Component list — all major visual regions named and accounted for
- [ ] Assumptions list — all inferred values flagged (fonts, exact px, hidden states)
- [ ] Code output shown — not just a plan or description
- [ ] At least one responsive consideration noted (or explicitly stated as out of scope)

Reference: `gates/anti-fake-pass-gate.md`
