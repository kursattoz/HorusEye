'use client';

import { useActionState } from 'react';
import { loginAction, type AuthState } from '@/app/actions/auth';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { useState, useRef } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LEN    = 254; // RFC 5321
const MAX_PASSWORD_LEN = 128;
const MIN_PASSWORD_LEN = 6;

interface FieldErrors {
  email?:    string;
  password?: string;
}

const initialState: AuthState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors,  setFieldErrors]  = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  function validate(email: string, password: string): FieldErrors {
    const errors: FieldErrors = {};

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = 'Email is required.';
    } else if (trimmedEmail.length > MAX_EMAIL_LEN) {
      errors.email = 'Email address is too long.';
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < MIN_PASSWORD_LEN) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
    } else if (password.length > MAX_PASSWORD_LEN) {
      errors.password = 'Password is too long.';
    }

    return errors;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const data     = new FormData(e.currentTarget);
    const email    = (data.get('email')    as string) ?? '';
    const password = (data.get('password') as string) ?? '';

    const errors = validate(email, password);
    if (Object.keys(errors).length > 0) {
      e.preventDefault();
      e.stopPropagation();
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
  }

  return (
    <form ref={formRef} action={action} onSubmit={handleSubmit} className="space-y-4" noValidate>
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@horuseye.com"
          autoComplete="email"
          inputMode="email"
          maxLength={MAX_EMAIL_LEN}
          disabled={pending}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          onChange={() => fieldErrors.email && setFieldErrors(p => ({ ...p, email: undefined }))}
          className={fieldErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''}
        />
        {fieldErrors.email && (
          <p id="email-error" className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle size={11} />
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            maxLength={MAX_PASSWORD_LEN}
            disabled={pending}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            onChange={() => fieldErrors.password && setFieldErrors(p => ({ ...p, password: undefined }))}
            className={`pr-10 ${fieldErrors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {fieldErrors.password && (
          <p id="password-error" className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle size={11} />
            {fieldErrors.password}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Logging in...
          </>
        ) : (
          'Login'
        )}
      </Button>
    </form>
  );
}
