---
name: output-enforcement
description: >
  Run a final quality gate on UI output before delivering it to the user.
  Checks code quality, visual correctness, accessibility baseline, and
  that no placeholder content remains.
  Use when about to deliver any frontend implementation — before saying
  "done", "here is the component", or marking a UI task complete.
  Do NOT use as a standalone task — this is a pre-delivery gate, not a redesign skill.
origin: adapted:taste-skill
license: MIT © 2026 Leonxlnx
version: 1.0.0
compatibility: "Any frontend stack. Language-agnostic checks with stack-specific notes."
---

<!-- Adapted from taste-skill (MIT © 2026 Leonxlnx). Changes: added YAMTAM origin/Anti-Fake-Pass/compatibility fields, converted to gate-style checklist format, removed GPT-specific behavior. -->

## When to Use

- Use when: about to deliver a UI component, page, or design update
- Use when: user asks for a "final review" or "check this before I use it"
- Use when: any task involving frontend code is about to be marked complete
- Do NOT use when: the work is not frontend (no visual output)
- Do NOT use when: the task is still in early draft — run this gate only before delivery

## How It Works

1. **Run the Code Quality checks** — scan for the items in the checklist below
2. **Run the Visual Correctness checks**
3. **Run the Accessibility Baseline checks**
4. **Run the Placeholder Sweep**
5. **Report results** — list PASS / FAIL / SKIP (with reason) per item
6. **Fix all FAILs** before delivering
7. **Deliver** only after all items are PASS or SKIP (with justification)

## Enforcement Checklist

### Code Quality
- [ ] No inline styles unless required by the framework
- [ ] No hardcoded color values outside of design tokens or a designated constants file
- [ ] No commented-out code blocks
- [ ] No `console.log` or debug output left in
- [ ] Component props are typed (TypeScript) or documented (JSDoc/PropTypes)
- [ ] No TODO comments that block functionality (informational TODOs are acceptable)

### Visual Correctness
- [ ] Layout renders without overflow at default viewport (1280px desktop)
- [ ] Layout renders without overflow at 375px mobile
- [ ] Interactive elements have visible hover and focus states
- [ ] Text does not overlap or clip at any of the above viewports
- [ ] Images and icons have defined width/height or aspect ratio (no layout shift)

### Accessibility Baseline
- [ ] All `<img>` have `alt` text (empty `alt=""` is acceptable for decorative images)
- [ ] All interactive elements are keyboard-reachable (`tabindex` or native elements)
- [ ] Color contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text (WCAG AA)
- [ ] Form inputs have associated `<label>` elements

### Placeholder Sweep
- [ ] No Lorem Ipsum or placeholder text in the output
- [ ] No `[TODO]`, `[insert here]`, `example@email.com`, or `John Doe` in visible content
- [ ] No placeholder images (`via.placeholder.com`, `placehold.it`)

## Output Format

```
## Output Enforcement Report

### Code Quality
- [ ] No inline styles — PASS
- [ ] No hardcoded colors — FAIL: Button.tsx line 12: color: "#3b82f6"
...

### Visual Correctness
...

### Accessibility Baseline
...

### Placeholder Sweep
...

Summary: X PASS / Y FAIL / Z SKIP
Action required before delivery: [list of FAILs to fix]
```

## Gotchas

- SKIP is only valid with a written reason — never skip silently
- Contrast check: if you cannot run a tool, estimate from color names and flag as ESTIMATED
- Layout overflow: if you cannot render the UI, flag viewport checks as ESTIMATED and note the risk
- TypeScript typing: if the project is plain JS, skip typing checks and note it

## Anti-Fake-Pass Rules

Before claiming output enforcement is complete, you MUST show:
- [ ] The full checklist output — every item marked PASS / FAIL / SKIP
- [ ] All FAILs listed with specific file + line reference
- [ ] Summary line: X PASS / Y FAIL / Z SKIP
- [ ] If any FAILs remain: delivery is blocked until fixed or explicitly waived by user

Reference: `gates/anti-fake-pass-gate.md`
