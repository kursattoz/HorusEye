import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side Supabase client
// Pass { serviceRole: true } to bypass RLS (for server-side log writes, etc.)
export async function createClient(options?: { serviceRole?: boolean }) {
  // Service role client: empty cookies so the user JWT doesn't override the service_role via Authorization header
  if (options?.serviceRole) {
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
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
