---
name: terminal--nextjs
description: >-
  >-
origin: "github.com/TerminalSkills/skills (skill: nextjs)"
license: Apache-2.0
version: "1.0.0"
compatibility: "yana-ai >= 0.14.0"
---

# Next.js

## Overview

Next.js is a full-stack React framework featuring the App Router with Server Components, Server Actions for mutations, and multiple rendering strategies (SSG, SSR, ISR, PPR). It provides automatic code splitting, image optimization, and deployment options from Vercel to self-hosted Docker.

## Instructions

- When creating routes, use file-based routing in the `app/` directory with `page.tsx` for pages, `layout.tsx` for persistent layouts, `loading.tsx` for streaming, and `error.tsx` for error boundaries.
- When building components, default to Server Components (no directive needed) for zero client-side JavaScript, and add `"use client"` only for components needing event handlers, hooks, or browser APIs.
- When fetching data, query databases directly in Server Components with `async/await`, use `fetch()` with caching options (`revalidate`, `force-cache`), and co-locate data fetching with the component that needs it.
- When handling mutations, use Server Actions with `"use server"` directive and `<form action={...}>` for progressive enhancement, then call `revalidatePath()` or `revalidateTag()` after mutations.
- When choosing rendering, default to ISR with `revalidate` for most pages, use `generateStaticParams()` for fully static pages, and `dynamic = "force-dynamic"` only when fresh data is required on every request.
- When adding middleware, use `middleware.ts` at the project root for auth redirects, geolocation, and A/B testing with matcher config to scope it to specific routes.
- When optimizing, use `next/image` for all images (WebP/AVIF, lazy loading), `next/font` for zero layout shift fonts, and `generateMetadata()` for dynamic SEO.

## Examples

### Example 1: Build a dashboard with Server Components

**User request:** "Create a Next.js dashboard with server-side data fetching and streaming"

**Actions:**
1. Create dashboard layout with `layout.tsx` and parallel routes for widgets
2. Fetch data directly in async Server Components with database queries
3. Add `loading.tsx` for Suspense-based streaming of slow components
4. Use `revalidate` for ISR to balance freshness and performance

**Output:** A fast dashboard that streams data progressively with zero client-side JavaScript for data fetching.

### Example 2: Add authentication with Server Actions

**User request:** "Implement login/signup with Server Actions and middleware protection"

**Actions:**
1. Create login form with `<form action={loginAction}>` using Server Actions
2. Implement session management with encrypted cookies
3. Add middleware to redirect unauthenticated users from `/dashboard/*`
4. Use `useOptimistic()` for instant form feedback

**Output:** A progressively enhanced auth system with server-side validation and route protection.

## Guidelines

- Default to Server Components; add `"use client"` only for interactivity (event handlers, hooks, browser APIs).
- Use Server Actions for mutations instead of API routes; they are simpler and support progressive enhancement.
- Co-locate data fetching with components: fetch in the Server Component that needs the data, not in a parent.
- Use `loading.tsx` at route boundaries for streaming; do not block the entire page on a slow query.
- Use `generateMetadata()` for dynamic pages; static `metadata` export for fixed pages.
- Set `revalidate` on fetch calls or at page level: ISR is almost always better than full SSR.
- Use `next/image` for all images; the optimization is significant (WebP/AVIF, lazy loading, responsive).
