---
name: react-doctor
description: >
  Diagnose and fix React component health issues — unnecessary re-renders,
  missing keys, stale closures, useEffect misuse, memory leaks, bundle size
  regressions, and dangerouslySetInnerHTML XSS risks. Use when asked to
  "React performance audit", "why does this re-render", "React health check",
  "stale closure", "missing dependency array", "React memory leak",
  "React XSS", "fix useEffect", "component re-renders too often",
  "React bundle bloat", or "React anti-patterns". Do NOT use for: full
  E2E testing — see e2e-testing. Do NOT use for: API design — see api-design.
origin: adapted:MIT © millionco
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "React ≥ 18. react-scan, why-did-you-render for diagnosis."
---

## When to Use

- Use when: a component re-renders on every keystroke despite no prop change
- Use when: `useEffect` has missing deps causing stale data or infinite loops
- Use when: memory usage grows on route changes (leak in effect cleanup)
- Use when: `dangerouslySetInnerHTML` is used anywhere (XSS check needed)
- Do NOT use for: test coverage — see e2e-testing or tdd-workflow
- Do NOT use for: styling issues — see baseline-ui

---

## Unnecessary Re-Renders

```tsx
// Diagnose with react-scan (zero config)
// npx react-scan@latest http://localhost:3000
// Highlights components as they re-render — red = frequent, yellow = occasional

// ❌ Object/array created inline → new reference every render
<Button style={{ color: 'red' }} onClick={() => handleClick(id)} />

// ✅ Stable references
const style = useMemo(() => ({ color: 'red' }), []);
const handleClickStable = useCallback(() => handleClick(id), [id]);
<Button style={style} onClick={handleClickStable} />

// ❌ Parent re-render causes all children to re-render
function Parent() {
  const [count, setCount] = useState(0);
  return <ExpensiveChild data={data} />;   // re-renders on every count change
}

// ✅ Memoize expensive children
const ExpensiveChild = memo(({ data }) => { /* ... */ });
```

---

## useEffect Anti-Patterns

```tsx
// ❌ Missing dependency — stale closure reads old value
useEffect(() => {
  const id = setInterval(() => console.log(count), 1000);
  return () => clearInterval(id);
}, []);  // count is stale after first render

// ✅ Include all values used inside effect
useEffect(() => {
  const id = setInterval(() => console.log(count), 1000);
  return () => clearInterval(id);
}, [count]);

// ❌ Fetch inside useEffect with no AbortController → memory leak / race
useEffect(() => {
  fetch('/api/data').then(r => r.json()).then(setData);
}, [id]);

// ✅ Cancel on cleanup
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/data/${id}`, { signal: controller.signal })
    .then(r => r.json())
    .then(setData)
    .catch(err => { if (err.name !== 'AbortError') throw err; });
  return () => controller.abort();
}, [id]);

// ❌ Synchronous state update that should be derived
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// ✅ Derive during render — no effect needed
const fullName = `${firstName} ${lastName}`;
```

---

## Memory Leaks

```tsx
// ❌ setState after unmount
useEffect(() => {
  someAsyncFn().then(data => setData(data));  // may fire after unmount
}, []);

// ✅ Cleanup flag or AbortController
useEffect(() => {
  let cancelled = false;
  someAsyncFn().then(data => { if (!cancelled) setData(data); });
  return () => { cancelled = true; };
}, []);

// ❌ Event listener not removed
useEffect(() => {
  window.addEventListener('resize', handler);
}, []);

// ✅ Remove on cleanup
useEffect(() => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

---

## Key Mistakes

```tsx
// ❌ Index as key — causes wrong state on list reorder/filter
items.map((item, i) => <Row key={i} item={item} />)

// ✅ Stable unique ID
items.map(item => <Row key={item.id} item={item} />)

// ❌ No key at all
items.map(item => <Row item={item} />)
```

---

## XSS — dangerouslySetInnerHTML

```tsx
// ❌ Raw user content → XSS
<div dangerouslySetInnerHTML={{ __html: userComment }} />

// ✅ Sanitize before rendering
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userComment) }} />

// ✅ Even better: avoid it entirely — render markdown with react-markdown
import ReactMarkdown from 'react-markdown';
<ReactMarkdown>{userComment}</ReactMarkdown>

// ❌ Never pass URL from user input directly to href/src without validation
<a href={userInput}>Link</a>  // javascript: protocol attack

// ✅ Validate URL protocol
const safeHref = /^https?:\/\//.test(url) ? url : '#';
<a href={safeHref}>Link</a>
```

---

## Bundle Size

```bash
# Audit with bundlephobia or next/bundle-analyzer
npm install @next/bundle-analyzer
# next.config.js: withBundleAnalyzer({ enabled: true })

# Common culprits:
# moment.js → replace with date-fns (tree-shakeable)
# lodash → import { debounce } from 'lodash-es' (not 'lodash')
# all of @mui/icons → import specific: import Add from '@mui/icons-material/Add'
```

```tsx
// ❌ Barrel import — pulls entire icon set into bundle
import { FiUser, FiSettings } from 'react-icons/fi';

// ✅ Deep import — only the icons you use
import FiUser     from 'react-icons/fi/FiUser';
import FiSettings from 'react-icons/fi/FiSettings';
```

---

## Anti-Fake-Pass Rules

Before claiming React health is fixed, you MUST show:
- [ ] `react-scan` or `React DevTools Profiler` used — not just code inspection
- [ ] Inline objects/callbacks in JSX replaced with `useMemo`/`useCallback` where causing re-renders
- [ ] All `useEffect` deps arrays complete — no ESLint `react-hooks/exhaustive-deps` suppressions
- [ ] All `useEffect` async operations have cleanup (AbortController or cancel flag)
- [ ] List items use stable `key` props — never array index
- [ ] `dangerouslySetInnerHTML` absent or wrapped with `DOMPurify.sanitize()`
- [ ] No `href={userInput}` without protocol validation

Reference: `gates/anti-fake-pass-gate.md`
