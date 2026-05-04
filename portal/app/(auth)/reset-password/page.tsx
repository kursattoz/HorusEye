import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { getCurrentUser } from '@/app/actions/auth';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import { ResetPasswordPending } from '@/components/auth/ResetPasswordPending';
import { routes } from '@/constants/routes';

export const metadata: Metadata = {
  title: 'Reset password — HorusEye',
};

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  if (user && user.is_active) {
    return (
      <div className="min-h-svh flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Choose a new password</h1>
              <p className="text-sm text-muted-foreground">
                Signed in as {user.full_name ?? user.email}. Enter your new password
                below.
              </p>
            </div>
          </div>

          <ChangePasswordForm />

          <p className="text-center text-xs text-muted-foreground">
            Password must meet the strength requirements below.
          </p>

          <p className="text-center">
            <Link
              href={routes.login}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to login
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (user && !user.is_active) {
    redirect(routes.login);
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Reset password</h1>
        </div>
        <ResetPasswordPending />
      </div>
    </div>
  );
}
