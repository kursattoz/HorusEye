'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Check, X, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StrengthCheck {
  label: string;
  test:  (pw: string) => boolean;
}

const CHECKS: StrengthCheck[] = [
  { label: 'At least 8 characters',    test: pw => pw.length >= 8 },
  { label: 'Uppercase letter (A–Z)',    test: pw => /[A-Z]/.test(pw) },
  { label: 'Lowercase letter (a–z)',    test: pw => /[a-z]/.test(pw) },
  { label: 'Number (0–9)',              test: pw => /[0-9]/.test(pw) },
  { label: 'Special character (!@#$…)', test: pw => /[^A-Za-z0-9]/.test(pw) },
];

const STRENGTH_LEVELS = [
  { min: 0, label: '',           color: '' },
  { min: 1, label: 'Weak',       color: 'bg-red-500' },
  { min: 2, label: 'Fair',       color: 'bg-orange-400' },
  { min: 3, label: 'Good',       color: 'bg-yellow-400' },
  { min: 4, label: 'Strong',     color: 'bg-blue-500' },
  { min: 5, label: 'Very strong', color: 'bg-green-500' },
];

function getStrength(pw: string) {
  const score = pw.length === 0 ? 0 : CHECKS.filter(c => c.test(pw)).length;
  return { score, ...STRENGTH_LEVELS[score] };
}

export function AccountTab() {
  const [newPw,   setNewPw]   = useState('');
  const [confPw,  setConfPw]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [showPw,  setShowPw]  = useState(false);
  const [showCfm, setShowCfm] = useState(false);

  const strength = useMemo(() => getStrength(newPw), [newPw]);
  const mismatch = confPw.length > 0 && newPw !== confPw;
  const canSubmit = !saving && strength.score >= 3 && confPw.length > 0 && !mismatch;

  async function handleChangePassword() {
    if (newPw !== confPw) { toast.error('Passwords do not match.'); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) toast.error(error.message);
    else {
      toast.success('Password updated. Other sessions have been terminated.');
      setNewPw(''); setConfPw('');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-sm">

          {/* New password */}
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="Choose a strong password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* Strength bar */}
            {newPw.length > 0 && (
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

                {/* Checklist */}
                <ul className="space-y-1 pt-0.5">
                  {CHECKS.map(c => {
                    const ok = c.test(newPw);
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
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <Label>Confirm Password</Label>
            <div className="relative">
              <Input
                type={showCfm ? 'text' : 'password'}
                value={confPw}
                onChange={e => setConfPw(e.target.value)}
                placeholder="Re-enter your password"
                className={cn('pr-10', mismatch && 'border-destructive focus-visible:ring-destructive')}
              />
              <button
                type="button"
                onClick={() => setShowCfm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCfm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {mismatch && (
              <p className="text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>

          <Button onClick={handleChangePassword} disabled={!canSubmit}>
            {saving ? 'Updating...' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
