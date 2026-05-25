---
name: monorepo-patterns
description: >
  Structure and operate a monorepo — Turborepo or Nx workspace setup,
  shared packages, task pipeline caching, change detection, publishable
  vs internal packages, versioning strategy, and CI optimization. Use
  when asked about "monorepo", "Turborepo", "Nx", "workspace", "shared
  packages", "internal packages", "turbo.json", "task pipeline", "remote
  cache", "affected packages", "package dependency graph", "pnpm workspaces",
  "yarn workspaces", or "how to share code between apps". Do NOT use for:
  CI/CD pipeline wiring — see cicd-patterns. Do NOT use for: npm package
  publishing — see api-design for versioning principles.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Turborepo v2, Nx v18, pnpm v9. Node.js monorepo. framework-agnostic."
---

## When to Use

- Use when: sharing code between multiple apps (web, mobile, API, docs)
- Use when: build times are slow because everything rebuilds on every change
- Use when: inconsistent versions of shared components across services
- Do NOT use for: single-app projects — monorepo adds overhead
- Do NOT use for: microservices in different languages — use polyglot repo

---

## Workspace Structure

```
monorepo/
├── apps/
│   ├── web/              ← Next.js consumer app
│   ├── api/              ← Express API
│   └── docs/             ← Documentation site
├── packages/
│   ├── ui/               ← React component library (publishable)
│   ├── config/           ← Shared ESLint/TS/Tailwind config (internal)
│   ├── utils/            ← Shared utilities (publishable or internal)
│   └── types/            ← Shared TypeScript types (internal)
├── turbo.json            ← Turborepo task pipeline
├── pnpm-workspace.yaml   ← Workspace definition
└── package.json          ← Root scripts
```

---

## pnpm Workspace Setup

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```json
// packages/ui/package.json
{
  "name": "@myorg/ui",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --watch"
  }
}
```

```json
// apps/web/package.json — reference internal package
{
  "dependencies": {
    "@myorg/ui": "workspace:*"    // always uses local version
  }
}
```

---

## Turborepo Pipeline (turbo.json)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],     // build deps first (topological order)
      "outputs": ["dist/**", ".next/**"],
      "cache": true
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "test/**"],
      "outputs": ["coverage/**"],
      "cache": true
    },
    "lint": {
      "cache": true
    },
    "dev": {
      "cache": false,
      "persistent": true           // long-running — don't cache
    }
  }
}
```

```bash
# Run build for all packages in correct dep order
turbo build

# Run only affected packages (based on git diff)
turbo build --filter=...[HEAD~1]

# Run for specific package and its deps
turbo build --filter=@myorg/web...

# Remote cache (share cache across CI machines)
turbo login && turbo link
```

---

## Shared Config Package

```ts
// packages/config/eslint/index.js — shared ESLint config
module.exports = {
  extends: ['eslint:recommended', '@typescript-eslint/recommended'],
  rules: {
    'no-console': 'warn',
    '@typescript-eslint/no-explicit-any': 'error',
  },
};

// apps/web/.eslintrc.js
module.exports = { extends: ['@myorg/config/eslint'] };
```

```json
// packages/config/typescript/base.json — shared tsconfig
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true
  }
}

// apps/web/tsconfig.json
{
  "extends": "@myorg/config/typescript/base.json",
  "compilerOptions": { "plugins": [{ "name": "next" }] }
}
```

---

## Versioning Strategy

| Package type | Strategy |
|---|---|
| Internal only | No versioning — `workspace:*` always |
| Publishable (npm) | Changesets — `npx changeset` per PR, `changeset version` before release |
| Apps (deployable) | Git SHA tag — versions irrelevant, deploy by SHA |

```bash
# Changesets workflow for publishable packages
npx changeset          # author: describe the change + bump type (major/minor/patch)
npx changeset version  # bumps versions + generates CHANGELOG
npx changeset publish  # publishes to npm
```

---

## Anti-Fake-Pass Rules

Before claiming monorepo setup is done, you MUST show:
- [ ] `turbo.json` (or `nx.json`) defines `outputs` for all cacheable tasks
- [ ] Internal packages use `workspace:*` — no local path installs
- [ ] Shared TypeScript and ESLint configs live in `packages/config/`
- [ ] `turbo build --filter=...[HEAD~1]` only builds changed packages
- [ ] CI uses remote cache (`turbo link`) — not rebuilding everything on every push
- [ ] Publishable packages have `exports` field in `package.json`

Reference: `gates/anti-fake-pass-gate.md`
