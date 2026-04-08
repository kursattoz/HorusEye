'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { config } from '@/constants/config';

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!config.isDev) {
      import('@sentry/nextjs')
        .then(Sentry => Sentry.captureException(error))
        .catch(() => {});
    } else {
      console.error('[Protected route error]', error);
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <h1 className="text-xl font-semibold">Something went wrong</h1>

      {config.isDev ? (
        <div className="w-full max-w-2xl text-left">
          <pre className="text-xs font-mono text-destructive bg-destructive/10 p-4 rounded-lg overflow-auto whitespace-pre-wrap">
            {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
        </div>
      ) : (
        <p className="text-muted-foreground max-w-sm text-sm">
          An unexpected error occurred. Our team has been notified.
          {error.digest && (
            <span className="block text-xs mt-1 font-mono">Error ID: {error.digest}</span>
          )}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={reset} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Try again
        </Button>
        <Button onClick={() => router.push('/dashboard')} variant="ghost" size="sm">
          <Home className="h-4 w-4 mr-1.5" />
          Dashboard
        </Button>
      </div>
    </div>
  );
}
