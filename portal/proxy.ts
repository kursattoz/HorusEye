import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { PROTECTED_ROUTES, routes } from '@/constants/routes';

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  // Helper: copy refreshed auth cookies onto any redirect response
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

  // Protect authenticated routes — redirect unauthenticated users to login
  const isProtected = PROTECTED_ROUTES.some(r => pathname.startsWith(r));
  if (isProtected && !user) {
    return withAuthCookies(NextResponse.redirect(new URL(routes.login, request.url)));
  }

  // Fire-and-forget page visit log for protected routes (BL-89)
  if (isProtected && user) {
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

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Only run on routes that need auth handling or visit logging.
    // Public routes (/, /login, /p/*, /api/*, static assets) are excluded.
    '/',
    '/login',
    '/dashboard/:path*',
    '/files/:path*',
    '/sprints/:path*',
    '/users/:path*',
    '/settings/:path*',
    '/feedback/:path*',
    '/change-password',
  ],
};
