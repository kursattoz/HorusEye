'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button }    from '@/components/ui/button';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Switch }    from '@/components/ui/switch';
import { Badge }     from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast }     from 'sonner';
import { Mail, Wifi, WifiOff, Loader2 } from 'lucide-react';

interface SmtpForm {
  host:        string;
  port:        string;
  secure:      boolean;
  username:    string;
  password:    string;
  from_name:   string;
  from_email:  string;
  admin_email: string;
}

const DEFAULTS: SmtpForm = {
  host:        '',
  port:        '587',
  secure:      false,
  username:    '',
  password:    '',
  from_name:   'HorusEye',
  from_email:  '',
  admin_email: '',
};

type ConnectionStatus = 'idle' | 'ok' | 'fail';

export function SmtpTab() {
  const [form,    setForm]    = useState<SmtpForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [testing, setTesting] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('idle');

  // Load saved settings on mount
  useEffect(() => {
    fetch('/api/settings/smtp')
      .then(r => r.json())
      .then(({ settings }) => {
        if (settings) {
          setForm(prev => ({
            ...prev,
            host:        settings.host        ?? '',
            port:        String(settings.port ?? 587),
            secure:      settings.secure      ?? false,
            username:    settings.username    ?? '',
            from_name:   settings.from_name   ?? '',
            from_email:  settings.from_email  ?? '',
            admin_email: settings.admin_email ?? '',
            password:    '', // never pre-fill
          }));
        }
      })
      .catch(() => toast.error('Failed to load SMTP settings.'))
      .finally(() => setLoading(false));
  }, []);

  function set(key: keyof SmtpForm, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }));
    setConnStatus('idle');
  }

  async function handleSave() {
    if (!form.host || !form.port || !form.from_email || !form.admin_email) {
      toast.error('Host, port, from email, and admin email are required.');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/settings/smtp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host:        form.host,
        port:        Number(form.port),
        secure:      form.secure,
        username:    form.username,
        password:    form.password || undefined, // omit if empty (keep existing)
        from_name:   form.from_name,
        from_email:  form.from_email,
        admin_email: form.admin_email,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success('SMTP settings saved.');
      setForm(prev => ({ ...prev, password: '' })); // clear after save
    } else {
      toast.error(data.error ?? 'Failed to save settings.');
    }
    setSaving(false);
  }

  async function handleTest() {
    setTesting(true);
    setConnStatus('idle');
    const res = await fetch('/api/settings/smtp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host:       form.host       || undefined,
        port:       Number(form.port),
        secure:     form.secure,
        username:   form.username   || undefined,
        password:   form.password   || undefined,
        from_email: form.from_email || undefined,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setConnStatus('ok');
      toast.success('SMTP connection verified.');
    } else {
      setConnStatus('fail');
      toast.error(data.error ?? 'SMTP connection failed.');
    }
    setTesting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 size={16} className="animate-spin" /> Loading SMTP settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail size={18} className="text-muted-foreground" />
              <CardTitle className="text-base">SMTP Configuration</CardTitle>
            </div>
            {connStatus === 'ok'   && <Badge variant="default"  className="gap-1"><Wifi size={12} /> Connected</Badge>}
            {connStatus === 'fail' && <Badge variant="destructive" className="gap-1"><WifiOff size={12} /> Failed</Badge>}
          </div>
          <CardDescription>
            Outgoing mail server used for notifications. Password is stored encrypted (AES-256-GCM).
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Server */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Server</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>SMTP Host</Label>
                <Input
                  placeholder="smtp.example.com"
                  value={form.host}
                  onChange={e => set('host', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Port</Label>
                <Input
                  placeholder="587"
                  value={form.port}
                  onChange={e => set('port', e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Switch
                id="secure"
                checked={form.secure}
                onCheckedChange={v => set('secure', v)}
              />
              <Label htmlFor="secure" className="cursor-pointer">
                Use TLS / SSL (port 465)
              </Label>
            </div>
          </div>

          <Separator />

          {/* Auth */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Authentication</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input
                  placeholder="user@example.com"
                  value={form.username}
                  onChange={e => set('username', e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Password
                  {form.password === '' && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">(leave blank to keep existing)</span>
                  )}
                </Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* From */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Sender</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From Name</Label>
                <Input
                  placeholder="HorusEye"
                  value={form.from_name}
                  onChange={e => set('from_name', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>From Email</Label>
                <Input
                  type="email"
                  placeholder="noreply@example.com"
                  value={form.from_email}
                  onChange={e => set('from_email', e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Notifications */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Notifications</p>
            <div className="space-y-1.5 max-w-sm">
              <Label>Admin Notification Email</Label>
              <Input
                type="email"
                placeholder="admin@example.com"
                value={form.admin_email}
                onChange={e => set('admin_email', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Public feedback from the login screen is forwarded to this address.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving || testing}>
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={saving || testing || !form.host}
            >
              {testing
                ? <><Loader2 size={14} className="animate-spin mr-1.5" />Testing…</>
                : <><Wifi size={14} className="mr-1.5" />Test Connection</>
              }
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
