'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { routes } from '@/constants/routes';

// If the recovery session is in the URL hash (implicit flow), the server cannot
// see it; pick it up in the browser and refresh so the server gets cookies.
export function ResetPasswordPending() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) {
        router.refresh();
        return;
      }
      timer = setTimeout(() => {
        if (!cancelled) setFailed(true);
      }, 5000);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [router]);

  if (!failed) {
    return (
      <p className="text-sm text-muted-foreground text-center">
        Completing sign-in…
      </p>
    );
  }

  return (
    <div className="space-y-4 text-center text-sm">
      <p className="text-muted-foreground">
        This reset link is invalid or has expired. Request a new password reset
        from your administrator or try again from the login page.
      </p>
      <Link
        href={routes.login}
        className="text-primary underline-offset-4 hover:underline font-medium"
      >
        Back to login
      </Link>
    </div>
  );
}
