'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { config } from '@/constants/config';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  sentryEventId?: string;
}

/**
 * React error boundary for catching unhandled render errors.
 * local/staging → full stack trace + copy button + Sentry event ID
 * production    → user-friendly message + Sentry event ID only
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    import('@sentry/nextjs')
      .then(Sentry => {
        const eventId = Sentry.captureException(error, {
          extra: { componentStack: info.componentStack },
        });
        this.setState({ sentryEventId: eventId });
      })
      .catch(() => {});

    if (config.isDev) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, sentryEventId: undefined });
  };

  private handleCopy = () => {
    const { error, sentryEventId } = this.state;
    const payload = JSON.stringify(
      { message: error?.message, stack: error?.stack, sentryEventId },
      null,
      2,
    );
    navigator.clipboard.writeText(payload).catch(() => {});
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const { error, sentryEventId } = this.state;

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold">Something went wrong</h2>

        {config.isDev && error ? (
          <div className="w-full max-w-2xl text-left space-y-2">
            <pre className="text-xs font-mono text-destructive bg-destructive/10 p-4 rounded-lg overflow-auto whitespace-pre-wrap">
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
            {sentryEventId && (
              <p className="text-xs text-muted-foreground font-mono">
                Sentry event ID: {sentryEventId}
              </p>
            )}
            <button
              onClick={this.handleCopy}
              className="text-xs text-muted-foreground underline"
            >
              Copy to clipboard
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">
              An error occurred. Our team has been notified.
            </p>
            {sentryEventId && (
              <p className="text-xs text-muted-foreground font-mono">
                Error ID: {sentryEventId}
              </p>
            )}
          </div>
        )}

        <Button onClick={this.handleReset} variant="outline" size="sm">
          Try again
        </Button>
      </div>
    );
  }
}
