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
  // admin → /dashboard, others → /feedback

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
    .select('id, email, full_name, role, avatar_url, is_active, force_password_change, color_theme')
    .eq('id', user.id)
    .single();

  if (profileError) console.error('[getCurrentUser] profile error:', profileError.message, profileError.code);
  return profile;
}

const VALID_COLOR_THEMES = ['red', 'pink', 'orange', 'blue'] as const;
type ColorTheme = typeof VALID_COLOR_THEMES[number];

export async function updateColorThemeAction(theme: ColorTheme): Promise<void> {
  if (!VALID_COLOR_THEMES.includes(theme)) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('user_profiles')
    .update({ color_theme: theme })
    .eq('id', user.id);
}

export async function changePasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password  = formData.get('password');
  const confirm   = formData.get('confirm');

  if (typeof password !== 'string' || typeof confirm !== 'string') {
    return { error: 'Invalid request.' };
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }
  if (password !== confirm) {
    return { error: 'Passwords do not match.' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  // Update password in Supabase Auth
  const { error: pwError } = await supabase.auth.updateUser({ password });
  if (pwError) return { error: pwError.message };

  // Clear the force_password_change flag (service role to bypass RLS)
  const admin = await createClient({ serviceRole: true });
  await admin.from('user_profiles')
    .update({ force_password_change: false })
    .eq('id', user.id);

  await log({
    event_type: 'auth.password_reset',
    severity:   'info',
    user_id:    user.id,
    action:     'User changed forced password on first login',
  });

  revalidatePath('/', 'layout');
  redirect(routes.dashboard);
}
