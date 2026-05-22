---
name: nextjs-patterns
description: >
  Build production Next.js apps — App Router conventions, React Server
  Components, server actions, data fetching strategies, caching layers,
  route handlers, middleware, metadata API, and parallel/intercepting routes.
  Use when asked about "Next.js App Router", "React Server Components",
  "RSC", "server actions", "use server", "use client", "Next.js caching",
  "fetch cache", "revalidatePath", "route handler", "Next.js middleware",
  "streaming UI", "Suspense boundary", "parallel routes", "Next.js metadata",
  or "Next.js data fetching". Do NOT use for: React patterns generally
  — see frontend-patterns. Do NOT use for: deployment infra — see cicd-patterns.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Next.js ≥ 14.0 (App Router). Pages Router patterns not covered."
---

## When to Use

- Use when: starting a new Next.js project and deciding `use client` vs `use server`
- Use when: caching strategy is causing stale data or excessive re-fetches
- Use when: building forms with server actions instead of API routes
- Use when: adding metadata, OG images, or sitemap to a Next.js app
- Do NOT use for: React hooks patterns — see frontend-patterns
- Do NOT use for: deployment pipeline — see cicd-patterns

---

## Server vs Client Components

```
Default: Server Component (RSC)   ← renders on server, 0 JS sent to client
Add 'use client'                  ← opts into client-side React, can use hooks

Rules:
  - Client components CANNOT import Server components
  - Server components CAN import Client components (they become boundaries)
  - Data fetching, DB access, secrets → Server component
  - Interactivity (useState, useEffect, event handlers) → Client component
  - Props crossing the boundary MUST be serializable (no functions, no class instances)
```

```tsx
// app/products/page.tsx — Server Component (default)
async function ProductsPage() {
  const products = await db.products.findMany();  // direct DB access ✅

  return (
    <main>
      <h1>Products</h1>
      {products.map(p => (
        <ProductCard key={p.id} product={p} />  // passes serializable props
      ))}
      <AddToCartButton />  {/* Client component at the leaf */}
    </main>
  );
}

// components/AddToCartButton.tsx
'use client';
import { useState } from 'react';
export function AddToCartButton() {
  const [added, setAdded] = useState(false);
  return <button onClick={() => setAdded(true)}>{added ? 'Added!' : 'Add to Cart'}</button>;
}
```

---

## Server Actions

```tsx
// app/checkout/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const CheckoutSchema = z.object({
  items:   z.array(z.object({ id: z.string(), qty: z.number().positive() })),
  address: z.string().min(1),
});

export async function createOrder(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const validated = CheckoutSchema.safeParse(raw);

  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }

  const order = await db.orders.create({ data: validated.data });
  revalidatePath('/orders');               // invalidate cached order list
  redirect(`/orders/${order.id}`);        // server-side redirect
}

// app/checkout/page.tsx — use the action directly
<form action={createOrder}>
  <input name="address" />
  <SubmitButton />
</form>
```

---

## Caching Layers

```
Request Memoization  → same fetch() called twice in one render tree = 1 HTTP request
Data Cache           → persists across requests (server-side) — use fetch() with options
Full Route Cache     → pre-rendered HTML cached at build or runtime
Router Cache         → client-side soft navigation cache (30s default)
```

```tsx
// Static (cached forever until revalidation)
const data = await fetch('https://api.example.com/products', {
  next: { revalidate: 3600 }   // ISR: refresh every 1 hour
});

// Dynamic (opt out of cache — always fresh)
const data = await fetch('https://api.example.com/cart', {
  cache: 'no-store'
});

// On-demand revalidation (e.g. after CMS publish)
import { revalidatePath, revalidateTag } from 'next/cache';
await revalidatePath('/blog');           // invalidate specific path
await revalidateTag('blog-posts');       // invalidate all fetches tagged 'blog-posts'
```

---

## Streaming with Suspense

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';

export default function Dashboard() {
  return (
    <main>
      <h1>Dashboard</h1>
      {/* Slow component streams in without blocking the page */}
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsWidget />   {/* async server component */}
      </Suspense>
      <Suspense fallback={<RevenueChartSkeleton />}>
        <RevenueChart />
      </Suspense>
    </main>
  );
}

async function AnalyticsWidget() {
  const data = await slowAnalyticsQuery();  // doesn't block other Suspense boundaries
  return <Chart data={data} />;
}
```

---

## Route Handlers

```ts
// app/api/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

export async function POST(req: NextRequest) {
  // Verify webhook signature
  const sig  = req.headers.get('x-webhook-sig') ?? '';
  const body = await req.text();
  const expected = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(body).digest('hex');

  if (sig !== expected) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(body);
  await processWebhook(event);
  return NextResponse.json({ ok: true });
}

// Force dynamic — webhook can't be cached
export const dynamic = 'force-dynamic';
```

---

## Metadata API

```tsx
// app/products/[id]/page.tsx
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const product = await db.products.findById(params.id);
  return {
    title: `${product.name} — MyStore`,
    description: product.description.slice(0, 160),
    openGraph: {
      images: [{ url: product.imageUrl, width: 1200, height: 630 }],
    },
  };
}
```

---

## Anti-Fake-Pass Rules

Before claiming Next.js App Router implementation is done, you MUST show:
- [ ] `'use client'` only at leaves — not wrapping server components unnecessarily
- [ ] Server actions validate input with zod before touching DB
- [ ] `revalidatePath` / `revalidateTag` called after mutations — no stale data
- [ ] Slow queries wrapped in `<Suspense>` — page doesn't block on slowest query
- [ ] Route Handlers verify auth (middleware or per-handler check)
- [ ] `generateMetadata` returns meaningful `title` and `description` — not defaults
- [ ] No secrets accessed in `'use client'` components — server only

Reference: `gates/anti-fake-pass-gate.md`
