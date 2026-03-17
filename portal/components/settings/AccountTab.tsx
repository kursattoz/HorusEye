'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export function AccountTab() {
  const [newPw,  setNewPw]  = useState('');
  const [confPw, setConfPw] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleChangePassword() {
    if (newPw.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    if (newPw !== confPw)  { toast.error('Passwords do not match.'); return; }
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
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="space-y-2">
            <Label>Confirm Password</Label>
            <Input
              type="password"
              value={confPw}
              onChange={e => setConfPw(e.target.value)}
              placeholder="Re-enter your password"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={!newPw || !confPw || saving}>
            {saving ? 'Updating...' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
