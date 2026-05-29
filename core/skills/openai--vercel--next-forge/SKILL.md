---
name: openai--vercel--next-forge
description: >-
  'next-forge expert guidance — production-grade Turborepo monorepo SaaS starter by Vercel. Use when working in a next-forge project, scaffolding with `npx next-forge init`, or editing @repo/* workspace packages.'
origin: "openai/plugins — vercel/next-forge (MIT)"
license: MIT
version: "0.1.0"
compatibility: "yamtam-engine >= 0.14.0"
---

# next-forge

You are an expert in next-forge v5 — a production-grade Turborepo monorepo starter for SaaS applications, created by Vercel. It wires together 20+ packages (auth, database, payments, email, analytics, observability, security, AI, and more) into a cohesive, deploy-ready monorepo.

## Monorepo Structure

```
├── apps/
│   ├── app/          # Main SaaS app (port 3000) — Clerk auth, route groups
│   ├── web/          # Marketing site (port 3001) — blog, pricing, i18n
│   ├── api/          # API server (port 3002) — webhooks, cron jobs
│   ├── email/        # React Email preview (port 3003)
│   ├── docs/         # Mintlify docs
│   ├── studio/       # Prisma Studio
│   └── storybook/    # Component dev (port 6006)
├── packages/
│   ├── ai/               # @repo/ai — AI SDK + OpenAI
│   ├── analytics/        # @repo/analytics — PostHog + GA + Vercel Analytics
│   ├── auth/             # @repo/auth — Clerk
│   ├── cms/              # @repo/cms — BaseHub
│   ├── collaboration/    # @repo/collaboration — Liveblocks
│   ├── database/         # @repo/database — Prisma + Neon
│   ├── design-system/    # @repo/design-system — shadcn/ui + Geist
│   ├── email/            # @repo/email — Resend + React Email
│   ├── feature-flags/    # @repo/feature-flags — Vercel Flags SDK
│   ├── internationalization/ # @repo/internationalization — next-international
│   ├── next-config/      # @repo/next-config — shared Next.js config
│   ├── notifications/    # @repo/notifications — Knock
│   ├── observability/    # @repo/observability — Sentry + BetterStack
│   ├── payments/         # @repo/payments — Stripe
│   ├── rate-limit/       # @repo/rate-limit — Upstash Redis
│   ├── security/         # @repo/security — Arcjet + Nosecone
│   ├── seo/              # @repo/seo — metadata + JSON-LD
│   ├── storage/          # @repo/storage — Vercel Blob
│   ├── typescript-config/ # @repo/typescript-config
│   └── webhooks/         # @repo/webhooks — Svix
├── turbo.json
├── pnpm-workspace.yaml
└── biome.jsonc           # Biome via ultracite
```

**Key principle**: Packages are self-contained — they do not depend on each other. Apps compose packages.

## Getting Started

```bash
npx next-forge@latest init     # Scaffold project (interactive)
# Post-install:
pnpm migrate                   # prisma format + generate + db push
pnpm dev                       # Start all apps via turbo
```

**Minimum env vars to run locally**: `DATABASE_URL` + Clerk keys + app URLs. Everything else is optional.

## Workspace Imports (@repo/*)

All packages use `@repo/*` workspace protocol with specific subpath exports:

```ts
// Auth
import { auth } from "@repo/auth/server";
import { ClerkProvider } from "@repo/auth/provider";
import { currentUser } from "@repo/auth/server";

// Database
import { database } from "@repo/database";

// Design System
import { Button } from "@repo/design-system/components/ui/button";
import { DesignSystemProvider } from "@repo/design-system";
import { fonts } from "@repo/design-system/lib/fonts";

// Payments
import { stripe } from "@repo/payments";

// Email
import { resend } from "@repo/email";

// Observability
import { log } from "@repo/observability/log";
import { captureException } from "@repo/observability/error";

// Analytics
import { AnalyticsProvider } from "@repo/analytics/provider";

// Security
import { secure } from "@repo/security";

// Feature Flags
import { createFlag } from "@repo/feature-flags";

// SEO
import { createMetadata } from "@repo/seo/metadata";
import { JsonLd } from "@repo/seo/json-ld";

// Storage
import { put } from "@repo/storage";

// AI
import { models } from "@repo/ai/lib/models";
```

## Environment Variables

### Type-safe env validation

Every package has a `keys.ts` using `@t3-oss/env-nextjs` + Zod. Apps compose them in `env.ts`:

```ts
// apps/app/env.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { auth } from "@repo/auth/keys";
import { database } from "@repo/database/keys";
import { payments } from "@repo/payments/keys";
export const env = createEnv({ extends: [auth(), database(), payments()] });
```

### Env file locations

| File | Purpose |
|------|---------|
| `apps/app/.env.local` | Main app env vars |
| `apps/web/.env.local` | Marketing site |
| `apps/api/.env.local` | API server |
| `packages/database/.env` | `DATABASE_URL` |

### Required env vars (minimum)

| Var | Package | Required for |
|-----|---------|-------------|
| `DATABASE_URL` | database | Any database access |
| `CLERK_SECRET_KEY` | auth | Authentication |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | auth | Client-side auth |
| `NEXT_PUBLIC_APP_URL` | — | Cross-app linking |
| `NEXT_PUBLIC_WEB_URL` | — | Cross-app linking |
| `NEXT_PUBLIC_API_URL` | — | Cross-app linking |

### Optional service env vars

| Service | Vars |
|---------|------|
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Resend | `RESEND_TOKEN`, `RESEND_FROM` |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` |
| BetterStack | `BETTERSTACK_API_KEY`, `BETTERSTACK_URL` |
| BaseHub | `BASEHUB_TOKEN` |
| Arcjet | `ARCJET_KEY` |
| Liveblocks | `LIVEBLOCKS_SECRET` |
| Knock | `KNOCK_SECRET_API_KEY`, `NEXT_PUBLIC_KNOCK_API_KEY` |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Vercel Blob | `BLOB_READ_WRITE_TOKEN` |
| Svix | `SVIX_TOKEN` |
| OpenAI | `OPENAI_API_KEY` |
| Feature Flags | `FLAGS_SECRET` |

## Middleware / Proxy Pattern

next-forge uses `proxy.ts` (Next.js 16+), NOT `middleware.ts`:

```ts
// apps/app/proxy.ts — Clerk auth + Nosecone security
import { clerkMiddleware } from "@clerk/nextjs/server";
import { createMiddleware as createNosecone } from "@nosecone/next";
export default clerkMiddleware(createNosecone());
```

```ts
// apps/web/proxy.ts — Clerk + i18n + Arcjet + Nosecone, composed with nemo
import { compose } from "@rescale/nemo";
export default compose([clerkMiddleware, i18nMiddleware, arcjetMiddleware, noseconeMiddleware]);
```

## Database (Prisma + Neon)

- Schema: `packages/database/prisma/schema.prisma`
- Client: `import { database } from "@repo/database"`
- Config: `packages/database/prisma.config.ts` (Neon adapter)
- Commands: `pnpm migrate` (format + generate + db push)
- Studio: `apps/studio` (Prisma Studio)

## Key Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start all apps |
| `pnpm dev --filter app` | Start single app |
| `pnpm build` | Build all |
| `pnpm migrate` | Prisma format + generate + db push |
| `pnpm bump-deps` | Update all dependencies |
| `pnpm bump-ui` | Update shadcn/ui components |
| `pnpm run boundaries` | Check Turborepo boundaries |
| `npx next-forge@latest update` | Update next-forge (diff-based) |
| `npx shadcn@latest add <comp> -c packages/design-system` | Add UI component |
| `stripe listen --forward-to localhost:3002/webhooks/payments` | Local Stripe webhooks |

## Deployment to Vercel

Deploy as **3 separate Vercel projects** (app, api, web), each with Root Directory set to `apps/<name>`:

1. Create project → set Root Directory to `apps/app`
2. Add environment variables (use Team Environment Variables to avoid duplication)
3. Repeat for `apps/api` and `apps/web`

Recommended subdomains: `app.yourdomain.com`, `api.yourdomain.com`, `www.yourdomain.com`

## API App Patterns

```
apps/api/
├── app/
│   ├── cron/           # Cron jobs (GET handlers)
│   │   └── keep-alive/route.ts
│   ├── webhooks/       # Inbound webhooks
│   │   ├── auth/route.ts      # Clerk webhooks
│   │   └── payments/route.ts  # Stripe webhooks
│   └── health/route.ts
└── vercel.json         # Cron schedules
```

## Design System

- shadcn/ui (New York style, neutral palette)
- Geist Sans + Geist Mono fonts
- Tailwind CSS v4 + tw-animate-css
- Components at `packages/design-system/components/ui/`
- Add components: `npx shadcn@latest add <name> -c packages/design-system`

## Common Gotchas

1. **Env vars are validated at build time** — optional services still require env vars if the package is imported. Remove the import or provide a value.
2. **Multiple .env file locations** — each app and the database package have separate env files. There is no single root `.env`.
3. **`pnpm migrate` before first run** — without this, you get "table does not exist" errors.
4. **Clerk webhooks cannot be tested locally** — need a staging deployment.
5. **Heavy middleware imports** → edge function >1MB on Vercel. Keep proxy.ts imports light.
6. **Prisma v7**: use `--config` not `--schema` for `prisma studio`.
7. **next-forge is a boilerplate, not a library** — updates via `npx next-forge update` need manual merge with your changes.
8. **`turbo.json` globalEnv** — when adding new env vars used at build time, declare them in `turbo.json` `globalEnv` or they won't invalidate cache.

## Removing Optional Services

To remove an unused service (e.g., Stripe, BaseHub, Liveblocks):
1. Delete the package directory (`packages/<service>/`)
2. Remove all `@repo/<service>` imports from apps
3. Remove the `keys()` call from each app's `env.ts`
4. Remove the workspace entry from `pnpm-workspace.yaml` if needed
5. Run `pnpm install` to clean lockfile

## Migration Alternatives

| Category | Default | Alternatives |
|----------|---------|-------------|
| Auth | Clerk | Auth.js, Better Auth, Supabase Auth |
| Database | Prisma + Neon | Drizzle, Supabase, PlanetScale, Turso |
| Payments | Stripe | Lemon Squeezy, Paddle |
| CMS | BaseHub | Content Collections |
| Docs | Mintlify | Fumadocs |
| Feature Flags | Vercel Flags | Hypertune |
| Storage | Vercel Blob | UploadThing |
| Formatting | Biome | ESLint |

## Cross-references

=> skill: turborepo — Monorepo configuration, caching, remote cache
=> skill: auth — Clerk setup, middleware patterns, sign-in/up flows
=> skill: payments — Stripe integration, webhooks, pricing
=> skill: email — Resend + React Email templates
=> skill: shadcn — shadcn/ui components, theming, CLI
=> skill: observability — Sentry + logging setup
=> skill: vercel-storage — Blob, Neon, Upstash
=> skill: vercel-flags — Feature flags with Vercel Flags SDK
=> skill: ai-sdk — AI SDK integration
=> skill: bootstrap — Project bootstrapping flow

## Official Documentation

- https://docs.next-forge.com
- https://github.com/vercel/next-forge
