import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm }     from '@/components/auth/LoginForm';
import { LoginDocPanel } from '@/components/auth/LoginDocPanel';
import { LoginDocModal } from '@/components/auth/LoginDocModal';
import { createClient }  from '@/lib/supabase/server';
import { routes }        from '@/constants/routes';
import type { PublicFile } from '@/components/public/FileTree';

export const metadata: Metadata = {
  title: 'Login — HorusEye',
};

async function getPublicFiles(): Promise<PublicFile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('public_files')
    .select('id, display_name, file_type, public_url, slug, category, description, created_at, blurred_page, sort_order')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  return (data ?? []) as PublicFile[];
}

export default async function LoginPage() {
  const files = await getPublicFiles();

  return (
    <div className="min-h-svh grid lg:grid-cols-2">
      {/* Left — form */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center justify-between">
          <Link href={routes.home} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              H
            </div>
            <span className="font-semibold text-sm">HorusEye</span>
          </Link>
          {/* Show doc modal button on mobile/tablet only (desktop has the panel) */}
          <div className="lg:hidden">
            <LoginDocModal files={files} />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs space-y-6">
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
              <p className="text-sm text-muted-foreground">
                Enter your credentials to access your account.
              </p>
            </div>

            <LoginForm />

            <p className="text-center text-xs text-muted-foreground">
              Account creation is managed by administrators.
            </p>
          </div>
        </div>
      </div>

      {/* Right — document panel */}
      <div className="relative hidden lg:block bg-muted">
        <div className="relative h-full">
          <LoginDocPanel files={files} />
        </div>
      </div>
    </div>
  );
}
