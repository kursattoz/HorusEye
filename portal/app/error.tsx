'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { config } from '@/constants/config';

function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    error.message.includes('Failed to load chunk') ||
    error.message.includes('Loading chunk') ||
    error.message.includes('Failed to fetch dynamically imported module')
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [countdown, setCountdown] = useState(3);
  const isChunkError = isChunkLoadError(error);

  useEffect(() => {
    if (!config.isDev) {
      import('@sentry/nextjs')
        .then(Sentry => Sentry.captureException(error))
        .catch(() => {});
    } else {
      console.error('[Error boundary]', error);
    }
  }, [error]);

  // Auto-reload on chunk load errors (new deployment)
  useEffect(() => {
    if (!isChunkError) return;

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isChunkError]);

  if (isChunkError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center">
        <RefreshCw className="h-10 w-10 text-primary animate-spin" />
        <h1 className="text-xl font-semibold">Updating...</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          A new version has been deployed. The page will refresh automatically in {countdown} seconds.
        </p>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          Refresh now
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h1 className="text-2xl font-semibold">Something went wrong</h1>

      {config.isDev ? (
        <div className="w-full max-w-2xl text-left">
          <pre className="text-xs font-mono text-destructive bg-destructive/10 p-4 rounded-lg overflow-auto whitespace-pre-wrap">
            {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(JSON.stringify({ message: error.message, stack: error.stack, digest: error.digest }, null, 2))}
            className="mt-2 text-xs text-muted-foreground underline"
          >
            Copy to clipboard
          </button>
        </div>
      ) : (
        <p className="text-muted-foreground max-w-md">
          An unexpected error occurred. Our team has been notified.
          {error.digest && (
            <span className="block text-xs mt-1 font-mono text-muted-foreground">
              Error ID: {error.digest}
            </span>
          )}
        </p>
      )}

      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
