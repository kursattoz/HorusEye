import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { getCurrentUser, logoutAction } from '@/app/actions/auth';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import { routes } from '@/constants/routes';

export const metadata: Metadata = {
  title: 'Set Password — HorusEye',
};

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();

  // Not logged in → go to login
  if (!user || !user.is_active) redirect(routes.login);

  // Already changed password → go to dashboard
  if (!user.force_password_change) redirect(routes.dashboard);

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Icon + heading */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Set your password</h1>
            <p className="text-sm text-muted-foreground">
              Welcome, {user.full_name ?? user.email}.<br />
              Please set a new password before continuing.
            </p>
          </div>
        </div>

        <ChangePasswordForm />

        <p className="text-center text-xs text-muted-foreground">
          Password must be at least 8 characters.
        </p>

        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
}
