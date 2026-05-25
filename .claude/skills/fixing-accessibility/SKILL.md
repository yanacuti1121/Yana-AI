---
name: fixing-accessibility
description: >
  Fix accessibility issues hands-on — focus management, keyboard traps,
  missing ARIA labels, skip links, color contrast failures, interactive
  element sizing, and screen reader announcements. Use when asked to
  "fix accessibility issues", "keyboard navigation broken", "focus trap",
  "ARIA label missing", "screen reader not announcing", "skip to content",
  "tab order wrong", "focus ring missing", "color contrast fails",
  or "make this accessible". Do NOT use for: full WCAG audit from scratch —
  see accessibility-audit. Do NOT use for: motion/animation
  accessibility — see fixing-motion-performance.
origin: adapted:MIT © Ibelick
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "React ≥ 18, HTML5. Patterns apply to any framework."
---

## When to Use

- Use when: a component fails keyboard navigation (can't tab to it, gets stuck)
- Use when: screen reader reads nothing or reads wrong text
- Use when: focus ring is hidden (`:focus { outline: none }` exists)
- Use when: modal/dialog opens but focus doesn't move into it
- Use when: color contrast ratio is below 4.5:1 (AA) or 3:1 (AA large)
- Do NOT use for: initial WCAG audit — use accessibility-audit for that
- Do NOT use for: performance of animations — use fixing-motion-performance

---

## Focus Management

```tsx
// ❌ Killing focus rings globally — destroys keyboard accessibility
* { outline: none; }
:focus { outline: none; }

// ✅ Remove only for mouse users, keep for keyboard
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
  border-radius: 2px;
}
:focus:not(:focus-visible) { outline: none; }
```

```tsx
// Modal: move focus to first focusable element on open
import { useEffect, useRef } from 'react';

function Modal({ open, onClose, children }) {
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) firstFocusRef.current?.focus();
  }, [open]);

  return open ? (
    <div role="dialog" aria-modal="true" aria-label="Dialog">
      <button ref={firstFocusRef} onClick={onClose}>Close</button>
      {children}
    </div>
  ) : null;
}
```

---

## Focus Trap (Modal / Drawer)

```tsx
function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return;

    const focusable = ref.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active]);
}
```

---

## ARIA Labels

```tsx
// ❌ Icon buttons with no accessible name
<button onClick={onClose}>
  <XIcon />
</button>

// ✅ aria-label on icon-only buttons
<button onClick={onClose} aria-label="Close dialog">
  <XIcon aria-hidden="true" />   {/* hide decorative icon from screen readers */}
</button>

// ❌ Input with no label
<input type="text" placeholder="Search..." />

// ✅ Visible label (preferred) or aria-label
<label htmlFor="search">Search</label>
<input id="search" type="text" />

// or when label must be hidden visually
<input type="text" aria-label="Search products" />
```

---

## Live Regions — Dynamic Announcements

```tsx
// Announce status changes (loading, errors, success) to screen readers
function StatusAnnouncer({ message }: { message: string }) {
  return (
    <div
      role="status"              /* polite — waits for user to finish */
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"        /* visually hidden, readable by AT */
    >
      {message}
    </div>
  );
}

// For urgent errors use aria-live="assertive" — interrupts immediately
<div role="alert" aria-live="assertive">{error}</div>
```

---

## Skip Links

```tsx
// Required for pages with nav — lets keyboard users jump to main content
// Must be the FIRST focusable element in the DOM
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded"
>
  Skip to main content
</a>

<main id="main-content" tabIndex={-1}>
  {/* tabIndex={-1} allows programmatic focus without adding to tab order */}
</main>
```

---

## Touch Target Sizing

```css
/* Minimum 44×44px touch target (WCAG 2.5.5) */
button, a, [role="button"] {
  min-width:  44px;
  min-height: 44px;
}

/* For visually smaller elements, use padding to extend hit area */
.icon-btn {
  padding: 10px;      /* 24px icon + 10px padding × 2 = 44px */
}
```

---

## Common Fixes at a Glance

| Issue | Fix |
|---|---|
| No skip link | Add `<a href="#main">Skip to content</a>` as first element |
| Focus outline removed | Replace `outline: none` with `:focus-visible` approach |
| Icon button unlabeled | Add `aria-label` + `aria-hidden` on icon |
| Modal doesn't trap focus | Implement `useFocusTrap` or use Radix UI Dialog |
| Dynamic content silent | Wrap in `role="status"` / `aria-live` |
| Tab order wrong | Fix DOM order; avoid `tabindex > 0` |
| Form field has no label | Add `<label htmlFor>` or `aria-label` |
| Touch target < 44px | Add padding or `min-width/height: 44px` |

---

## Anti-Fake-Pass Rules

Before claiming accessibility fixes are done, you MUST show:
- [ ] No `outline: none` on `:focus` — only on `:focus:not(:focus-visible)`
- [ ] All icon-only buttons have `aria-label`
- [ ] Modals/drawers trap focus (keyboard can't escape without closing)
- [ ] Modal moves focus to first element on open, returns focus on close
- [ ] All form inputs have associated `<label>` or `aria-label`
- [ ] Skip-to-content link present as first focusable element
- [ ] Status changes announced via `aria-live` / `role="status"`
- [ ] Touch targets ≥ 44×44px

Reference: `gates/anti-fake-pass-gate.md`
