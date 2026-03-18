'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

function getAnonymousSessionId(): string {
  const key = 'horuseye-anon-session';
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return 'unknown';
  }
}

/**
 * Auto-logs every route change as a page.visit event (PRD-006).
 * Pass userId when the user is authenticated; omit for guest tracking.
 */
export function usePageTracking(userId?: string) {
  const pathname = usePathname();
  const prevPath = useRef<string>('');

  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    const sessionId = getAnonymousSessionId();

    fetch('/api/log/page', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pathname, userId, sessionId }),
    }).catch(() => { /* page tracking failures are non-critical */ });
  }, [pathname, userId]);
}
