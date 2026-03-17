import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side Supabase client
// Pass { serviceRole: true } to bypass RLS (for server-side log writes, etc.)
export async function createClient(options?: { serviceRole?: boolean }) {
  const cookieStore = await cookies();
  const key = options?.serviceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY!
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      cookies: {
        getAll()                { return cookieStore.getAll(); },
        setAll(cookiesToSet)    {
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
