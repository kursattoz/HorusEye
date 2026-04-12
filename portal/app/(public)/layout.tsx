import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle }   from '@/components/layout/ThemeToggle';
import { buttonVariants } from '@/components/ui/button';
import { routes }         from '@/constants/routes';
import { cn }             from '@/lib/utils';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="h-14 border-b bg-background flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Image src="/images/cover-icon.png" alt="HorusEye" width={28} height={28} className="shrink-0 dark:invert" />
          <Image src="/images/cover-wordmark.png" alt="horuseye" width={80} height={16} className="h-4 w-auto dark:invert" />
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link href={routes.login} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Sign In →
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
