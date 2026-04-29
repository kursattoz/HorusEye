/**
 * Switch themes using the View Transition API for a smooth GPU-composited crossfade.
 * Falls back to instant switch on unsupported browsers.
 */
export function switchTheme(setTheme: (theme: string) => void, theme: string) {
  if (typeof document === 'undefined' || typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition !== 'function') {
    setTheme(theme);
    return;
  }
  (document as Document & { startViewTransition(cb: () => void): void })
    .startViewTransition(() => setTheme(theme));
}
