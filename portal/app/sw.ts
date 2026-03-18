import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, NetworkFirst, Serwist } from "serwist";

// Injected by @serwist/next at build time
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

// eslint-disable-next-line no-restricted-globals
const sw = self as unknown as WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: sw.__SW_MANIFEST,
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

serwist.addEventListeners();
