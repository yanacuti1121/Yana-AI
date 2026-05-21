---
name: accessibility-audit
description: >
  Audit UI code for WCAG 2.1 AA compliance — color contrast, keyboard
  navigation, ARIA roles, focus management, and screen reader compatibility.
  Use when the user asks to "check accessibility", "make this accessible",
  "WCAG audit", "a11y review", or before marking any public-facing UI as done.
  Do NOT use for quick pre-delivery checks — use output-enforcement for that.
  This skill goes deeper: it covers ARIA semantics, focus order, and live regions.
origin: adapted:vercel-agent-skills
license: MIT © Vercel Labs
version: 1.0.0
compatibility: "Any HTML/JSX/TSX output. Framework-agnostic checks."
---

<!-- Adapted from vercel-labs/agent-skills (MIT) — accessibility audit concept and WCAG rule coverage.
     All content written original for YAMTAM. Rule descriptions derived from WCAG 2.1 public spec (W3C). -->

## When to Use

- Use when: user explicitly asks for an accessibility review
- Use when: UI is public-facing and will be used by real users
- Use when: product serves regulated industries (healthcare, gov, finance — a11y is often legally required)
- Use when: `output-enforcement` L3 check flagged a contrast or label issue and you need the full fix
- Do NOT use for quick pre-delivery sweeps — use `output-enforcement` L3 baseline instead
- Do NOT use when: there is no UI code to review

## Pre-conditions

- [ ] UI code (HTML/JSX/TSX/CSS) is available to read
- [ ] Target WCAG level confirmed (default: AA — upgrade to AAA if user requests)

## How It Works

1. **Run the 5-category audit** (see checklist below)
2. **Score each item** PASS / FAIL / ESTIMATED / N/A
3. **For each FAIL**: show the specific line/element, the rule violated, and the fix
4. **Summary**: WCAG AA level reached or not, list of blockers

## Audit Checklist

### Category 1 — Color & Contrast (WCAG 1.4)
```
□ Normal text (< 18pt): contrast ratio ≥ 4.5:1
□ Large text (≥ 18pt or ≥ 14pt bold): contrast ratio ≥ 3:1
□ UI components and icons: contrast ≥ 3:1 against adjacent color
□ Focus indicator: contrast ≥ 3:1 against both sides of the boundary
□ Information NOT conveyed by color alone (e.g. error state uses icon + color, not color only)
```

### Category 2 — Keyboard Navigation (WCAG 2.1)
```
□ All interactive elements reachable by Tab key
□ Tab order follows visual reading order (no jumps)
□ No keyboard traps (user can always Tab out)
□ Custom widgets (dropdowns, modals, sliders) follow ARIA keyboard patterns
□ Skip navigation link present on pages with repeated nav
```

### Category 3 — ARIA & Semantic HTML (WCAG 4.1)
```
□ Landmark roles present: <main>, <nav>, <header>, <footer>
□ All images: alt="" (decorative) or descriptive alt text (informative)
□ All form inputs have associated <label> (via for/id or aria-labelledby)
□ Icon-only buttons have aria-label
□ No positive tabindex values (tabindex > 0 breaks natural order)
□ Dynamic content changes announced via aria-live or role="alert"
□ No duplicate IDs in the document
```

### Category 4 — Focus Management (WCAG 2.4)
```
□ Focus visible at all times (no outline: none without replacement)
□ On modal open: focus moves to modal
□ On modal close: focus returns to trigger element
□ On page navigation (SPA): focus moves to new page heading or main content
□ Focus style is clearly visible (not just browser default if browser default is thin)
```

### Category 5 — Content & Structure (WCAG 1.3, 2.4)
```
□ Heading hierarchy: h1 → h2 → h3 (no skipping levels)
□ Lists use <ul>/<ol>/<li>, not divs styled as lists
□ Tables have <th> headers with scope attribute
□ Page has a <title> element (or document.title in SPA)
□ Language declared: <html lang="en"> (or appropriate)
□ Error messages: linked to input via aria-describedby, not just color change
```

## Output Format

```
## Accessibility Audit — WCAG 2.1 AA

### Category 1 — Color & Contrast
  □ Normal text contrast — PASS (ratio: 7.2:1)
  □ Large text contrast — PASS (ratio: 4.8:1)
  □ Focus indicator contrast — FAIL: Button focus ring is 1px solid #ccc — ratio 1.4:1
    Fix: outline: 2px solid #0055FF; outline-offset: 2px; (ratio 4.8:1)
  ...

### Summary
  PASS: 18 / 27
  FAIL: 4  (see above)
  ESTIMATED: 3  (color contrast — exact values not visible in code)
  N/A: 2

  WCAG 2.1 AA: NOT MET — 4 blockers must be resolved
  Blockers: [list]
```

## Gotchas

- Contrast ratios for dynamic colors (CSS variables) must be ESTIMATED — state the variable values used for estimation
- `outline: none` is almost always a FAIL unless a visible custom focus style replaces it
- `aria-label` on a button that already has visible text creates a mismatch — screen readers read the aria-label instead of the visible text, which confuses users; prefer visible text alone
- `role="button"` on a `<div>` also needs `tabindex="0"` and keyboard event handlers — if you see `role="button"` on a non-button, check for both
- Color-only error states are a WCAG 1.4.1 failure — red border alone is not enough; add an icon or text

## Anti-Fake-Pass Rules

Before claiming the audit is done, you MUST show:
- [ ] All 5 categories evaluated — no category skipped without N/A justification
- [ ] Every FAIL has a specific element reference and a concrete fix
- [ ] Summary line: X PASS / Y FAIL / Z ESTIMATED / W N/A
- [ ] WCAG 2.1 AA verdict: MET or NOT MET with blocker count

Reference: `gates/anti-fake-pass-gate.md` | `gates/ui-quality-gate.md` (L3)
