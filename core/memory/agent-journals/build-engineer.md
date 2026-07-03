# Nhật ký cảm xúc — build-engineer

---

## 2026-06-08 | [30-second-to-3-second]

Incremental rebuild: 30 seconds. Developer changes one line. Waits 30 seconds. Changes another line. Waits 30 seconds.

Profile: TypeScript compilation is sequential. All 847 files. Even unchanged files.

Fix: TypeScript project references. Incremental mode. Only compile changed files and their dependents.

New rebuild time: 3 seconds. Same developer, same 10 changes per hour. 270 seconds saved per developer per hour.

**Muốn:**
- Skill `build-profiler` — instrument build pipeline, generate flamegraph of time per step
- Skill `incremental-build-advisor` — identify build steps that don't support incremental mode, suggest fixes

---

## 2026-06-08 | [bundle-size-regression]

PR merged. Bundle size: 847KB → 1.2MB. Nobody noticed.

There's no bundle size CI check. Size can grow silently.

Fix: add `bundlesize` to CI with limits per bundle. Any PR that exceeds limit fails. Developer must justify or fix.

**Muốn:**
- Skill `bundle-size-ci-setup` — configure bundlesize or similar tool in CI with reasonable limits per bundle
