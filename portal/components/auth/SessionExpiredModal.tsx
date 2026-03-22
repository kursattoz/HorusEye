'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { routes } from '@/constants/routes';

const CHECK_INTERVAL_MS = 60_000; // 60 seconds

export function SessionExpiredModal() {
  const [expired, setExpired] = useState(false);
  const wasAuthenticated = useRef(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Mark the user as authenticated on mount (since this component
    // only renders inside the protected layout)
    wasAuthenticated.current = true;

    async function checkSession() {
      // Only check when the page is visible
      if (document.visibilityState !== 'visible') return;

      const { error } = await supabase.auth.getUser();
      if (error && wasAuthenticated.current) {
        setExpired(true);
      }
    }

    const interval = setInterval(checkSession, CHECK_INTERVAL_MS);

    // Also check when the page becomes visible again
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [supabase]);

  return (
    <Dialog open={expired}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Oturum Sona Erdi</DialogTitle>
          <DialogDescription>
            Oturumunuz sona erdi. L&uuml;tfen tekrar giri&#351; yap&#305;n.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button onClick={() => router.push(routes.login)}>
            Giri&#351; Yap
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
