'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Badge }   from '@/components/ui/badge';
import { toast }   from 'sonner';

interface ProfileTabProps {
  user: {
    id:        string;
    email:     string;
    full_name: string | null;
    role:      string;
    avatar_url: string | null;
  };
}

function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return email[0]?.toUpperCase() ?? 'U';
}

export function ProfileTab({ user }: ProfileTabProps) {
  const [fullName, setFullName] = useState(user.full_name ?? '');
  const [saving, setSaving]     = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName }),
    });
    if (res.ok) toast.success('Profil güncellendi.');
    else toast.error('Güncelleme başarısız.');
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profil Bilgileri</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user.avatar_url ?? undefined} />
            <AvatarFallback className="text-lg">{getInitials(user.full_name, user.email)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{user.full_name ?? 'İsim girilmemiş'}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-4 max-w-sm">
          <div className="space-y-2">
            <Label htmlFor="full-name">Ad Soyad</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={e => setFullName(e.target.value.slice(0, 100))}
              placeholder="Ad Soyad"
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user.email} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Email değişikliği admin tarafından yapılır.</p>
          </div>

          <div className="space-y-2">
            <Label>Rol</Label>
            <div>
              <Badge variant="secondary" className="capitalize">{user.role}</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Takım</Label>
            <Input value="horuseye-team" disabled className="bg-muted" />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
      </CardContent>
    </Card>
  );
}
