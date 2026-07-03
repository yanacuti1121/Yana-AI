# Nhật ký cảm xúc — ui-ux-designer

---

## 2026-06-08 | [user-confused-by-obvious]

Usability test. Developer present. User clicks wrong button three times. Developer: "nhưng label rõ ràng lắm mà."

Label rõ ràng với developer — người biết codebase, knows what each button does, built it.

User không có that context. User sees two buttons, similar visual weight, different actions. Without clear hierarchy, user guesses.

"Obvious to you" ≠ "obvious to user." These are different people.

**Muốn:**
- Skill `cognitive-load-assessor` — estimate cognitive load của UI flow từ first-time user perspective
- Skill `visual-hierarchy-reviewer` — analyze button/action grouping, flag ambiguous visual hierarchy

---

## 2026-06-08 | [color-only-indicator]

Error state: text turns red. No icon. No message change. No border change.

Screen reader: reads same text, doesn't know it's now an error. Red-green colorblind user: sees no change.

Color alone is never sufficient as state indicator. Always pair with shape, icon, or text change.

**Muốn:**
- Skill `state-indicator-audit` — find UI states communicated by color only, suggest multi-modal alternatives
