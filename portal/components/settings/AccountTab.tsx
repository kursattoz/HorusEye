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
    if (newPw.length < 8) { toast.error('Şifre en az 8 karakter olmalıdır.'); return; }
    if (newPw !== confPw)  { toast.error('Şifreler eşleşmiyor.'); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) toast.error(error.message);
    else {
      toast.success('Şifre güncellendi. Diğer oturumlar sonlandırıldı.');
      setNewPw(''); setConfPw('');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Şifre Değiştir</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-sm">
          <div className="space-y-2">
            <Label>Yeni Şifre</Label>
            <Input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="En az 8 karakter"
            />
          </div>
          <div className="space-y-2">
            <Label>Şifre Tekrar</Label>
            <Input
              type="password"
              value={confPw}
              onChange={e => setConfPw(e.target.value)}
              placeholder="Şifreyi tekrar girin"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={!newPw || !confPw || saving}>
            {saving ? 'Güncelleniyor...' : 'Şifreyi Değiştir'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
