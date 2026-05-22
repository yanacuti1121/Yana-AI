---
name: state-management-patterns
description: >
  Choose and implement state management — local state, Zustand, Redux Toolkit,
  Jotai, React Query/TanStack Query, URL state, and when to use each.
  Use when asked about "state management", "Zustand", "Redux Toolkit",
  "RTK", "React Query", "TanStack Query", "Jotai", "server state vs client
  state", "global state", "state colocation", "useQuery", "useMutation",
  "optimistic update", "cache invalidation", or "when to use Redux".
  Do NOT use for: React Server Components state — see nextjs-patterns.
  Do NOT use for: WebSocket state — see websocket-patterns.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "React ≥ 18. Zustand v5, Redux Toolkit v2, TanStack Query v5, Jotai v2."
---

## When to Use

- Use when: prop drilling exceeds 2-3 levels
- Use when: async data fetching with loading/error/cache is tangled in useEffect
- Use when: multiple components read/write the same piece of state
- Do NOT use for: RSC data fetching — that's fetch() in server components (nextjs-patterns)
- Do NOT use for: form state — use react-hook-form (see frontend-patterns)

---

## Decision Tree

```
State lives in...
  └─ One component only          → useState / useReducer
  └─ URL (shareable, bookmarkable) → URL params / searchParams
  └─ Server data (async, cached)  → TanStack Query (React Query)
  └─ Client UI state (cross-component, no async)
        └─ Simple: 1-5 atoms     → Jotai
        └─ Complex: slices, middleware, devtools → Zustand
        └─ Large team, strict patterns → Redux Toolkit
```

---

## TanStack Query (Server State)

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Fetch with automatic caching, background refetch, loading/error states
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],     // cache key — refetches when userId changes
    queryFn:  () => api.users.get(userId),
    staleTime: 60_000,              // treat as fresh for 60s
    gcTime:    300_000,             // keep in cache for 5min after unmount
  });

  if (isLoading) return <Skeleton />;
  if (error)     return <Error />;
  return <Profile user={data} />;
}

// Mutation with optimistic update
function FollowButton({ userId }: { userId: string }) {
  const queryClient = useQueryClient();

  const { mutate } = useMutation({
    mutationFn: (id: string) => api.users.follow(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['user', id] });
      const prev = queryClient.getQueryData(['user', id]);
      queryClient.setQueryData(['user', id], (old: User) => ({ ...old, following: true }));
      return { prev };                 // snapshot for rollback
    },
    onError: (_, id, ctx) => {
      queryClient.setQueryData(['user', id], ctx?.prev);   // rollback
    },
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({ queryKey: ['user', id] });
    },
  });

  return <button onClick={() => mutate(userId)}>Follow</button>;
}
```

---

## Zustand (Client UI State)

```ts
// store/useCartStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CartItem { id: string; qty: number; price: number; }

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  total: () => number;
  clear: () => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set(s => ({
          items: s.items.find(i => i.id === item.id)
            ? s.items.map(i => i.id === item.id ? { ...i, qty: i.qty + item.qty } : i)
            : [...s.items, item],
        })),
      removeItem: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
      total: () => get().items.reduce((sum, i) => sum + i.qty * i.price, 0),
      clear: () => set({ items: [] }),
    }),
    { name: 'cart-storage' }   // persisted to localStorage
  )
);

// In component
const { items, addItem, total } = useCartStore();
```

---

## Jotai (Atomic State)

```ts
// Minimal — good for 1-10 isolated atoms
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';

const themeAtom    = atom<'light' | 'dark'>('light');
const sidebarAtom  = atom(false);

// Derived atom (computed, no setter)
const isDarkAtom = atom(get => get(themeAtom) === 'dark');

// In components
function ThemeToggle() {
  const [theme, setTheme] = useAtom(themeAtom);
  return <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>{theme}</button>;
}

function Layout({ children }) {
  const isDark = useAtomValue(isDarkAtom);
  return <div className={isDark ? 'dark' : ''}>{children}</div>;
}
```

---

## URL State (Shareable State)

```tsx
// Use nuqs for type-safe URL search params
import { useQueryState, parseAsInteger } from 'nuqs';

function ProductList() {
  const [page, setPage]   = useQueryState('page', parseAsInteger.withDefault(1));
  const [sort, setSort]   = useQueryState('sort', { defaultValue: 'name' });
  const [query, setQuery] = useQueryState('q', { defaultValue: '' });

  // URL: /products?page=2&sort=price&q=shirt
  // State survives refresh, share link works out of the box
}
```

---

## Anti-Fake-Pass Rules

Before claiming state management is implemented, you MUST show:
- [ ] Server state (API data) uses TanStack Query — not manual useEffect + useState
- [ ] `staleTime` configured — not just default (0 = refetch on every focus)
- [ ] Mutations use `onMutate` for optimistic updates + `onError` for rollback
- [ ] Zustand stores are typed with explicit interfaces — not `any`
- [ ] No prop drilling > 2 levels — extract to store or context
- [ ] URL state used for filterable/sortable/paginated views — shareable links work

Reference: `gates/anti-fake-pass-gate.md`
