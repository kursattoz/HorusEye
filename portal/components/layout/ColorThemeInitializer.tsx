'use client';

import { useEffect } from 'react';

interface ColorThemeInitializerProps {
  colorTheme: string;
}

/**
 * Applies the user's saved color theme to <html data-color-theme="..."> on mount.
 * This overwrites the localStorage-based default set by the inline script,
 * giving each user their own persistent accent color stored in the database.
 */
export function ColorThemeInitializer({ colorTheme }: ColorThemeInitializerProps) {
  useEffect(() => {
    document.documentElement.setAttribute('data-color-theme', colorTheme);
    // Keep localStorage in sync so the inline script shows the right color before hydration
    try { localStorage.setItem('horuseye-color-theme', colorTheme); } catch { /* noop */ }
  }, [colorTheme]);

  return null;
}
