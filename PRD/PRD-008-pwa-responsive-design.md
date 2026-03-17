# PRD-008 — PWA & Responsive Design
**Version:** 1.0
**Owner:** HorusEye Team
**Dependencies:** PRD-000, PRD-002
**Blocks:** —
**Status:** ACTIVE

---

<!-- INTERFACE_DEPS
HorusFile: @1.0
-->

## ⚠️ LLM INSTRUCTION
PWA service worker caches only public content (PRD-002 scope). Never cache authenticated routes.
Breakpoints defined in this PRD are the **only** responsive breakpoints used across the entire application. Do not define custom breakpoints in individual components.
Dark/light mode implementation is in PRD-009 (UI Design System) — not here.
Interface dependencies are declared in the INTERFACE_DEPS block above. If PRD-000 version changes, update this block or `validate:prd` will fail.

---

## 1. Purpose

Make HorusEye installable as a Progressive Web App on mobile and desktop. All unauthenticated content works offline. Every screen works correctly at every viewport from 320px to 4K.

---

## 2. PWA Configuration

```typescript
// next.config.js
const withPWA = require('next-pwa')({
  dest:         'public',
  register:     true,
  skipWaiting:  true,
  disable:      process.env.NODE_ENV === 'development', // SW disabled in dev (avoid cache confusion)
  runtimeCaching: [
    {
      // Public file list API
      urlPattern: /^\/api\/public\/files/,
      handler:    'StaleWhileRevalidate',
      options: {
        cacheName:   'api-public-files',
        expiration:  { maxAgeSeconds: 3_600, maxEntries: 50 }
      }
    },
    {
      // Public document content from Supabase Storage
      urlPattern: /supabase.*\/public\/.*/,
      handler:    'CacheFirst',
      options: {
        cacheName:   'public-documents',
        expiration:  { maxAgeSeconds: 86_400, maxEntries: 100 }
      }
    },
    {
      // Static assets (JS, CSS, fonts)
      urlPattern: /\.(js|css|woff2|woff|ttf)$/,
      handler:    'CacheFirst',
      options: {
        cacheName:   'static-assets',
        expiration:  { maxAgeSeconds: 604_800 }
      }
    },
    {
      // Next.js image optimization
      urlPattern: /\/_next\/image\?url=.*/,
      handler:    'CacheFirst',
      options: {
        cacheName:   'next-images',
        expiration:  { maxAgeSeconds: 86_400, maxEntries: 200 }
      }
    }
  ]
});
```

### Web App Manifest (`public/manifest.json`)

```json
{
  "name":             "HorusEye — AI Exam Proctoring",
  "short_name":       "HorusEye",
  "description":      "AI-based exam proctoring and monitoring system",
  "start_url":        "/",
  "display":          "standalone",
  "background_color": "#ffffff",
  "theme_color":      "#1a1a2e",
  "lang":             "tr",
  "icons": [
    { "src": "/icons/icon-192.png",          "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png",          "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

---

## 3. Offline Behavior

| Content | Online | Offline |
|---------|--------|---------|
| Public file list (`/`) | Live from API | Cached (max 1 hour old) |
| Public document content | Live from Storage | Cached (max 24 hours old) |
| `/login` page | Live | Cached (shell only) |
| Any authenticated route (`/dashboard`, etc.) | Live | "Connection required" page |
| API calls (non-cached) | Live | Fail gracefully with user message |

**Offline banner:** When network is lost, a non-dismissable banner appears at the top:
```
"You're offline — showing cached content"
```
When connection is restored: banner disappears automatically, page data refreshes silently.

**Offline page** (shown for authenticated routes when offline):
- HorusEye logo, simple message: "Dashboard requires an internet connection."
- Button: "Try again" (triggers `window.location.reload()`)

---

## 4. Responsive Breakpoints

Tailwind CSS default breakpoints are used **as-is**. No custom breakpoints.

| Name | Range | Layout Model |
|------|-------|--------------|
| `mobile` | `< 640px` (default) | Single column, bottom navigation bar |
| `sm` | `≥ 640px` | Two-column start, sidebar as drawer |
| `md` | `≥ 768px` | Dashboard sidebar collapsible |
| `lg` | `≥ 1024px` | Full fixed sidebar + main content area |
| `xl` | `≥ 1280px` | Max-width content container, wider tables |
| `2xl` | `≥ 1536px` | No layout change, comfortable whitespace |

**Minimum supported width:** 320px (iPhone SE). No horizontal scroll at any breakpoint.

---

## 5. Layout Behavior per Route

### Public Home (`/`)
| Viewport | Behavior |
|----------|---------|
| Desktop | Split layout: left panel (doc list) fixed 280px + right panel (viewer) fills |
| Tablet | Left panel collapsible drawer, toggle button visible |
| Mobile | Left panel as bottom sheet drawer (drag up to open), viewer is full screen |

### Dashboard (`/dashboard/*`)
| Viewport | Behavior |
|----------|---------|
| Desktop | Left sidebar 240px fixed, main content fills |
| Tablet | Sidebar hidden by default, opens via hamburger icon, overlays content |
| Mobile | Sidebar hidden, hamburger in topbar, bottom tab bar for primary nav |
| Tables | On mobile: horizontal scroll within container OR card view toggle |
| Modals | On mobile: render as bottom sheet (`Sheet` from shadcn, side="bottom") |

### System Monitor (`/dev/monitor`)
| Viewport | Behavior |
|----------|---------|
| Desktop | 3-4 column grid for health cards, full-width tables |
| Tablet | 2 column grid for health cards |
| Mobile | 1 column, tables show only key columns with expand button |

---

## 6. Mobile Navigation (Bottom Tab Bar)

Used **only on mobile** (`< 640px`). Hidden on tablet and desktop (sidebar used instead).

```
Bottom Tab Bar:
├── [Home]       icon: Home       → /
├── [Documents]  icon: FileText   → /docs (last viewed, or list)
├── [Dashboard]  icon: LayoutDashboard → /dashboard (requires login)
└── [Profile]    icon: UserCircle → /profile (requires login, else → /login)
```

All icons from Lucide React.
Active tab: filled variant + primary color underline.
Inactive tab: outline icon + muted color.

---

## 7. PWA Install Prompt

```typescript
// components/pwa/InstallPrompt.tsx
// Shown in top-right corner of the app bar after 3 page visits

// Android/Chrome: uses beforeinstallprompt event → native browser install dialog
// iOS Safari: cannot trigger programmatic prompt
//   → Shows a tooltip: "Tap Share → Add to Home Screen to install HorusEye"
//   → Tooltip shown only on iOS (detected via userAgent)

// After install or dismissal: hidden permanently (localStorage flag)
```

---

## 8. Test Scenarios

- [ ] Chrome (Android): PWA install prompt appears after 3 visits
- [ ] iOS Safari: "Add to Home Screen" instruction tooltip renders correctly
- [ ] After PWA install: app opens in standalone mode (no browser chrome)
- [ ] Offline: public docs list renders from cache
- [ ] Offline: navigating to `/dashboard` shows "Connection required" page
- [ ] Offline banner appears when network disconnects, disappears when restored
- [ ] 320px viewport: no horizontal scroll on any page
- [ ] Mobile home: left panel opens as bottom sheet, viewer is full screen
- [ ] Mobile dashboard: bottom tab bar visible, sidebar hidden
- [ ] Tablet dashboard: hamburger button opens sidebar as overlay
- [ ] Desktop dashboard: fixed sidebar, no hamburger
- [ ] Service worker does NOT cache any authenticated API routes
