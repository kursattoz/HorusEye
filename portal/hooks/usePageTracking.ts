'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { getGuestSessionId } from '@/lib/utils/guestSession';

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

    const sessionId = getGuestSessionId();

    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;

    fetch('/api/log/page', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pathname, userId, sessionId, userAgent }),
    }).catch(() => { /* page tracking failures are non-critical */ });
  }, [pathname, userId]);
}
