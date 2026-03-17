'use client';

import { useActionState, useState, useMemo } from 'react';
import { changePasswordAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { Loader2, Eye, EyeOff, ShieldCheck, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Check {
  label: string;
  test:  (pw: string) => boolean;
}

const CHECKS: Check[] = [
  { label: 'At least 8 characters',       test: pw => pw.length >= 8 },
  { label: 'Uppercase letter (A–Z)',       test: pw => /[A-Z]/.test(pw) },
  { label: 'Lowercase letter (a–z)',       test: pw => /[a-z]/.test(pw) },
  { label: 'Number (0–9)',                 test: pw => /[0-9]/.test(pw) },
  { label: 'Special character (!@#$…)',    test: pw => /[^A-Za-z0-9]/.test(pw) },
];

function getStrength(pw: string): { score: number; label: string; color: string } {
  const passed = CHECKS.filter(c => c.test(pw)).length;
  if (pw.length === 0) return { score: 0, label: '',        color: '' };
  if (passed <= 1)     return { score: 1, label: 'Weak',    color: 'bg-red-500' };
  if (passed === 2)    return { score: 2, label: 'Fair',    color: 'bg-orange-400' };
  if (passed === 3)    return { score: 3, label: 'Good',    color: 'bg-yellow-400' };
  if (passed === 4)    return { score: 4, label: 'Strong',  color: 'bg-blue-500' };
  return               { score: 5, label: 'Very strong',   color: 'bg-green-500' };
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, {});
  const [pw,      setPw]      = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw,  setShowPw]  = useState(false);
  const [showCfm, setShowCfm] = useState(false);

  const strength = useMemo(() => getStrength(pw), [pw]);
  const mismatch = confirm.length > 0 && pw !== confirm;

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {/* New password */}
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPw ? 'text' : 'password'}
            placeholder="Choose a strong password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            className="pr-10"
            value={pw}
            onChange={e => setPw(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPw(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* Strength bar */}
        {pw.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-all duration-300',
                    i <= strength.score ? strength.color : 'bg-muted'
                  )}
                />
              ))}
            </div>
            {strength.label && (
              <p className={cn('text-xs font-medium', {
                'text-red-500':    strength.score <= 1,
                'text-orange-400': strength.score === 2,
                'text-yellow-500': strength.score === 3,
                'text-blue-500':   strength.score === 4,
                'text-green-500':  strength.score === 5,
              })}>
                {strength.label}
              </p>
            )}
          </div>
        )}

        {/* Requirement checklist */}
        {pw.length > 0 && (
          <ul className="space-y-1 pt-1">
            {CHECKS.map(c => {
              const ok = c.test(pw);
              return (
                <li key={c.label} className="flex items-center gap-2 text-xs">
                  {ok
                    ? <Check size={12} className="text-green-500 shrink-0" />
                    : <X    size={12} className="text-muted-foreground/50 shrink-0" />}
                  <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>
                    {c.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Confirm password */}
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <div className="relative">
          <Input
            id="confirm"
            name="confirm"
            type={showCfm ? 'text' : 'password'}
            placeholder="Re-enter password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            className={cn('pr-10', mismatch && 'border-destructive focus-visible:ring-destructive')}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowCfm(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showCfm ? 'Hide password' : 'Show password'}
          >
            {showCfm ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {mismatch && (
          <p className="text-xs text-destructive">Passwords do not match.</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={pending || strength.score < 3 || mismatch || confirm.length === 0}
      >
        {pending
          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</>
          : <><ShieldCheck className="h-4 w-4 mr-2" /> Set new password</>
        }
      </Button>
    </form>
  );
}
