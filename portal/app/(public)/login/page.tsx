import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Giriş Yap — HorusEye',
};

export default function LoginPage() {
  return (
    <div className="min-h-svh flex items-center justify-center p-4 bg-muted/40">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo + title */}
        <div className="text-center space-y-1">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
              H
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">HorusEye</h1>
          <p className="text-sm text-muted-foreground">AI-Based Exam Proctoring</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-medium">Giriş Yap</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Hesabınıza erişmek için bilgilerinizi girin.
            </p>
          </div>
          <LoginForm />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Hesap oluşturma yalnızca admin tarafından yapılabilir.
        </p>
      </div>
    </div>
  );
}
