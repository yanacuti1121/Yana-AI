---
name: shadcn-patterns
description: >
  Build and customize UI components with shadcn/ui — component installation,
  CSS variable theming, Radix UI primitive composition, variant patterns with
  cva(), dark mode wiring, and extending components without forking. Use when
  asked about "shadcn", "shadcn/ui", "shadcn component", "radix primitive",
  "cva variants", "shadcn theme", "extend shadcn", "shadcn dark mode",
  "shadcn form", "shadcn dialog", "shadcn button variants", or "how to
  customize shadcn components". Do NOT use for: full design system token
  architecture — see design-system-gen. Do NOT use for: animation patterns
  — see motion-design.
origin: adapted:MIT © shadcn-ui
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "shadcn/ui (any version), Radix UI, Next.js / Vite / Remix. Requires Tailwind CSS."
---

## When to Use

- Use when: adding shadcn/ui to a project for the first time
- Use when: extending a shadcn component with new variants
- Use when: theming shadcn to match a brand (CSS variables)
- Use when: building a form with shadcn Form + react-hook-form + zod
- Do NOT use for: building a full token system from scratch — design-system-gen
- Do NOT use for: non-Tailwind component libraries

---

## Setup

```bash
# New project
npx shadcn@latest init

# Add components — copies source into your repo (you own the code)
npx shadcn@latest add button
npx shadcn@latest add dialog form input label select toast

# Update a component to latest shadcn version
npx shadcn@latest add button --overwrite
```

Components land in `components/ui/` — they're yours, modify freely.

---

## CSS Variable Theming

```css
/* globals.css — customize to match brand */
@layer base {
  :root {
    --background:   0 0% 100%;
    --foreground:   222 84% 5%;
    --primary:      221 83% 53%;       /* blue-600 */
    --primary-foreground: 210 40% 98%;
    --secondary:    210 40% 96%;
    --secondary-foreground: 222 47% 11%;
    --muted:        210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --accent:       210 40% 96%;
    --destructive:  0 84% 60%;
    --border:       214 32% 91%;
    --input:        214 32% 91%;
    --ring:         221 83% 53%;
    --radius:       0.5rem;
  }

  .dark {
    --background:   222 84% 5%;
    --foreground:   210 40% 98%;
    --primary:      217 91% 60%;
    --primary-foreground: 222 47% 11%;
    --border:       217 33% 17%;
    /* ... */
  }
}
```

---

## Extending Components with cva()

```tsx
// components/ui/button.tsx — add a new "ghost-destructive" variant
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default:           'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:       'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:           'border border-input hover:bg-accent hover:text-accent-foreground',
        ghost:             'hover:bg-accent hover:text-accent-foreground',
        'ghost-destructive': 'hover:bg-destructive/10 hover:text-destructive',  // NEW
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-9 px-3 rounded-md',
        lg:      'h-11 px-8 rounded-md',
        icon:    'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

// Usage
<Button variant="ghost-destructive" size="sm">Delete</Button>
```

---

## shadcn Form (react-hook-form + zod)

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const schema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(8, 'At least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(console.log)} className="space-y-4">
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl><Input type="email" {...field} /></FormControl>
            <FormMessage />   {/* auto-shows zod error */}
          </FormItem>
        )} />
        <Button type="submit">Login</Button>
      </form>
    </Form>
  );
}
```

---

## Composing Radix Primitives

```tsx
// shadcn Dialog — slots map to Radix Dialog.* primitives
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>          {/* asChild renders Trigger as Button, not extra DOM */}
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm delete</DialogTitle>
      <DialogDescription>This action is permanent.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="destructive">Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Anti-Fake-Pass Rules

Before claiming shadcn/ui implementation is done, you MUST show:
- [ ] Components added via `npx shadcn@latest add` — not manually copied
- [ ] Theme uses CSS variables in `globals.css` — no hardcoded Tailwind colors
- [ ] Dark mode wired: `.dark` CSS variable block + `ThemeProvider` or class toggle
- [ ] Button/Badge variants use `cva()` — not ad-hoc `cn()` branching
- [ ] Forms use `shadcn/ui Form` + `zodResolver` — not raw `<input>` + manual validation
- [ ] `asChild` used on `DialogTrigger`/`TooltipTrigger` to avoid extra DOM node
- [ ] `FormMessage` present in every form field — errors are surfaced

Reference: `gates/anti-fake-pass-gate.md`
