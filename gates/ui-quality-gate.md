# YAMTAM ENGINE — UI Quality Gate

**Status:** Active
**Origin:** yamtam (original)
**Companion skills:** `core/skills/design-taste-frontend`, `core/skills/output-enforcement`
**Related gate:** `gates/anti-fake-pass-gate.md`

---

## Purpose

This gate defines the minimum quality bar for any UI work before it is considered
deliverable. It is not a style guide — it is a pass/fail checklist.

Run this gate before marking any frontend task complete. It does not prevent
shipping imperfect UI; it prevents shipping UI without knowing what is imperfect.

---

## Gate Levels

| Level | Scope | Required for |
|-------|-------|--------------|
| L1 — Baseline | No broken states, no placeholders | Every UI delivery |
| L2 — Visual | Hierarchy, spacing, color discipline | Any "looks good" claim |
| L3 — Accessible | WCAG AA minimum | Production-facing UI |
| L4 — Polish | Anti-slop patterns eliminated | "Ship-ready" claim |

---

## L1 — Baseline (mandatory for every delivery)

```
□ No Lorem Ipsum, placeholder text, or [TODO] in visible content
□ No 404/broken images
□ No JavaScript console errors on initial load (if verifiable)
□ Interactive elements respond to click/tap
□ Page/component does not overflow its container at 1280px
```

**Block condition:** Any L1 item unchecked → delivery is blocked.

---

## L2 — Visual Quality

```
□ Clear visual hierarchy: one primary element dominates each view
□ Spacing is consistent — same values for same relationships (e.g., card padding always 16px)
□ Maximum 3 colors in active use per view (background + text + accent)
□ Maximum 3 font sizes per view
□ No gradient + shadow + border all applied to the same element simultaneously
```

**Required for:** any claim that "the UI looks good" or "design is done."

---

## L3 — Accessibility Baseline

```
□ All images have alt text (empty alt for decorative)
□ Color contrast ≥ 4.5:1 for normal text (verified or estimated with source noted)
□ All interactive elements keyboard-accessible
□ Form inputs have associated labels
□ No content conveyed by color alone
```

**Required for:** production-facing UI, any public-facing page.

---

## L4 — Polish (Anti-Slop)

Run the anti-slop checklist from `core/skills/design-taste-frontend`:

```
□ No gradient abuse
□ No emoji as functional icons
□ No centered body content (only hero/marketing sections)
□ Hover and focus states on all interactive elements
□ Responsive: tested at 375px mobile breakpoint
□ No commented-out dead code in delivered output
```

**Required for:** any "ship-ready" or "production-ready" claim.

---

## L5 — Tailwind Hard Rules (Vercel/baseline-ui standard)

Hard blocks — any violation is a REJECT, not a flag:

```
❌ REJECT if: utility class count per element > 8 (extract to component or @apply)
❌ REJECT if: hardcoded hex/rgb colors used instead of CSS variables or Tailwind tokens
❌ REJECT if: outline: none or :focus { outline: none } exists — kills keyboard nav
❌ REJECT if: img elements are inline (display not set) — causes 4px phantom gap
❌ REJECT if: no prefers-reduced-motion override for any CSS animation/transition
❌ REJECT if: line-height not set on body (browser default ~1.2 is too tight)

□ box-sizing: border-box applied globally
□ font-smoothing: antialiased set
□ All touch targets ≥ 44×44px
```

---

## L6 — Performance Budget (Vercel web-performance standard)

```
□ LCP < 2.5s (Largest Contentful Paint)
□ FID / INP < 200ms (interaction responsiveness)
□ CLS < 0.1 (no layout shift from images/fonts loading)
□ No render-blocking scripts in <head> (use defer/async)
□ Images have explicit width + height (prevent CLS)
□ Fonts loaded with font-display: swap (no invisible text flash)
□ AI streaming UI: first token visible < 500ms, stop button shown during stream
```

---

## L7 — Generative UI Checks (Vercel AI SDK)

Required if component uses `useChat`, `streamText`, or AI-generated content:

```
□ isLoading disables input — no double-submit possible
□ stop() button visible during streaming
□ Error state surfaces in UI (not just console.error)
□ Tool call progress shown (call → result transition)
□ maxDuration set on route handler
□ Token usage logged server-side
```

---

## Evidence Required per Level

| Level | Evidence to show |
|-------|-----------------|
| L1 | Placeholder sweep output from `output-enforcement` skill |
| L2 | Visual audit findings (5-axis from `ui-redesign` or `design-taste-frontend`) |
| L3 | Contrast ratio values or ESTIMATED note with color sources |
| L4 | Anti-slop pattern checklist with PASS/FAIL per item |
| L5 | Tailwind grep output: no inline colors, no `outline: none`, utility count checked |
| L6 | Lighthouse score or manual checklist with LCP/CLS values noted |
| L7 | Streaming UI checklist signed off (only if AI SDK used) |

---

## Failure Handling

| Failure | Action |
|---------|--------|
| L1 failure | Block delivery — fix before showing to user |
| L2 failure | Flag to user before claiming "looks good" — user may waive |
| L3 failure | Flag with severity — color contrast failure is high, missing label is medium |
| L4 failure | List as known issues — user decides whether to address before shipping |
| L5 failure | **HARD REJECT** — Tailwind hard rules are non-negotiable |
| L6 failure | Flag with metric values — user decides threshold for their product |
| L7 failure | **HARD REJECT** if AI SDK used — streaming UX bugs break trust |

---

## Anti-Fake-Pass for This Gate

Before recording that the UI Quality Gate passed:
- [ ] Gate level reached (L1–L7) explicitly stated
- [ ] All checks at that level documented as PASS / FAIL / SKIP
- [ ] Any SKIP has a written justification
- [ ] FAIL items are either fixed or explicitly waived by the user in this session
- [ ] L5 Tailwind hard rules: zero violations (no waiver allowed)

MUST NOT say "UI looks good" without L2 evidence.
MUST NOT say "accessible" without L3 evidence.
MUST NOT say "ship-ready" without L4+L5 evidence.
MUST NOT say "AI streaming UI is done" without L7 evidence.
