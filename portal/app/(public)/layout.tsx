import Link from 'next/link';
import { ThemeToggle }   from '@/components/layout/ThemeToggle';
import { buttonVariants } from '@/components/ui/button';
import { routes }         from '@/constants/routes';
import { cn }             from '@/lib/utils';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="h-14 border-b bg-background flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            H
          </div>
          <span className="font-semibold text-sm">HorusEye</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link href={routes.login} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Giriş Yap →
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
