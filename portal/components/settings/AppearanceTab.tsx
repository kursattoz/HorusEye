'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const THEMES = [
  { value: 'light',  label: 'Light',  icon: Sun,     preview: 'bg-white border-gray-200' },
  { value: 'dark',   label: 'Dark',   icon: Moon,    preview: 'bg-zinc-900 border-zinc-700' },
  { value: 'system', label: 'System', icon: Monitor, preview: 'bg-gradient-to-br from-white to-zinc-900 border-gray-300' },
] as const;

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Theme</CardTitle>
        <CardDescription>Choose the interface theme. Selection is applied immediately.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 max-w-sm">
          {THEMES.map(t => {
            const Icon   = t.icon;
            const active = theme === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all text-sm font-medium',
                  active
                    ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'border-muted hover:border-primary/40'
                )}
                aria-pressed={active}
              >
                <div className={cn('w-full h-12 rounded border', t.preview)} />
                <div className="flex items-center gap-1.5">
                  <Icon size={13} />
                  {t.label}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
