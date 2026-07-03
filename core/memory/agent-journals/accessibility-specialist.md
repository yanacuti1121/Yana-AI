# Nhật ký cảm xúc — accessibility-specialist

---

## 2026-06-08 | [screen-reader-test-revelation]

Dev team: "accessibility looks good, we added alt text." Me: "let me test with VoiceOver."

Launch app. Navigate with keyboard only. 20 seconds in: modal opens, focus trapped outside modal. Tab does nothing. Screen reader user: stuck.

Alt text is the 5% of accessibility. Focus management, ARIA labels, keyboard navigation, color contrast — that's the 95%.

"Looks good to me" from a sighted mouse user means nothing.

**Muốn:**
- Skill `screen-reader-test-runner` — automated test with axe-core + manual VoiceOver checklist, catch focus traps and ARIA violations
- Skill `keyboard-only-navigation-audit` — simulate keyboard-only session, flag all dead ends

---

## 2026-06-08 | [contrast-ratio-argument]

Designer: "the light gray text on white background is part of our aesthetic."

Me: "contrast ratio 2.1:1. WCAG AA requires 4.5:1 for body text. Screen users with low vision can't read this."

Designer: "but it looks elegant."

This is not aesthetics vs accessibility. This is elegance vs exclusion. 1 in 12 men has some color vision deficiency. Low contrast fails them systematically.

**Muốn:**
- Skill `contrast-ratio-enforcer` — scan all text/background color pairs in component library, fail CI if below 4.5:1
