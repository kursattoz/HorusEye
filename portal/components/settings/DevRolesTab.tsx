'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, User } from 'lucide-react';
import { toast } from 'sonner';
import type { DevRole } from '@/types';

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  dev_role: DevRole | null;
  avatar_url: string | null;
}

const DEV_ROLES: { value: DevRole; label: string; description: string }[] = [
  { value: 'product_owner', label: 'Product Owner', description: 'Sprint coordination, backlog prioritization, PR review' },
  { value: 'portal_frontend', label: 'Portal Frontend', description: 'Dashboard, Settings, Files UI/UX, responsive design' },
  { value: 'portal_backend', label: 'Portal Backend', description: 'API routes, Supabase, RLS, migrations' },
  { value: 'ai_backend', label: 'AI Backend', description: 'Python/FastAPI, camera pipeline, model integration' },
  { value: 'fullstack', label: 'Fullstack', description: 'Camera UI, WebRTC, Portal↔AI, general front tasks' },
  { value: 'project_coordinator', label: 'Project Coordinator', description: 'Reporting, material collection, front testing, data training' },
];

export function DevRolesTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localRoles, setLocalRoles] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetch('/api/settings/dev-roles')
      .then(r => r.json())
      .then(d => {
        const m = d.members ?? [];
        setMembers(m);
        const map = new Map<string, string>();
        for (const member of m) {
          map.set(member.id, member.dev_role ?? 'none');
        }
        setLocalRoles(map);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    const assignments = Array.from(localRoles.entries()).map(([user_id, dev_role]) => ({
      user_id,
      dev_role: dev_role === 'none' ? null : dev_role,
    }));

    const res = await fetch('/api/settings/dev-roles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    });
    setSaving(false);

    if (res.ok) {
      const data = await res.json();
      setMembers(data.members ?? []);
      toast.success('Dev roles updated. Backlog items auto-transferred for changed roles.');
    } else {
      toast.error('Failed to update');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={20} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Development Roles</h2>
        <p className="text-sm text-muted-foreground">
          Assign development roles to team members. Backlog items with a dev_role will auto-assign to the person with that role.
          Changing a role transfers unstarted backlog items to the new holder.
        </p>
      </div>

      <div className="space-y-4">
        {members.map(m => (
          <div key={m.id} className="flex items-center gap-4 border rounded-lg p-4">
            {/* Avatar */}
            {m.avatar_url ? (
              <Image src={m.avatar_url} alt={m.full_name} width={36} height={36} className="size-9 rounded-full object-cover" />
            ) : (
              <div className="size-9 rounded-full bg-muted flex items-center justify-center">
                <User size={16} className="text-muted-foreground" />
              </div>
            )}

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{m.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
            </div>

            {/* Role select */}
            <div className="w-52 shrink-0">
              <Select
                value={localRoles.get(m.id) ?? 'none'}
                onValueChange={v => setLocalRoles(prev => new Map(prev).set(m.id, v))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="No role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No role</SelectItem>
                  {DEV_ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>

      {/* Role descriptions */}
      <div className="border rounded-lg p-4 space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role Reference</Label>
        {DEV_ROLES.map(r => (
          <div key={r.value} className="flex items-start gap-2 text-xs">
            <span className="font-medium text-foreground shrink-0 w-36">{r.label}</span>
            <span className="text-muted-foreground">{r.description}</span>
          </div>
        ))}
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Roles'}
      </Button>
    </div>
  );
}
