import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { PROTECTED_ROUTES, ADMIN_ONLY_ROUTES, routes } from '@/constants/routes';

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  // Redirect logged-in users away from /login
  if (pathname === routes.login && user) {
    return NextResponse.redirect(new URL(routes.dashboard, request.url));
  }

  // Protect authenticated routes
  const isProtected = PROTECTED_ROUTES.some(r => pathname.startsWith(r));
  if (isProtected && !user) {
    return NextResponse.redirect(new URL(routes.login, request.url));
  }

  // Admin-only routes — role check happens in page component (after DB fetch)
  // Middleware only checks auth; role is validated server-side in each page

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)',
  ],
};
