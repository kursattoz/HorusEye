'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { routes } from '@/constants/routes';
import type { UserRole } from '@/types';

export interface AuthState {
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const rawEmail    = formData.get('email');
  const rawPassword = formData.get('password');

  // Type guard — FormData values must be strings
  if (typeof rawEmail !== 'string' || typeof rawPassword !== 'string') {
    return { error: 'Invalid request.' };
  }

  const email    = rawEmail.trim().slice(0, 254);
  const password = rawPassword.slice(0, 128);

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  if (!EMAIL_RE.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }

  if (password.length < 6) {
    return { error: 'Invalid email or password.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await log({
      event_type: 'auth.failed',
      severity:   'warn',
      action:     `Login failed for ${email}: ${error.message}`,
      metadata:   { email },
    });
    // Generic message — do not differentiate between wrong password / no account (security)
    return { error: 'Invalid email or password.' };
  }

  // Fetch role for redirect
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  await log({
    event_type: 'auth.login',
    severity:   'info',
    user_id:    data.user.id,
    action:     `User logged in: ${email}`,
  });

  const role = (profile?.role ?? 'assistant') as UserRole;
  const dest  = role === 'admin' ? routes.dashboard : routes.feedback;

  revalidatePath('/', 'layout');
  redirect(dest);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await log({
      event_type: 'auth.logout',
      severity:   'info',
      user_id:    user.id,
      action:     'User logged out',
    });
  }

  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect(routes.login);
}

export async function getCurrentUser() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) console.error('[getCurrentUser] auth error:', authError.message);
  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role, avatar_url, is_active')
    .eq('id', user.id)
    .single();

  if (profileError) console.error('[getCurrentUser] profile error:', profileError.message, profileError.code);
  return profile;
}
