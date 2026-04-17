'use client';

import { useState } from 'react';
import { Mail, CheckCircle2, Loader2, ExternalLink, Download } from 'lucide-react';
import { getGuestSessionId } from '@/lib/utils/guestSession';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';

interface Props {
  fileId:      string;
  fileName:    string;
  action:      'open' | 'download';
  open:        boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccessLinkModal({ fileId, fileName, action, open, onOpenChange }: Props) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [sent,    setSent]    = useState(false);

  function reset() {
    setEmail('');
    setError(null);
    setLoading(false);
    setSent(false);
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function handleSend() {
    setError(null);
    const addr = email.trim().toLowerCase();
    if (!addr.endsWith('@tedu.edu.tr')) {
      setError('Only @tedu.edu.tr email addresses are accepted.');
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch('/api/public/files/access-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: addr, file_id: fileId, action, session_id: getGuestSessionId() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to send link. Please try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  const Icon = action === 'download' ? Download : ExternalLink;
  const label = action === 'download' ? 'Download' : 'Open';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">

        {!sent ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon size={18} />
                {label} Document
              </DialogTitle>
              <DialogDescription>
                Enter your TED University email to receive the access link for{' '}
                <span className="font-medium">{fileName}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="al-email">TED University email</Label>
                <Input
                  id="al-email"
                  type="email"
                  placeholder="username@tedu.edu.tr"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={loading}
                  onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Only @tedu.edu.tr addresses are accepted.
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleSend} disabled={loading}>
                {loading && <Loader2 size={14} className="mr-2 animate-spin" />}
                Send Link
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-green-500" />
                Link sent
              </DialogTitle>
              <DialogDescription>
                We sent the access link to{' '}
                <span className="font-medium">{email.trim().toLowerCase()}</span>.
                Check your inbox (and spam folder) and click &quot;Open Document&quot;.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-50 dark:bg-green-950">
                <Mail size={28} className="text-green-500" />
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
