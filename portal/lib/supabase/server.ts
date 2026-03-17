import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Server-side Supabase client
// Pass { serviceRole: true } to bypass RLS (for server-side log writes, etc.)
export async function createClient(options?: { serviceRole?: boolean }) {
  // Service role client: use @supabase/supabase-js directly so the service_role
  // JWT is correctly sent as Authorization header (bypasses RLS).
  if (options?.serviceRole) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }

  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()             { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options: opts }) =>
              cookieStore.set(name, value, opts)
            );
          } catch { /* Server component — cookie set is best-effort */ }
        },
      },
    }
  );
}
