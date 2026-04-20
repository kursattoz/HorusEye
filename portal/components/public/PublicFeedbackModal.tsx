'use client';

import { useState } from 'react';
import { MessageSquarePlus, Mail, KeyRound, CheckCircle2, Loader2, X } from 'lucide-react';
import { getGuestSessionId } from '@/lib/utils/guestSession';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label }    from '@/components/ui/label';

type Step = 'form' | 'email' | 'code' | 'success';

interface Props {
  fileId:      string;
  fileName:    string;
  open:        boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublicFeedbackModal({ fileId, fileName, open, onOpenChange }: Props) {
  const [step,       setStep]       = useState<Step>('form');
  const [authorName, setAuthorName] = useState('');
  const [content,    setContent]    = useState('');
  const [email,      setEmail]      = useState('');
  const [otpId,      setOtpId]      = useState('');
  const [code,       setCode]       = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  function reset() {
    setStep('form');
    setAuthorName('');
    setContent('');
    setEmail('');
    setOtpId('');
    setCode('');
    setError(null);
    setLoading(false);
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  // ── Step 1: validate form and advance to email step ────────────────────────
  function handleFormSubmit() {
    setError(null);
    const name = authorName.trim();
    const text = content.trim();
    if (name.length < 2)  { setError('Name must be at least 2 characters.'); return; }
    if (name.length > 100) { setError('Name must be at most 100 characters.'); return; }
    if (text.length < 10)  { setError('Feedback must be at least 10 characters.'); return; }
    if (text.length > 1000) { setError('Feedback must be at most 1000 characters.'); return; }
    setStep('email');
  }

  // ── Step 2: send OTP ───────────────────────────────────────────────────────
  async function handleSendOtp() {
    setError(null);
    const addr = email.trim().toLowerCase();
    if (!addr.endsWith('@tedu.edu.tr')) {
      setError('Only @tedu.edu.tr email addresses are accepted.');
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch('/api/public/feedback/otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: addr, file_id: fileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to send code. Please try again.');
        return;
      }
      setOtpId(data.otp_id);
      setStep('code');
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: verify OTP then submit feedback ────────────────────────────────
  async function handleVerifyAndSubmit() {
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Please enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      // Verify OTP
      const verifyRes = await fetch('/api/public/feedback/otp/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ otp_id: otpId, code: code.trim() }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error ?? 'Invalid code. Please try again.');
        return;
      }

      // Submit feedback
      const submitRes = await fetch('/api/public/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          file_id:     fileId,
          author_name: authorName.trim(),
          content:     content.trim(),
          otp_id:      otpId,
          session_id:  getGuestSessionId(),
        }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        setError(submitData.error ?? 'Failed to submit feedback. Please try again.');
        return;
      }

      setStep('success');
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  // ── Resend OTP ─────────────────────────────────────────────────────────────
  async function handleResend() {
    setCode('');
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch('/api/public/feedback/otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), file_id: fileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to resend code.');
        return;
      }
      setOtpId(data.otp_id);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">

        {/* ── Step: form ───────────────────────────────────────────────── */}
        {step === 'form' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquarePlus size={18} />
                Leave Feedback
              </DialogTitle>
              <DialogDescription>
                Share your thoughts on <span className="font-medium">{fileName}</span>.
                You&apos;ll verify your identity with a @tedu.edu.tr email.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="pf-name">Your name</Label>
                <Input
                  id="pf-name"
                  placeholder="e.g. Ahmet Yılmaz"
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  maxLength={100}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-content">
                  Feedback
                  <span className="text-muted-foreground ml-1 font-normal text-xs">
                    ({content.length}/1000)
                  </span>
                </Label>
                <Textarea
                  id="pf-content"
                  placeholder="Write your feedback here…"
                  rows={4}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  maxLength={1000}
                  disabled={loading}
                  className="resize-none"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleFormSubmit}>Continue</Button>
            </div>
          </>
        )}

        {/* ── Step: email ───────────────────────────────────────────────── */}
        {step === 'email' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail size={18} />
                Verify your identity
              </DialogTitle>
              <DialogDescription>
                Enter your TED University email. We&apos;ll send a 6-digit code to verify it&apos;s you.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="pf-email">TED University email</Label>
                <div className="flex gap-2">
                  <Input
                    id="pf-email"
                    type="email"
                    placeholder="username@tedu.edu.tr"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={loading}
                    onKeyDown={e => { if (e.key === 'Enter') handleSendOtp(); }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Only @tedu.edu.tr addresses are accepted.</p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => { setError(null); setStep('form'); }}>
                ← Back
              </Button>
              <Button onClick={handleSendOtp} disabled={loading}>
                {loading && <Loader2 size={14} className="mr-2 animate-spin" />}
                Send Code
              </Button>
            </div>
          </>
        )}

        {/* ── Step: code ────────────────────────────────────────────────── */}
        {step === 'code' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound size={18} />
                Enter verification code
              </DialogTitle>
              <DialogDescription>
                We sent a 6-digit code to <span className="font-medium">{email.trim().toLowerCase()}</span>.
                It expires in 10 minutes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="pf-code">Verification code</Label>
                <Input
                  id="pf-code"
                  placeholder="000000"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  inputMode="numeric"
                  pattern="\d{6}"
                  className="text-center text-2xl tracking-[0.4em] font-mono"
                  disabled={loading}
                  onKeyDown={e => { if (e.key === 'Enter') handleVerifyAndSubmit(); }}
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="text-xs text-muted-foreground">
                Didn&apos;t receive it? Check your spam folder or{' '}
                <button
                  onClick={handleResend}
                  disabled={loading}
                  className="underline underline-offset-2 hover:text-foreground transition-colors disabled:opacity-50"
                >
                  resend code
                </button>.
              </p>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => { setError(null); setCode(''); setStep('email'); }}>
                ← Back
              </Button>
              <Button onClick={handleVerifyAndSubmit} disabled={loading || code.length !== 6}>
                {loading && <Loader2 size={14} className="mr-2 animate-spin" />}
                Verify &amp; Submit
              </Button>
            </div>
          </>
        )}

        {/* ── Step: success ─────────────────────────────────────────────── */}
        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-green-500" />
                Feedback submitted
              </DialogTitle>
              <DialogDescription>
                Thank you, <span className="font-medium">{authorName.trim()}</span>! Your feedback on{' '}
                <span className="font-medium">{fileName}</span> has been received.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-50 dark:bg-green-950">
                <CheckCircle2 size={32} className="text-green-500" />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => handleClose(false)}>Close</Button>
            </div>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
