'use client';

import { useTheme } from 'next-themes';
import { useState } from 'react';
import { switchTheme } from '@/lib/utils/switchTheme';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { updateColorThemeAction } from '@/app/actions/auth';

/* ─── Light / dark / system ──────────────────────────────────────────────── */

const THEMES = [
  { value: 'light',  label: 'Light',  icon: Sun,     preview: 'bg-white border-gray-200' },
  { value: 'dark',   label: 'Dark',   icon: Moon,    preview: 'bg-zinc-900 border-zinc-700' },
  { value: 'system', label: 'System', icon: Monitor, preview: 'bg-gradient-to-br from-white to-zinc-900 border-gray-300' },
] as const;

/* ─── Color accent themes ─────────────────────────────────────────────────── */

const COLOR_THEMES = [
  {
    value:  'red',
    label:  'Red',
    swatch: 'oklch(0.637 0.237 25.331)',
  },
  {
    value:  'pink',
    label:  'Pink',
    swatch: 'oklch(0.656 0.241 354.308)',
  },
  {
    value:  'orange',
    label:  'Orange',
    swatch: 'oklch(0.705 0.213 47.604)',
  },
  {
    value:  'blue',
    label:  'Blue',
    swatch: 'oklch(0.623 0.214 259.815)',
  },
] as const;

type ColorTheme = typeof COLOR_THEMES[number]['value'];

const STORAGE_KEY = 'horuseye-color-theme';

function applyColorTheme(value: ColorTheme) {
  document.documentElement.setAttribute('data-color-theme', value);
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* noop */ }
  // Persist to user profile (fire-and-forget, no await needed here)
  updateColorThemeAction(value).catch(() => { /* noop */ });
}

/* ─── Component ───────────────────────────────────────────────────────────── */

function getStoredColorTheme(): ColorTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ColorTheme | null;
    if (stored && COLOR_THEMES.some(c => c.value === stored)) return stored;
  } catch { /* noop */ }
  return 'red';
}

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [colorTheme, setColorTheme] = useState<ColorTheme>(getStoredColorTheme);

  function handleColorTheme(value: ColorTheme) {
    setColorTheme(value);
    applyColorTheme(value);
  }

  return (
    <div className="space-y-6">
      {/* Light / Dark / System */}
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
                  onClick={() => switchTheme(setTheme, t.value)}
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

      {/* Accent color */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accent Color</CardTitle>
          <CardDescription>Choose the primary accent color used across the interface.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {COLOR_THEMES.map(c => {
              const active = colorTheme === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() => handleColorTheme(c.value)}
                  aria-label={c.label}
                  aria-pressed={active}
                  className={cn(
                    'group relative flex flex-col items-center gap-2 rounded-lg border-2 p-3 w-20 transition-all text-sm font-medium',
                    active
                      ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'border-muted hover:border-primary/40'
                  )}
                >
                  {/* Color swatch */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm"
                    style={{ background: c.swatch }}
                  >
                    {active && <Check size={16} className="text-white drop-shadow" strokeWidth={3} />}
                  </div>
                  <span className="text-xs">{c.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
