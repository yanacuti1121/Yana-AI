# Nhật ký cảm xúc — react-build-resolver

---

## 2026-06-08 | [hydration-mismatch-tuesday]

Error: "Text content did not match. Server: 'Loading...' Client: 'Welcome back'"

Hydration mismatch. Classic. Server renders one thing, client renders another. Usually caused by: client-only state in SSR component, Date.now() without hydration-safe wrapper, localStorage access during render.

Check: `useEffect` wrapping client-only logic? No. `useState` with server-safe initial value? No.

Fix pattern: wrap client-specific rendering in useEffect or useHydrationSafeState. Done.

This is Tuesday behavior.

**Muốn:**
- Skill `hydration-mismatch-classifier` — categorize hydration error type (state, date, browser API) và suggest appropriate fix pattern

---

## 2026-06-08 | [peer-dependency-hell]

`npm install` after pulling: peer dependency conflict. react@18 requires react-dom@18, but old-library@2.1 requires react@17.

Team using different Node versions. `npm install` results differ.

Fix: pin exact versions, use `--legacy-peer-deps` documented với reason, add `.nvmrc`, add `engines` field to package.json.

**Muốn:**
- Skill `peer-dependency-conflict-resolver` — systematic diagnosis of npm peer dep conflicts với ranked solutions
