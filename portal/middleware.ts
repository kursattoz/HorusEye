import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';
import { PROTECTED_ROUTES, ADMIN_ONLY_ROUTES } from '@/constants/routes';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Refresh session and get current user
  const { supabaseResponse, user } = await updateSession(request);

  const isProtected = PROTECTED_ROUTES.some(r => pathname.startsWith(r));
  const isAdminOnly = ADMIN_ONLY_ROUTES.some(r => pathname.startsWith(r));

  // Unauthenticated → redirect to login
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    // Fetch role and force_password_change from user_profiles (single lightweight query)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()            { return request.cookies.getAll(); },
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
      pathname !== '/change-password' &&
      !pathname.startsWith('/api/')
    ) {
      const changeUrl = request.nextUrl.clone();
      changeUrl.pathname = '/change-password';
      return NextResponse.redirect(changeUrl);
    }

    // Admin-only routes
    if (isAdminOnly && profile?.role !== 'admin') {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/dashboard';
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     * - API routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
