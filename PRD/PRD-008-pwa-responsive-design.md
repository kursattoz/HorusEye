# PRD-008 — PWA & Responsive Design
**Versiyon:** 1.0
**Owner:** HorusEye Team
**Bağımlılıklar:** PRD-000, PRD-002
**Bloke ettiği:** —
**Durum:** ACTIVE

---

<!-- INTERFACE_DEPS
HorusFile: @1.4
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

Service worker `app/sw.ts` dosyasında Serwist (`@serwist/next`) ile yapılandırılmıştır:

```typescript
// app/sw.ts — Serwist service worker (gerçek implementasyon)
const serwist = new Serwist({
  precacheEntries: sw.__SW_MANIFEST,  // Build-time injected
  skipWaiting:     true,
  clientsClaim:    true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // Cache Supabase API responses (short TTL, network-first)
      matcher: ({ url }) => url.hostname.includes("supabase"),
      handler: new NetworkFirst({
        cacheName:  "supabase-cache",
        plugins:    [{ cacheWillUpdate: async ({ response }) => response.status === 200 ? response : null }],
        networkTimeoutSeconds: 3,
      }),
    },
    {
      // Cache Google Fonts (long TTL, cache-first)
      matcher: ({ url }) => url.hostname === "fonts.gstatic.com",
      handler: new CacheFirst({
        cacheName: "fonts-cache",
      }),
    },
  ],
});
```

**Not:** Precaching `@serwist/next` tarafından build-time'da inject edilir. Static assets ve Next.js sayfaları otomatik precache'lenir.

**Cache stratejisi — route bazlı:**
- **Cache'lenen (public):** `/`, `/docs/*`, `/login`, static assets (JS/CSS/fonts), `/api/public/*`
- **Asla cache'lenmeyen (protected):** `/dashboard/*`, `/settings/*`, `/files/*`, `/feedback/*`, `/notifications/*`, `/dev/*`, `/api/auth/*`, `/api/files/*`, `/api/feedback/*`, `/api/users/*`, `/api/notifications/*`
- **Kural:** URL `/api/public/` ile başlamıyorsa VE `/api/` ile başlıyorsa → NetworkOnly (cache yok)
- Protected sayfa URL'leri service worker'da whitelist değil **blacklist** ile kontrol edilir: `(protected)` route grubu altındaki tüm path'ler cache dışı.

**Cache limitleri:** Service worker cache toplam 50MB ile sınırlıdır. LRU eviction: en eski entry silinir. Font cache: 30 gün TTL. API cache: 1 saat TTL.

### Web App Manifest (`public/manifest.json`)

```json
{
  "name":             "HorusEye — AI Exam Proctoring",
  "short_name":       "HorusEye",
  "description":      "AI-based exam proctoring and monitoring system",
  "start_url":        "/",
  "display":          "standalone",
  "background_color": "#ffffff",
  "theme_color":      "#0f172a",
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

**Offline banner:** (implementasyon: `components/pwa/OfflineBanner.tsx`, root layout'a eklendi)
Bağlantı koptuğunda sayfanın üstünde kırmızı banner görünür:
```
"You are offline. Some features may be unavailable."
```
`navigator.onLine` state'i ve `online`/`offline` event listener'ları ile çalışır.
Bağlantı geri geldiğinde banner otomatik olarak kaybolur.

**Offline page** (implementasyon: `app/(protected)/offline/page.tsx`):
- WifiOff ikonu, mesaj: "You're Offline — This page requires an internet connection."
- Protected route grubu altında, authenticated kullanıcılar offline olduğunda bu sayfaya yönlendirilir.

**Offline yönlendirme:** Service worker `fetch` event'inde: protected route'a istek gelirse ve network yoksa → `/offline` sayfasına redirect. Client-side `navigator.onLine` kontrolü ile `OfflineBanner` component gösterilir. Middleware kullanılmaz (SW handles).

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

### Login (`/login`)
| Viewport | Behavior |
|----------|---------|
| Desktop (lg) | Grid `1fr / 1.2fr` — sol: login formu, sağ: Document Hub paneli |
| 2K/4K (2xl) | Grid `1fr / 1.5fr` — Document Hub daha geniş, kart `max-w-5xl`, yükseklik `1000px` |
| Portrait / Pivot | Grid `1fr / 1fr` (lg), `1fr / 1.3fr` (2xl) — Document Hub `calc(100svh - 3rem)` yüksekliğe genişler |
| Tablet / Mobile | Document Hub gizli, modal ile erişilir (`LoginDocModal`) |

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

// iOS PWA kurulum: iOS'ta JavaScript ile install prompt tetiklenemez. Bunun yerine:
// - İlk 3 ziyaretten sonra bottom banner gösterilir: 'Uygulamayı yüklemek için: Paylaş → Ana Ekrana Ekle'
// - Banner localStorage ile kontrol edilir: kapatılınca 7 gün gösterilmez
// - Banner sadece iOS Safari'de gösterilir (navigator.userAgent check)

// Install prompt localStorage: Key: horuseye-pwa-install-dismissed. Değer: ISO timestamp. 30 gün sonra sıfırlanır (kullanıcı tekrar görür).
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
