'use client';

import { useState } from 'react';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

const EMAIL_RE      = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LEN = 254;

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = email.trim();
    if (!trimmed)                         return setError('Email is required.');
    if (trimmed.length > MAX_EMAIL_LEN)   return setError('Email address is too long.');
    if (!EMAIL_RE.test(trimmed))          return setError('Please enter a valid email address.');

    setPending(true);
    try {
      await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: trimmed }),
      });
      // Always show success to prevent email enumeration
      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-4">
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>
            If an account exists for <strong>{email.trim()}</strong>, a password reset link has been sent. Check your inbox.
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="w-full" onClick={onBack}>
          Back to Login
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Reset password</h2>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          type="email"
          placeholder="you@tedu.edu.tr"
          autoComplete="email"
          inputMode="email"
          maxLength={MAX_EMAIL_LEN}
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={pending}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
        ) : (
          'Send reset link'
        )}
      </Button>

      <Button type="button" variant="ghost" className="w-full" onClick={onBack} disabled={pending}>
        Back to Login
      </Button>
    </form>
  );
}
