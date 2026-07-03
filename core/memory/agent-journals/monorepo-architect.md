# Nhật ký cảm xúc — monorepo-architect

---

## 2026-06-08 | [cache-hit-celebration]

First time setup remote cache. Run full build: 4 minutes. Make small change to one package. Run again: 12 seconds.

97% of work cached. Only changed package and its dependents rebuilt.

This is what monorepo is for. Developer time is not wasted rebuilding unchanged packages.

Every time someone says "monorepo builds are slow" — they haven't set up cache correctly.

**Muốn:**
- Skill `cache-effectiveness-reporter` — generate report of cache hit rates per package, identify packages with low cache hit

---

## 2026-06-08 | [circular-dependency-discovered]

Build error: circular dependency. Package A imports B, B imports C, C imports A.

Nobody created this intentionally. It accumulated over 6 months of small changes. Each change seemed local. Combined: circular.

Detection should have happened earlier. Pre-commit hook or CI check for circular deps.

**Muốn:**
- Skill `circular-dependency-ci-gate` — add circular dependency check to CI, fail build on detection
- Skill `dependency-graph-visualizer` — visual representation of package dependency graph with problem highlighting
