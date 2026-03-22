'use client';

import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

const VISIT_COUNT_KEY = 'horuseye_visit_count';
const DISMISSED_KEY = 'horuseye_install_dismissed';
const MIN_VISITS = 3;

function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Chrome/.test(ua);
  return isIOS && isSafari;
}

export function InstallPrompt() {
  const { canInstall, isInstalled, install } = usePWAInstall();
  const [isiOS] = useState(() => isIOSSafari());

  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return false;
    const count = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10);
    return count >= MIN_VISITS;
  });

  useEffect(() => {
    // Increment visit count on mount
    const count = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(count));
  }, []);

  // Derive visibility from state — no setState in effect
  const shouldShow = visible && !isInstalled && (canInstall || isiOS);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  };

  const handleInstall = async () => {
    const accepted = await install();
    if (accepted) {
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
    setVisible(false);
  };

  if (!shouldShow) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in fade-in duration-500">
      <Card className="w-80 shadow-lg border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {isiOS ? (
                <>
                  <p className="text-sm font-semibold mb-1">Install HorusEye</p>
                  <p className="text-xs text-muted-foreground">
                    Tap Share{' '}
                    <Share className="inline h-3.5 w-3.5 -mt-0.5" />{' '}
                    then &quot;Add to Home Screen&quot; to install HorusEye.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold mb-1">Install HorusEye</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Install the app for a faster, native-like experience.
                  </p>
                  <Button size="sm" onClick={handleInstall} className="gap-1.5">
                    <Download className="h-4 w-4" />
                    Install
                  </Button>
                </>
              )}
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss install prompt"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
