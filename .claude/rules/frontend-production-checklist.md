---
description: Frontend production-readiness checklist — shared paths with color-rules.md, typography-rules.md, and anti-ai-slop-design-law.md so companion frontend rules always load together
paths: ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte", "**/*.css", "**/*.scss", "**/*.html"]
---

# Yana AI — Frontend Production Checklist
# Informed by patterns independently observed across several public
# production-frontend agent skills (2026) — rewritten in Yana AI's own
# voice and checklist format, not reproduced verbatim from any source.

**Status:** Active
**Enforced by:** UI Quality Gate L5, frontend agents
**Companion rules:** `color-rules.md`, `typography-rules.md`, `anti-ai-slop-design-law.md`
**Companion skills:** `accessibility-audit`, `design-system-gen`

---

## Why this file exists

`color-rules.md` and `typography-rules.md` cover tokens and scale.
`anti-ai-slop-design-law.md` covers visual clichés. Neither covers whether
an interface actually *works* under real conditions: every interaction
state wired up, forms that validate sanely, text that survives translation,
lists that don't jank at 10,000 rows. This file is that pass — the
difference between a demo and something shippable.

---

## 1. Interactive states — all eight, not just default+hover

Every interactive element needs: **default · hover · focus · active ·
disabled · loading · error · success**. Missing even one is the most common
reason a UI feels unfinished under real use, not just visually incomplete.

```
□ :focus-visible (not bare :focus) — never outline: none without a
  replacement ring, ≥2px thick, ≥3:1 contrast against its background
□ Hover-dependent functionality is broken on touch — gate hover styles
  behind @media (hover: hover), never rely on hover alone for access
  to content or actions
□ Loading state disables the trigger (prevents double-submit) and shows
  explicit feedback, not just a disabled look with no explanation
```

## 2. Touch & responsive — input method, not screen size

```
□ Detect input capability, not viewport width: @media (pointer: coarse)
  for touch, @media (pointer: fine) for mouse — screen size alone
  doesn't tell you which input the user has
□ Touch targets ≥44×44px. A visually smaller icon can still hit this via
  an invisible expanded hit area (padding or an absolutely positioned
  pseudo-element), no need to inflate the visible glyph
□ Breakpoints follow content, not device presets — start narrow, widen
  until the design breaks, add the breakpoint there
□ Component-level responsiveness (a card that must adapt inside both a
  narrow sidebar and a wide content pane) needs container queries
  (@container), not viewport media queries
```

## 3. Forms — validation timing and error content

```
□ Validate on blur, not on every keystroke — the one exception is live
  password-strength feedback. Keystroke-level validation on every field
  reads as noise, not help.
□ Real <label> elements, always — a placeholder is not a label; it
  disappears the moment the user starts typing
□ Every error message answers three things: what happened, why, and how
  to fix it. "Invalid input" fails all three. "Email needs an @ symbol —
  try name@example.com" answers all three.
□ Destructive action buttons name the specific consequence: "Delete 5
  items", not "Delete selected" — and "Delete" vs. "Remove" should track
  whether the action is actually recoverable
```

## 4. Motion — exact numbers, not "smooth"

Extends `anti-ai-slop-design-law.md` §4 with concrete timing:

```
□ Duration by purpose, not by feel: ~100–150ms instant feedback,
  200–300ms state changes, 300–500ms layout changes, 500–800ms entrance.
  Exit animations run at roughly 75% of the matching enter duration.
□ Anything under ~80ms reads as instant — that's the target for
  micro-interactions, not a floor to round down from
□ List stagger: cap the TOTAL stagger duration at ~500ms regardless of
  item count (delay-per-item shrinks as the list grows), not a fixed
  per-item delay that compounds into a multi-second cascade at 50+ items
□ Scroll-triggered fade-per-section on every page load is a product-page
  tell, not a feature — reserve entrance choreography for brand/marketing
  surfaces where users are looking, not product surfaces where they're
  mid-task
```

## 5. Color & type — practical extensions

Extends `color-rules.md` / `typography-rules.md` (contrast ratios and base
type scale already covered there — not restated here):

```
□ Dark mode depth comes from tonal layering (e.g. three OKLCH lightness
  steps — roughly 15% / 20% / 25% — same hue/chroma as the brand color),
  not drop shadows, which read as light-mode thinking ported unchanged
□ Never gray text directly on a colored background — it reads washed out.
  Use a darker shade of the background's own hue, or transparency of the
  text color, instead of a generic gray
□ Body measure (line length) stays inside 45–75 characters — cap with
  max-width in ch units, not px, so it holds across font-size changes
□ All-caps text needs added letter-spacing (roughly 0.05–0.12em) — capital
  letters sit tighter than mixed case and read as cramped without it
```

## 6. Onboarding & empty states

```
□ Every empty state answers four things: what will appear here, why it
  matters, a clear action to create/start, and enough visual interest
  that it doesn't read as broken (not a blank rectangle)
□ Onboarding is skippable, never blocks access to the product, and
  teaches one thing at a time — track "seen" state so it doesn't
  re-trigger on every visit
□ Distinguish the empty-state SPECTRUM: first-ever-use (teach value),
  user-cleared-everything (light touch, no re-onboarding), no-results
  (offer to reset filters/search), no-permission (explain + offer an
  access path), system-error (clear message + retry) — one generic
  "nothing here" message for all five is a miss
```

## 7. Internationalization

```
□ Budget for text expansion, not just current-language width: German/
  Finnish run ~+30%, French ~+20%, Chinese often -30%. Fixed-width text
  containers sized to the source language will clip on translation.
□ Never hand-roll pluralization or number formatting via string
  concatenation — use Intl.NumberFormat / Intl.PluralRules (or an i18n
  library), since locale-aware grouping/decimal separators and plural
  rules vary by language in ways ad-hoc code won't cover
□ RTL support means CSS logical properties (margin-inline-start, not
  margin-left) — physical-direction properties don't flip for RTL locales
```

## 8. Performance — hard numeric targets

```
□ Core Web Vitals: LCP < 2.5s, INP < 200ms, CLS < 0.1 — set explicit
  image dimensions / aspect-ratio so images don't shift layout on load
□ Serve modern image formats (WebP/AVIF) at the actual display size, not
  a 3000px source scaled down by CSS; lazy-load below the fold
□ Lists past roughly 1,000 rows need virtual scrolling (render only the
  visible window) — rendering the full DOM list is the usual cause of
  scroll jank at that scale
```

## 9. Production-readiness edge cases

```
□ Text overflow is handled, not assumed away: min-width: 0 on flex/grid
  children (the default min-content sizing is the #1 cause of
  unexpected overflow in flex/grid layouts), text-overflow: ellipsis +
  nowrap for single-line truncation, -webkit-line-clamp for multi-line
□ Large datasets get pagination or virtual scrolling, never an unbounded
  render; mutating actions (submit, delete) disable their trigger while
  in flight to prevent double-submission
□ Overlays use the platform primitives before hand-rolling: <dialog>
  with showModal() for modals (free focus trap + Escape-to-close), the
  Popover API for light-dismiss tooltips/menus (free top-layer stacking,
  no z-index tuning). A dropdown positioned absolute inside an
  overflow:hidden/auto ancestor will clip — use position: fixed, a
  portal, or CSS anchor positioning instead.
```

## 10. Design-system drift — three failure shapes

When auditing an existing UI against its own design system, drift usually
takes one of three shapes — naming which one it is points at the right fix:

```
1. Missing token   — a value should exist as a token but doesn't (fix:
                      add the token, don't just hardcode the value again)
2. One-off build   — a shared component already exists but this instance
                      was hand-built instead (fix: swap in the component)
3. Conceptual drift — the flow or information architecture doesn't match
                      sibling screens even though components are correct
                      (fix: realign structure, not just styling — e.g. a
                      settings page exposing 40 fields at once when the
                      rest of the product discloses 5 at a time)
```

---

## Agent Enforcement

Before an agent delivers any interactive frontend component:
- [ ] All eight interactive states implemented, not just default+hover
- [ ] Touch targets ≥44×44px; hover-only functionality has a non-hover path
- [ ] Form errors follow the what/why/fix formula; validation fires on
      blur, not keystroke (except live password strength)
- [ ] Motion durations match Section 4's purpose-based ranges; list
      stagger total stays under ~500ms regardless of item count
- [ ] Empty and loading states exist and are state-appropriate (not one
      generic message reused across first-use/cleared/no-results/error)
- [ ] Any list past ~1,000 rows uses virtual scrolling
- [ ] Overlays use <dialog>/Popover API where applicable, not hand-rolled
      absolute-positioned divs inside a clipping ancestor
