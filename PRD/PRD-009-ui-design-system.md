# PRD-009 — UI Design System
**Versiyon:** 1.0
**Owner:** HorusEye Team
**Bağımlılıklar:** PRD-000
**Bloke ettiği:** — (tüm frontend PRD'lerinin görsel kararları bu dokümana bağlıdır: PRD-002, PRD-008, PRD-010, PRD-012)
**Durum:** ACTIVE

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
-->

## ⚠️ LLM INSTRUCTION — STRICT RULES
This PRD is the **single source of truth** for all visual decisions. Violations will cause build failures and must be corrected immediately.

### Mandatory
- **shadcn/ui `new-york` style** with **Radix UI** as primitive layer. This is the ONLY allowed component source.
- **`@base-ui/react` is BANNED.** Never install or import it. `components.json` must always have `"style": "new-york"`.
- **`asChild` prop** is the correct composition pattern in Radix UI. Use `<DropdownMenuTrigger asChild>`, `<Button asChild>`, etc. Never use a `render` prop for composition.
- **`buttonVariants`** is a pure CVA function (no `"use client"`). It can be imported and called freely in both Server and Client Components.
- Every icon must come from `lucide-react`. Do not use other icon sets.
- Do not hardcode color values anywhere in component files. Use CSS variables defined here.
- Dark/light mode must be implemented via the `next-themes` strategy defined in Section 5.
- Interface dependencies are declared in the INTERFACE_DEPS block above. If PRD-000 version changes, update this block or `validate:prd` will fail.
- Any design token change (color, font, spacing) must be made here first, then applied globally.

### Forbidden Patterns
```tsx
// ❌ WRONG — @base-ui/react render prop
<DropdownMenuTrigger render={<Button .../>} />

// ✅ CORRECT — Radix UI asChild
<DropdownMenuTrigger asChild>
  <Button .../>
</DropdownMenuTrigger>

// ❌ WRONG — inline hardcoded button styles in server component
<Link className="inline-flex items-center ...border border-border..." />

// ✅ CORRECT — buttonVariants is safe in server components
import { buttonVariants } from '@/components/ui/button';
<Link className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} />

// ❌ WRONG — Select null guard (base-ui API)
<Select onValueChange={(v) => { if (v !== null) setVal(v); }} />

// ✅ CORRECT — Radix Select always returns string
<Select onValueChange={setVal} />
```

### components.json (must always match)
```json
{
  "style": "new-york",
  "rsc": true,
  "tailwind": { "css": "app/globals.css", "baseColor": "slate", "cssVariables": true }
}
```

---

## 1. Purpose

Define and enforce a complete, consistent visual design system across the entire HorusEye application. Ensures that:
- Every developer uses the same components
- Dark and light modes work seamlessly everywhere
- Colors, typography, and spacing are globally controlled through design tokens
- No visual inconsistency between pages or PRDs

---

## 2. Component Library — shadcn/ui (100% mandatory)

All UI components must use shadcn/ui. No exceptions. This is not a preference — it is an architecture decision.

### Required Components (must be installed via `shadcn` CLI)

| Category | Components |
|----------|-----------|
| Layout | `Card`, `Separator`, `Sheet`, `ScrollArea`, `AspectRatio` |
| Navigation | `NavigationMenu`, `Breadcrumb`, `Tabs` |
| Forms | `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `RadioGroup`, `Label`, `Form` |
| Date & Time | `Calendar`, `DatePicker`, `DatePickerWithRange` |
| Feedback | `Alert`, `AlertDialog`, `Toast` (Sonner), `Progress`, `Skeleton` |
| Overlays | `Dialog`, `Drawer`, `Popover`, `Tooltip`, `HoverCard`, `ContextMenu`, `DropdownMenu` |
| Data Display | `Table`, `Badge`, `Avatar`, `Collapsible`, `Accordion` |
| Charts | `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` (shadcn/charts = Recharts wrapper) |

### Charts (Recharts via shadcn)

All charts use shadcn's chart wrapper built on Recharts:
```typescript
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
// Line, Bar, Area, Pie → all via Recharts inside ChartContainer
// Tooltips → always use ChartTooltipContent (auto dark-mode compatible)
```

### Avatar

```typescript
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
// AvatarFallback: initials (first letter of name + first letter of surname)
// AvatarImage: from user_profiles.avatar_url

// Avatar initials kuralları:
// - Tek isim ('Admin'): ilk 2 harf → 'AD'
// - İki isim ('Test Admin'): ilk harfler → 'TA'
// - Üç+ isim ('Ali Veli Can'): ilk ve son ismin ilk harfi → 'AC'
// - Boş isim: '?' gösterilir
```

### Topbar User Menu (Avatar + Dropdown)

The topbar appears on every authenticated page. The avatar in the top-right opens a `DropdownMenu`:

```typescript
// components/layout/TopbarUserMenu.tsx
<DropdownMenu>
  <DropdownMenuTrigger>
    <Avatar>
      <AvatarImage src={user.avatar_url} />
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuLabel>{user.full_name}</DropdownMenuLabel>
    <DropdownMenuLabel className="font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={() => router.push('/settings/profile')}>
      <User className="mr-2 h-4 w-4" /> Profile Settings
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => router.push('/settings')}>
      <Settings className="mr-2 h-4 w-4" /> Account Settings
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={handleLogout} className="text-destructive">
      <LogOut className="mr-2 h-4 w-4" /> Sign Out
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## 3. Icon Library — Lucide React (100% mandatory)

```bash
npm install lucide-react
```

All icons in the application must come from `lucide-react`. Do not use `heroicons`, `react-icons`, SVG files, or any other icon library.

**Common icon usage:**

| Purpose | Icon |
|---------|------|
| Dashboard | `LayoutDashboard` |
| Files | `FileText` |
| Feedback | `MessageSquare` |
| Users | `Users` |
| Settings | `Settings` |
| Monitor | `Activity` |
| Camera | `Camera` |
| Logout | `LogOut` |
| Profile | `User` |
| Search | `Search` |
| Filter | `Filter` |
| Upload | `Upload` |
| Download | `Download` |
| Delete | `Trash2` |
| Edit | `Pencil` |
| Add | `Plus` |
| Close | `X` |
| Check | `Check` |
| Alert | `AlertTriangle` |
| Error | `XCircle` |
| Success | `CheckCircle2` |
| Info | `Info` |
| Refresh | `RefreshCw` |
| Dark mode | `Moon` |
| Light mode | `Sun` |
| System theme | `Monitor` |
| Sidebar toggle | `PanelLeftClose` / `PanelLeftOpen` |
| Home | `Home` |
| Chevron | `ChevronRight`, `ChevronDown` |

---

## 4. Design Tokens — Color System

All colors are defined as CSS custom properties. Never hardcode color values.

### Color Palette (in `globals.css`)

```css
@layer base {
  :root {
    /* Brand */
    --brand-primary:     220 90% 56%;   /* #2563EB — blue */
    --brand-secondary:   262 83% 58%;   /* #7C3AED — violet */

    /* shadcn semantic tokens (light) */
    --background:        0 0% 100%;
    --foreground:        222 47% 11%;
    --card:              0 0% 100%;
    --card-foreground:   222 47% 11%;
    --popover:           0 0% 100%;
    --popover-foreground: 222 47% 11%;
    --primary:           220 90% 56%;
    --primary-foreground: 0 0% 100%;
    --secondary:         210 40% 96%;
    --secondary-foreground: 222 47% 11%;
    --muted:             210 40% 96%;
    --muted-foreground:  215 16% 47%;
    --accent:            210 40% 96%;
    --accent-foreground: 222 47% 11%;
    --destructive:       0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border:            214 32% 91%;
    --input:             214 32% 91%;
    --ring:              220 90% 56%;

    /* Status */
    --status-healthy:    142 71% 45%;   /* green */
    --status-degraded:   38 92% 50%;    /* yellow */
    --status-down:       0 84% 60%;     /* red */
    --status-unknown:    215 16% 47%;   /* gray */

    /* Sidebar */
    --sidebar-background:  222 47% 8%;
    --sidebar-foreground:  210 40% 90%;
    --sidebar-border:      222 47% 15%;
    --sidebar-accent:      220 90% 56%;

    --radius: 0.5rem;
  }

  .dark {
    --background:        222 47% 8%;
    --foreground:        210 40% 98%;
    --card:              222 47% 11%;
    --card-foreground:   210 40% 98%;
    --popover:           222 47% 11%;
    --popover-foreground: 210 40% 98%;
    --primary:           217 91% 65%;
    --primary-foreground: 222 47% 8%;
    --secondary:         217 33% 17%;
    --secondary-foreground: 210 40% 98%;
    --muted:             217 33% 17%;
    --muted-foreground:  215 20% 65%;
    --accent:            217 33% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive:       0 63% 51%;
    --destructive-foreground: 210 40% 98%;
    --border:            217 33% 17%;
    --input:             217 33% 17%;
    --ring:              217 91% 65%;

    --sidebar-background:  222 47% 5%;
    --sidebar-foreground:  210 40% 85%;
    --sidebar-border:      222 47% 12%;
    --sidebar-accent:      217 91% 65%;
  }
}
```

---

## 5. Dark / Light Mode

### Implementation

```bash
npm install next-themes
```

```typescript
// app/layout.tsx
import { ThemeProvider } from 'next-themes';

export default function RootLayout({ children }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### Theme Toggle Component

```typescript
// components/ui/ThemeToggle.tsx
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Moon, Sun, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Theme Toggle Placement
- **Topbar** (desktop): ThemeToggle button to the left of the avatar
- **Settings page** (`/settings` → Appearance tab): same options as a radio group with visual preview cards

### Dark Mode Rules
- Never use hardcoded colors in components (`#1a1a2e`, `gray-800`, etc.)
- Always use semantic Tailwind tokens: `bg-background`, `text-foreground`, `border`, `text-muted-foreground`, etc.
- Test every new component in both modes before marking PR ready

---

## 6. Typography

```typescript
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
```

```css
/* tailwind.config.ts */
theme: {
  extend: {
    fontFamily: {
      sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      mono: ['var(--font-mono)', 'monospace'],  /* for code blocks, log output */
    }
  }
}
```

**Typography scale:**

| Usage | Class |
|-------|-------|
| Page title | `text-2xl font-semibold tracking-tight` |
| Section header | `text-lg font-medium` |
| Card title | `text-base font-medium` |
| Body text | `text-sm text-foreground` |
| Secondary / labels | `text-sm text-muted-foreground` |
| Code / logs | `text-xs font-mono` |
| Micro / captions | `text-xs text-muted-foreground` |

---

## 7. Spacing & Sizing

Tailwind's default 4px base unit is used. No custom spacing values.

| Pattern | Usage |
|---------|-------|
| `p-4` / `p-6` | Card padding |
| `gap-4` | Grid/flex gaps |
| `space-y-4` | Vertical section spacing |
| `h-10` | Standard button/input height |
| `w-64` / `w-72` | Sidebar width |
| `max-w-5xl mx-auto` | Main content container |

---

## 8. Sidebar (Collapsible)

Uses shadcn's `Sidebar` component (or equivalent `Collapsible` + custom implementation):

```typescript
// components/layout/AppSidebar.tsx
// Desktop:  fixed width, always visible
// Tablet:   collapsible (toggle button), slides in/out
// Mobile:   hidden, replaced by bottom nav (PRD-008)

// State: stored in localStorage 'sidebar-collapsed'
// Icon-only mode when collapsed (tooltips show full label on hover)

// Varsayılan: Desktop'ta sidebar açık (collapsed=false). Tablet'te kapalı.
// localStorage key: sidebar-collapsed, değer: 'true' veya 'false'.
```

---

## 9. Folder Structure for Design System

```
components/
├── ui/                      ← shadcn/ui generated components (do not modify directly)
│   ├── button.tsx
│   ├── card.tsx
│   ├── avatar.tsx
│   ├── chart.tsx
│   └── ... (all shadcn components)
│
│   Versiyon kilidi: shadcn/ui component'ları `npx shadcn@latest add` ile eklenir
│   ve components/ui/ altına kopyalanır. Versiyon kilidi package.json'da değil,
│   kopyalanan dosyalardadır. shadcn CLI versiyonu package.json devDependencies'de sabitlenir.
│
├── layout/
│   ├── AppSidebar.tsx       ← Collapsible sidebar
│   ├── Topbar.tsx           ← Top navigation bar
│   ├── TopbarUserMenu.tsx   ← Avatar + dropdown
│   ├── ThemeToggle.tsx      ← Dark/light/system switcher
│   ├── BottomNav.tsx        ← Mobile bottom tab bar (PRD-008)
│   └── PageContainer.tsx    ← Max-width wrapper with padding
└── error/
    └── ErrorBoundary.tsx    ← Global error boundary (PRD-006)

styles/
└── globals.css              ← CSS custom properties (Section 4), Tailwind directives
```

---

## 10. Settings Page — Appearance Tab

Route: `/settings` (tab: Appearance)
Access: All authenticated roles

```
Appearance Settings:
├── Theme
│   ├── [Light]   [Dark]   [System]   ← RadioGroup with visual preview cards
│   └── Current: System
└── (Future: Language, Density)
```

The `/settings` page is a tabbed layout:
- **Appearance** → theme toggle, future: language
- **Profile** → name, avatar upload
- **Account** → password change, active sessions
- **Users** (Admin only) → user list + permission matrix (see PRD-001 for data)

---

## 11. Test Scenarios

- [ ] Light mode: all pages render correctly with no dark-class artifacts
- [ ] Dark mode: all pages render correctly, no hardcoded light colors visible
- [ ] System mode: follows OS preference, switches when OS preference changes
- [ ] Theme toggle in topbar → switches theme instantly without page reload
- [ ] Theme preference persisted → reload page → theme is remembered
- [ ] All charts render in dark mode with correct tooltip colors
- [ ] Avatar fallback shows correct initials when `avatar_url` is null
- [ ] Sidebar collapses to icon-only mode → tooltips show label
- [ ] All icons are Lucide (grep for any `heroicons` or `react-icons` imports → zero results)
- [ ] No hardcoded color values in component files (grep for `#[0-9a-f]{3,6}` in `components/` → zero results)
