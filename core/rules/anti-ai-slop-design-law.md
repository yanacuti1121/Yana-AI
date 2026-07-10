---
description: Anti-AI-slop visual design checklist — shared paths with color-rules.md, typography-rules.md, and frontend-production-checklist.md so companion frontend rules always load together
paths: ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte", "**/*.css", "**/*.scss", "**/*.html"]
---

# Yana AI — Anti-AI-Slop Design Law
# Informed by patterns independently observed across several public
# "anti-slop frontend" agent skills (2026) — rewritten in Yana AI's own
# voice and checklist format, not reproduced verbatim from any source.

**Status:** Active
**Enforced by:** UI Quality Gate L5, frontend agents
**Companion rules:** `color-rules.md`, `typography-rules.md`,
`frontend-production-checklist.md` — interaction states, forms, a11y,
i18n, and performance rules that go beyond visual-cliché avoidance
**Companion skills:** `design-system-gen`, `accessibility-audit`, `aesthetic-anchor`

---

## Why this file exists

`color-rules.md` and `typography-rules.md` police tokens and scales — they
catch a raw hex value or a 12px paragraph. They do not catch a page that is
*token-compliant and still looks like every other AI-generated landing page*.
This file is the second pass: pattern recognition for the specific visual
clichés that make output read as machine-generated regardless of whether
the numbers technically pass.

---

## 0. Read the brief before generating anything

Before touching code, state one line: **"Reading this as: `<page kind>` for
`<audience>`, with a `<vibe>` language."** Page kind, vibe words the user
actually used, any URLs/screenshots/brands they referenced, and the
audience all drive the aesthetic — not agent preference. If the brief is
ambiguous, ask exactly **one** clarifying question; if it isn't, declare
the read and proceed. This is Golden Principle #13 (surface assumptions)
applied specifically to visual design.

---

## 1. Prefer the official design system over hand-rolled CSS

If the brief names or clearly implies an ecosystem, use its official
package instead of recreating the look by hand:

| Brief reads as… | Reach for |
|---|---|
| Enterprise / Microsoft-flavored | Fluent UI |
| Material-flavored product | Material 3 (`@material/web`) |
| IBM-style B2B / data-dense | Carbon (`@carbon/react`) |
| GitHub-style devtool / OSS page | Primer |
| UK / US public-sector, trust-first | GOV.UK Frontend / USWDS |
| Modern SaaS, agent owns the components | shadcn/ui or Radix primitives |
| Small team / indie marketing | Tailwind utilities |

**Honesty rule:** if an official package matches, use it — do not import
its tokens and then override most of them, and do not mix two systems in
one tree. If the brief is a pure aesthetic with no owning package
(brutalism, editorial, glassmorphism, mesh gradients), say so explicitly
and build with native CSS instead of pretending a trend is a system.

---

## 2. Absolute bans (match-and-refuse, not "avoid when convenient")

If about to write any of these, stop and restructure the element instead:

```
❌ Gradient text (background-clip: text + gradient) for emphasis — use
   weight or size instead
❌ Side-stripe accent border (border-left/right > 1px as decoration) on
   cards, list items, callouts
❌ Glassmorphism as the default surface treatment — rare and purposeful,
   or not at all
❌ The hero-metric template: big number, small label, gradient accent
❌ Identical card grids — same-sized cards with icon+heading+text, repeated
❌ Tiny uppercase tracked "eyebrow" label above every section
❌ Numbered section markers (01 / 02 / 03) used as default scaffolding
   rather than because the content is an actual ordered sequence
❌ Heading copy untested at breakpoints — if it overflows on tablet/mobile,
   the design isn't done
```

## 3. The AI-default palette trap

The near-white warm-neutral band (OKLCH lightness ~0.84–0.97, chroma < 0.06,
hue 40–100 — reads as cream / sand / paper / linen / parchment regardless
of the token name) is the single most common "AI made this" tell for body
backgrounds. Token names like `--paper`, `--cream`, `--sand`, `--bone` are
tells in themselves. If the brief calls for "warm" or "editorial", carry
that warmth through accent color, typography, and imagery — not through a
near-white warm-tinted body background. Same logic for AI-purple gradient
heroes and Inter+slate-900 as an unexamined default: these are defaults
because they're the model's own reflex, not because they fit the brief.

Pick a deliberate color strategy before picking colors:
- **Restrained** — tinted neutrals + one accent ≤10% of the surface
- **Committed** — one saturated color carries 30–60% of the surface
- **Full palette** — 3–4 named roles, each used deliberately
- **Drenched** — the surface itself is the brand color

## 4. Motion discipline (extends `typography-rules.md` / `color-rules.md`,
   which don't currently cover motion)

```
□ Ease out with exponential curves (ease-out-quart/quint/expo) — no
  bounce, no elastic, unless the brief explicitly wants playful physics
□ prefers-reduced-motion is NOT optional — every animation needs a
  crossfade or instant-transition fallback
□ Don't animate layout-triggering CSS properties unless there's no
  transform/opacity equivalent
□ Reveal animations must enhance an already-visible default — never gate
  content visibility on a class-triggered transition (breaks on
  headless renderers and hidden tabs, ships blank)
□ Uniform stagger reflex (identical entrance applied to every section
  regardless of what it reveals) is the tell — not motion itself
```

## 5. Layout tells

```
□ Cards are the lazy default — use them only when they're genuinely the
  best affordance; nested cards inside cards are always wrong
□ Flexbox for one-dimensional layout, Grid for two-dimensional — don't
  reach for Grid when flex-wrap would be simpler
□ z-index values are a named semantic scale (dropdown → sticky →
  modal-backdrop → modal → toast → tooltip) — never arbitrary 999/9999
□ Vary spacing for rhythm — uniform spacing everywhere reads as
  unconsidered, not clean
```

---

## The AI-slop self-test

Before delivering, ask two questions at increasing altitude:

1. **First-order** — could someone guess the theme and palette from the
   page category alone (e.g. "fintech" → navy-and-gold)? If yes, the first
   training-data reflex won.
2. **Second-order** — even having avoided the obvious reflex, could someone
   guess the *replacement* aesthetic from category + the fact that it's
   avoiding the obvious choice (e.g. "AI tool, not SaaS-cream" → always
   lands on editorial-typographic)? If yes, the second reflex won too.

If either answer is yes, the brief hasn't actually been read — rework the
design read (Section 0) until the palette and aesthetic follow from the
brief's specifics, not from category pattern-matching.

---

## Agent Enforcement

Before an agent delivers any frontend component or page:
- [ ] One-line design read stated before any code was written
- [ ] Official design system used if the brief matched one (Section 1) —
      or explicitly declared as a pure-aesthetic build with no owning system
- [ ] Zero matches against the Section 2 absolute-ban list
- [ ] Body background is not in the AI-default warm-neutral band unless
      the brief's color strategy explicitly calls for it
- [ ] Every animation has a `prefers-reduced-motion` fallback
- [ ] Passes both first-order and second-order AI-slop self-test questions
