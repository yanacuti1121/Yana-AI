---
name: interface-feel
description: >
  Make interfaces feel responsive and alive — micro-interactions, spring
  physics, press states, optimistic updates, skeleton loaders, cursor
  feedback, sound design hints, and delight moments. Use when asked to
  "make this feel better", "interface feels unresponsive", "add micro-interactions",
  "the UI feels dead", "springy animations", "delight", "optimistic UI",
  "skeleton screen", "cursor feedback", "feel more like a native app",
  "haptic feedback patterns", or "interface lacks personality". Do NOT use
  for: animation performance — see fixing-motion-performance. Do NOT use
  for: full animation system design — see motion-design.
origin: adapted:MIT © jakubkrehel
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "React ≥ 18, Framer Motion v11. Patterns apply to any interactive UI."
---

## When to Use

- Use when: button clicks feel delayed or unacknowledged
- Use when: loading states show spinner but page feels frozen
- Use when: the interface feels like a form, not a product
- Use when: adding delight moments to a well-functioning but dry UI
- Do NOT use for: animation performance issues — see fixing-motion-performance
- Do NOT use for: typography and spacing polish — see impeccable

---

## Instant Feedback — The 100ms Rule

```
< 16ms  : imperceptible — system state change
< 100ms : instant — user perceives as immediate
< 300ms : fast — acceptable for animation
> 300ms : needs loader — user notices the wait
> 1000ms: needs progress — or user thinks it's broken
```

```tsx
// ✅ Respond in < 16ms — state changes before animation
<motion.button
  onPointerDown={() => setPressed(true)}  // visual response on pointer down, not click
  onPointerUp={() => setPressed(false)}
  animate={{ scale: pressed ? 0.96 : 1 }}
  transition={{ type: 'spring', stiffness: 800, damping: 25 }}
>
  Submit
</motion.button>
```

---

## Spring Physics

```tsx
// Spring vs duration-based: spring feels physical, duration feels programmed
// type: 'spring', stiffness, damping, mass — tune these three

// Snappy UI response (button, toggle)
const snappy = { type: 'spring', stiffness: 700, damping: 30 };

// Bouncy, playful (success state, notification badge)
const bouncy = { type: 'spring', stiffness: 400, damping: 10, mass: 0.8 };

// Smooth, heavy (modal, drawer)
const smooth = { type: 'spring', stiffness: 200, damping: 30, mass: 1.2 };

// Instant (toggle switch, checkbox)
const instant = { type: 'spring', stiffness: 2000, damping: 100 };
```

---

## Optimistic Updates

```tsx
// Don't wait for server — update UI immediately, roll back on error
function LikeButton({ postId, initialLiked }) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(post.likes);

  async function handleLike() {
    const prev = { liked, count };
    setLiked(!liked);                     // immediate visual response
    setCount(c => liked ? c - 1 : c + 1);

    try {
      await api.toggleLike(postId);
    } catch {
      setLiked(prev.liked);               // rollback on failure
      setCount(prev.count);
      toast.error('Could not save — try again');
    }
  }

  return (
    <motion.button
      onClick={handleLike}
      animate={{ scale: liked ? [1, 1.3, 1] : 1 }}
      transition={{ duration: 0.25 }}
    >
      {liked ? '❤️' : '🤍'} {count}
    </motion.button>
  );
}
```

---

## Skeleton Screens (vs Spinners)

```tsx
// Spinners: "something is loading — don't know what"
// Skeletons: "here's where the content will land" — reduces layout shift

function ProductCardSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-48 bg-gray-200 rounded-lg" />        {/* image placeholder */}
      <div className="h-4 bg-gray-200 rounded w-3/4" />      {/* title */}
      <div className="h-3 bg-gray-200 rounded w-1/2" />      {/* subtitle */}
      <div className="h-8 bg-gray-200 rounded w-1/3" />      {/* price */}
    </div>
  );
}
```

```css
/* Custom shimmer — more polished than Tailwind animate-pulse */
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

.skeleton {
  background: linear-gradient(90deg,
    hsl(220 14% 92%) 25%,
    hsl(220 14% 96%) 50%,
    hsl(220 14% 92%) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}
```

---

## Cursor Feedback

```css
/* Cursor communicates affordance */
button, [role="button"], a, label[for] { cursor: pointer; }
input[type="text"], textarea           { cursor: text; }
[draggable="true"]                     { cursor: grab; }
[draggable="true"]:active              { cursor: grabbing; }
[disabled], [aria-disabled="true"]     { cursor: not-allowed; opacity: 0.5; }
```

---

## Delight Moments

```tsx
// Confetti on first-time success
import confetti from 'canvas-confetti';

function SuccessModal({ isFirstOrder }) {
  useEffect(() => {
    if (isFirstOrder) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  }, [isFirstOrder]);
  // ...
}

// Number count-up on stat reveal
<motion.span
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  onAnimationComplete={() => controls.start({ value: targetValue })}
>
  <Counter from={0} to={targetValue} duration={1} />
</motion.span>
```

---

## Empty States That Invite Action

```tsx
// ❌ "No results found." — unhelpful, dead end
// ✅ Empty state with illustration + action + context
function EmptyTaskList({ onAdd }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-4 py-16 text-center"
    >
      <TaskEmptyIllustration className="w-40 opacity-60" />
      <p className="text-muted-foreground text-sm">
        No tasks yet — add your first to get started.
      </p>
      <Button onClick={onAdd}>Add task</Button>
    </motion.div>
  );
}
```

---

## Anti-Fake-Pass Rules

Before claiming the interface "feels good", you MUST show:
- [ ] Buttons respond on `pointerDown`, not `click` (16ms faster)
- [ ] Spring physics used for interactive elements — not linear/ease duration
- [ ] Optimistic updates implemented for like/follow/save actions
- [ ] Skeletons used for content areas that load — not spinners for layout-bearing areas
- [ ] Cursor changes for disabled, draggable, text states
- [ ] Empty states have illustration + context + primary action
- [ ] At least one delight moment in success/onboarding flow

Reference: `gates/anti-fake-pass-gate.md`
