'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Badge }   from '@/components/ui/badge';
import { toast }   from 'sonner';
import { Camera, Loader2 } from 'lucide-react';
import { AvatarCropDialog } from './AvatarCropDialog';

const MAX_FILE_SIZE  = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES  = ['image/jpeg', 'image/png', 'image/webp'];

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
  const [fullName,  setFullName]  = useState(user.full_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc,   setCropSrc]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';          // reset so same file can be re-picked

    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Only JPG, PNG, and WebP images are allowed.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Image must be under 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleCropConfirm(blob: Blob) {
    setCropSrc(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', blob, 'avatar.jpg');
      const res = await fetch('/api/users/avatar', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Upload failed');
      }
      const { avatar_url } = await res.json();
      setAvatarUrl(avatar_url);
      toast.success('Profile photo updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload error.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName }),
    });
    if (res.ok) toast.success('Profile updated.');
    else toast.error('Update failed.');
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar with upload */}
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar className="h-16 w-16">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="text-lg">
                {uploading
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : getInitials(user.full_name, user.email)
                }
              </AvatarFallback>
            </Avatar>
            {/* Upload overlay */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change profile photo"
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
            >
              <Camera className="h-5 w-5 text-white" />
            </button>
          </div>

          <div>
            <p className="text-sm font-medium">{user.full_name ?? 'No name set'}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-primary hover:underline mt-0.5 disabled:opacity-50"
            >
              Change photo
            </button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Crop dialog */}
        {cropSrc && (
          <AvatarCropDialog
            open={true}
            imageSrc={cropSrc}
            onClose={() => setCropSrc(null)}
            onConfirm={handleCropConfirm}
          />
        )}

        {/* Fields */}
        <div className="space-y-4 max-w-sm">
          <div className="space-y-2">
            <Label htmlFor="full-name">Full Name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={e => setFullName(e.target.value.slice(0, 100))}
              placeholder="Full Name"
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user.email} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Email changes are managed by an admin.</p>
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <div>
              <Badge variant="secondary" className="capitalize">{user.role}</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Team</Label>
            <Input value="horuseye-team" disabled className="bg-muted" />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}
