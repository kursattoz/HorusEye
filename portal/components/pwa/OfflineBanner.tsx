'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  // Always start false to match server render — useSyncExternalStore ensures no hydration mismatch
  const isOffline = useSyncExternalStore(
    (callback) => {
      window.addEventListener('offline', callback);
      window.addEventListener('online', callback);
      return () => {
        window.removeEventListener('offline', callback);
        window.removeEventListener('online', callback);
      };
    },
    () => !navigator.onLine,
    () => false, // server snapshot — always false
  );

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
      <WifiOff className="h-4 w-4" />
      You are offline. Some features may be unavailable.
    </div>
  );
}
