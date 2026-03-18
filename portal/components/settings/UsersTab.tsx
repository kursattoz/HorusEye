'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge }    from '@/components/ui/badge';
import { Button }   from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PERMISSION_MATRIX, PERMISSION_LABELS } from '@/constants/permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus } from 'lucide-react';

const ROLES = ['admin', 'supervisor', 'assistant', 'guest'] as const;

interface UserRow {
  id:        string;
  email:     string;
  full_name: string | null;
  role:      string;
  is_active: boolean;
}

const ASSIGNABLE_ROLES = ['supervisor', 'assistant', 'guest'] as const;
type AssignableRole = typeof ASSIGNABLE_ROLES[number];

interface AddUserForm {
  full_name: string;
  email:     string;
  role:      AssignableRole;
}

export function UsersTab() {
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Add User dialog state
  const [open,       setOpen]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState('');
  const [success,    setSuccess]    = useState('');
  const [form, setForm] = useState<AddUserForm>({ full_name: '', email: '', role: 'supervisor' });

  const loadUsers = () => {
    setLoading(true);
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setUsers(data.users ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) { setForm({ full_name: '', email: '', role: 'supervisor' }); setFormError(''); setSuccess(''); }
  };

  const handleSubmit = async () => {
    setFormError('');
    if (!form.email) { setFormError('Email is required.'); return; }
    setSubmitting(true);
    try {
      const res  = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? 'Failed to create user.'); return; }
      setSuccess(`Account created for ${form.email}. A welcome email with login credentials has been sent.`);
      loadUsers();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add User Dialog */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                ✓ {success}
              </div>
              <DialogFooter>
                <Button onClick={() => handleOpenChange(false)}>Close</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  placeholder="Jane Doe"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role <span className="text-destructive">*</span></Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as AssignableRole }))}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map(r => (
                      <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Admin role can only be assigned via the database.</p>
              </div>

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}

              <p className="text-xs text-muted-foreground">
                A temporary password will be generated and sent to the user via email. They will be asked to change it on first login.
              </p>

              <DialogFooter>
                <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create & Send Email'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* User list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Users</CardTitle>
            <CardDescription>All users in the system.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm">{u.full_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{u.role}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? 'default' : 'outline'}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Permission matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permission Matrix</CardTitle>
          <CardDescription>
            Role-based permission table. Checkboxes are read-only — update the user role to change permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">Permission</TableHead>
                  {ROLES.map(r => (
                    <TableHead key={r} className="text-center capitalize">{r}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(PERMISSION_MATRIX).map(([perm, roleMap]) => (
                  <TableRow key={perm}>
                    <TableCell className="text-sm">{PERMISSION_LABELS[perm] ?? perm}</TableCell>
                    {ROLES.map(role => (
                      <TableCell key={role} className="text-center">
                        <Checkbox
                          checked={roleMap[role as keyof typeof roleMap] === true}
                          disabled
                          className="mx-auto"
                          aria-label={`${perm} for ${role}`}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
