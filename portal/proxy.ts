import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { updateSession } from '@/lib/supabase/middleware';
import { PROTECTED_ROUTES, ADMIN_ONLY_ROUTES, routes } from '@/constants/routes';

// Next.js 16 renamed middleware → proxy. This file consolidates
// the previous middleware.ts logic: session refresh, auth gating,
// force_password_change guard, admin-only routes, and page visit log.

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  function withAuthCookies(res: ReturnType<typeof NextResponse.redirect>) {
    supabaseResponse.cookies.getAll().forEach(cookie => {
      res.cookies.set(cookie.name, cookie.value, cookie);
    });
    return res;
  }

  // / and /login: send logged-in users straight to dashboard
  if ((pathname === '/' || pathname === routes.login) && user) {
    return withAuthCookies(NextResponse.redirect(new URL(routes.dashboard, request.url)));
  }

  // / with no session → login
  if (pathname === '/' && !user) {
    return NextResponse.redirect(new URL(routes.login, request.url));
  }

  // Protect authenticated routes
  const isProtected = PROTECTED_ROUTES.some(r => pathname.startsWith(r));
  const isAdminOnly = ADMIN_ONLY_ROUTES.some(r => pathname.startsWith(r));

  if (isProtected && !user) {
    return withAuthCookies(NextResponse.redirect(new URL(routes.login, request.url)));
  }

  if (user) {
    // Fetch role + force_password_change in a single lightweight query
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, force_password_change')
      .eq('id', user.id)
      .single();

    // force_password_change guard — trap user until they change password
    if (
      profile?.force_password_change &&
      pathname !== routes.changePassword &&
      !pathname.startsWith('/api/')
    ) {
      const changeUrl = request.nextUrl.clone();
      changeUrl.pathname = routes.changePassword;
      return withAuthCookies(NextResponse.redirect(changeUrl));
    }

    if (isAdminOnly && profile?.role !== 'admin') {
      return withAuthCookies(NextResponse.redirect(new URL(routes.dashboard, request.url)));
    }

    // Fire-and-forget page visit log for protected routes (BL-89)
    if (isProtected) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      if (appUrl) {
        fetch(`${appUrl}/api/log/page`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            pathname,
            userId:    user.id,
            userAgent: request.headers.get('user-agent') ?? undefined,
          }),
        }).catch(() => { /* non-critical */ });
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on auth-relevant routes only. Public routes (/, /login, /p/*,
    // /api/*, static assets, /dev/* — covered selectively) are excluded.
    '/',
    '/login',
    '/dashboard/:path*',
    '/files/:path*',
    '/sprints/:path*',
    '/users/:path*',
    '/team/:path*',
    '/reports/:path*',
    '/calendar/:path*',
    '/notifications/:path*',
    '/settings/:path*',
    '/feedback/:path*',
    '/change-password',
    '/dev/:path*',
  ],
};
