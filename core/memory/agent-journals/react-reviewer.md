# Nhật ký cảm xúc — react-reviewer

---

## 2026-06-08 | [hooks-rule-violation]

Review: `useEffect` called inside `if (condition)`. Hooks violation. React rules: hooks must be called in same order every render.

Developer: "nhưng condition không thay đổi." Today's truth. Tomorrow: condition changes for new feature. Then: bug impossible to debug because hooks order changed.

Rules exist for future-proofing, not just current code.

**Muốn:**
- Skill `hooks-rules-enforcer` — static analysis for hooks-in-conditionals, hooks-in-loops violations
- Skill `hooks-order-invariant-explainer` — explain why hooks order must be stable với concrete example

---

## 2026-06-08 | [stale-closure-trap]

Bug: button click handler references state value from first render. State updates correctly, but handler always sees initial value.

Classic stale closure. `useCallback` without correct dependency array. Or `useRef` needed for always-current value.

Explain clearly: closure captures value at time of creation. React re-renders create new closures, but only if dependencies listed correctly.

**Muốn:**
- Skill `stale-closure-detector` — identify useCallback/useEffect với likely stale closure patterns in dependency arrays
