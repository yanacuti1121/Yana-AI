---
name: monorepo-governance
description: Monorepo governance patterns from Nx, Turborepo, and Changesets. Task graph execution, affected-only CI, remote caching, module boundary enforcement, shared config packages, and coordinated versioning. Sources: nrwl/nx, vercel/turborepo, changesets/changesets, nicowillis/pkg-size, nicowillis/size-limit, nicowillis/wireit.
origin: yamtam-engine — synthesized from nrwl/nx, vercel/turborepo, changesets/changesets, nicowillis/pkg-size, nicowillis/size-limit, nicowillis/wireit
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.39
---

# /monorepo-governance

## When to Use

- Setting up CI to only rebuild what changed
- Enforcing that packages don't import from sibling internals
- Coordinating version bumps across packages before publish
- "CI takes 20 min but only one package changed"

## Do NOT use for

- Single-package repos
- Repos without package-level boundaries (flat source tree)

---

## Affected-Only CI (Nx)

```bash
# Nx: only run affected tests/build since last successful CI
npx nx affected --target=test --base=origin/main --head=HEAD

# Turborepo: filter to changed packages
npx turbo run test --filter="...[origin/main]"
# [origin/main] = "packages that changed since main"

# Rule: never run all tests in CI on every PR
# Use affected detection + remote cache = CI 5-10× faster
```

---

## Task Pipeline (Turborepo)

```json
// turbo.json — declare dependencies between tasks
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],   // ^ = run upstream builds first
      "inputs": ["src/**", "tsconfig.json"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "cache": true
    },
    "lint": {
      "cache": true
    },
    "dev": {
      "cache": false,
      "persistent": true         // long-running, don't cache
    }
  }
}
```

---

## Module Boundary Enforcement (Nx)

```json
// project.json — tag packages by domain
{ "tags": ["scope:auth", "type:feature"] }
{ "tags": ["scope:shared", "type:util"] }

// .eslintrc.json — enforce boundary rules
{
  "rules": {
    "@nx/enforce-module-boundaries": ["error", {
      "depConstraints": [
        {
          "sourceTag": "scope:auth",
          "onlyDependOnLibsWithTags": ["scope:shared", "scope:auth"]
        },
        {
          "sourceTag": "type:feature",
          "notDependOnLibsWithTags": ["type:feature"]
          // features don't depend on other features — only on shared libs
        }
      ]
    }]
  }
}
```

---

## Shared Config Packages

```
packages/
  config-eslint/       ← shared ESLint config
    index.js           → module.exports = { extends: [...], rules: {...} }
  config-typescript/   ← shared tsconfig
    base.json          → { "compilerOptions": { "strict": true, ... } }
  config-jest/         ← shared Jest preset
    jest.config.js     → module.exports = { preset: 'ts-jest', ... }

// Each app/lib extends the shared config:
// .eslintrc.json:   { "extends": ["@myrepo/config-eslint"] }
// tsconfig.json:    { "extends": "@myrepo/config-typescript/base.json" }
```

---

## Coordinated Versioning (Changesets)

```bash
# 1. Developer adds changeset when making a PR
npx changeset
# → prompts: which packages changed? what bump? (patch/minor/major)
# → writes .changeset/some-name.md

# 2. CI (Version PR): accumulate changesets → bump versions + CHANGELOG
npx changeset version

# 3. Publish all bumped packages
npx changeset publish

# Rule: one changeset per PR, not per commit
# Rule: changesets bot auto-creates "Version Packages" PR when ready
```

---

## Remote Cache (Turborepo Cloud / Nx Cloud)

```bash
# Turborepo: link to Vercel Remote Cache
npx turbo link

# Nx: connect to Nx Cloud (free tier available)
npx nx connect

# What gets cached: task outputs (dist/, .next/, coverage/)
# Cache hit = skip task entirely — contributors share CI cache
# Rule: always set "outputs" in turbo.json — unconfigured = not cached
```

---

## Anti-Fake-Pass Checklist

```
❌ CI runs all packages on every PR (affected detection not set up)
❌ Feature package importing from another feature package (boundary violation)
❌ turbo.json task has no "outputs" (outputs are never cached)
❌ Version bumps done manually without changesets (drift between packages)
❌ Shared tsconfig not extended — each package has divergent compiler options
❌ "dev" task marked cache: true (persistent tasks must be cache: false)
```
