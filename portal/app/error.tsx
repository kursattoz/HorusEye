'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { config } from '@/constants/config';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!config.isDev) {
      import('@sentry/nextjs')
        .then(Sentry => Sentry.captureException(error))
        .catch(() => {});
    } else {
      console.error('[Error boundary]', error);
    }
  }, [error]);

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
