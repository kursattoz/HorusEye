'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Palette, User, Lock, Users, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';

const USER_NAV = [
  { label: 'Appearance', href: '/settings/appearance', icon: Palette },
  { label: 'Profile',    href: '/settings/profile',    icon: User    },
  { label: 'Account',    href: '/settings/account',    icon: Lock    },
];

const ADMIN_NAV = [
  { label: 'Users',        href: '/settings/users',        icon: Users },
  { label: 'Integrations', href: '/settings/integrations', icon: Plug  },
];

interface Props { isAdmin: boolean }

function NavItem({ label, href, icon: Icon }: { label: string; href: string; icon: React.ElementType }) {
  const pathname = usePathname();
  const active   = pathname === href;
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      <Icon size={15} className="shrink-0" />
      {label}
    </Link>
  );
}

export function SettingsSidebar({ isAdmin }: Props) {
  return (
    <nav className="w-44 shrink-0">
      <div className="space-y-0.5">
        {USER_NAV.map(item => <NavItem key={item.href} {...item} />)}
      </div>

      {isAdmin && (
        <>
          <div className="px-3 pt-5 pb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Admin
            </p>
          </div>
          <div className="space-y-0.5">
            {ADMIN_NAV.map(item => <NavItem key={item.href} {...item} />)}
          </div>
        </>
      )}
    </nav>
  );
}
