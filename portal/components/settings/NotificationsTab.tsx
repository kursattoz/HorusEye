'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface Preferences {
  email_reminders: boolean;
  reminder_days_before: number[];
  email_on_assign: boolean;
  email_on_feedback: boolean;
}

const REMINDER_OPTIONS = [
  { value: 7, label: '7 days before' },
  { value: 3, label: '3 days before' },
  { value: 1, label: '1 day before' },
  { value: 0, label: 'On the day' },
];

export function NotificationsTab() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings/notifications')
      .then(r => r.json())
      .then(d => setPrefs(d.preferences));
  }, []);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    const res = await fetch('/api/settings/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Notification settings saved');
    } else {
      toast.error('Failed to save settings');
    }
  }

  function toggleDay(day: number) {
    if (!prefs) return;
    const days = prefs.reminder_days_before.includes(day)
      ? prefs.reminder_days_before.filter(d => d !== day)
      : [...prefs.reminder_days_before, day];
    setPrefs({ ...prefs, reminder_days_before: days });
  }

  if (!prefs) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={20} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Configure how and when you receive email notifications.
        </p>
      </div>

      {/* Email on assign */}
      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div>
          <Label className="text-sm font-medium">Assignment emails</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Receive an email when a deliverable is assigned to you.
          </p>
        </div>
        <Switch
          checked={prefs.email_on_assign}
          onCheckedChange={v => setPrefs({ ...prefs, email_on_assign: v })}
        />
      </div>

      {/* Email on feedback */}
      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div>
          <Label className="text-sm font-medium">Feedback emails</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Receive an email when someone leaves feedback on your file.
          </p>
        </div>
        <Switch
          checked={prefs.email_on_feedback}
          onCheckedChange={v => setPrefs({ ...prefs, email_on_feedback: v })}
        />
      </div>

      {/* Deadline reminders */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">Deadline reminders</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Receive email reminders before deliverable deadlines.
            </p>
          </div>
          <Switch
            checked={prefs.email_reminders}
            onCheckedChange={v => setPrefs({ ...prefs, email_reminders: v })}
          />
        </div>

        {prefs.email_reminders && (
          <div className="space-y-2 pl-1">
            <p className="text-xs text-muted-foreground font-medium">Remind me:</p>
            {REMINDER_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={prefs.reminder_days_before.includes(opt.value)}
                  onCheckedChange={() => toggleDay(opt.value)}
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save changes'}
      </Button>
    </div>
  );
}
