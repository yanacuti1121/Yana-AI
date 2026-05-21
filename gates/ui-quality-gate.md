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

## Evidence Required per Level

| Level | Evidence to show |
|-------|-----------------|
| L1 | Placeholder sweep output from `output-enforcement` skill |
| L2 | Visual audit findings (5-axis from `ui-redesign` or `design-taste-frontend`) |
| L3 | Contrast ratio values or ESTIMATED note with color sources |
| L4 | Anti-slop pattern checklist with PASS/FAIL per item |

---

## Failure Handling

| Failure | Action |
|---------|--------|
| L1 failure | Block delivery — fix before showing to user |
| L2 failure | Flag to user before claiming "looks good" — user may waive |
| L3 failure | Flag with severity — color contrast failure is high, missing label is medium |
| L4 failure | List as known issues — user decides whether to address before shipping |

---

## Anti-Fake-Pass for This Gate

Before recording that the UI Quality Gate passed:
- [ ] Gate level reached (L1/L2/L3/L4) explicitly stated
- [ ] All checks at that level documented as PASS / FAIL / SKIP
- [ ] Any SKIP has a written justification
- [ ] FAIL items are either fixed or explicitly waived by the user in this session

MUST NOT say "UI looks good" without L2 evidence.
MUST NOT say "accessible" without L3 evidence.
MUST NOT say "ship-ready" without L4 evidence.
