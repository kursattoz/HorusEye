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

  // Protect authenticated routes
  const isProtected = PROTECTED_ROUTES.some(r => pathname.startsWith(r));
  if (isProtected && !user) {
    return withAuthCookies(NextResponse.redirect(new URL(routes.login, request.url)));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)',
  ],
};
