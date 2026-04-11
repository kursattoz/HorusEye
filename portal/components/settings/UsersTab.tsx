'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge }     from '@/components/ui/badge';
import { Button }    from '@/components/ui/button';
import { Checkbox }  from '@/components/ui/checkbox';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PERMISSION_MATRIX, PERMISSION_LABELS } from '@/constants/permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

const ROLES = ['admin', 'supervisor', 'assistant', 'guest'] as const;
const ASSIGNABLE_ROLES = ['supervisor', 'assistant', 'guest'] as const;
type AssignableRole = typeof ASSIGNABLE_ROLES[number];

interface UserRow {
  id:        string;
  email:     string;
  full_name: string | null;
  role:      string;
  is_active: boolean;
}

interface AddUserForm {
  full_name: string;
  email:     string;
  role:      AssignableRole;
}

type ConfirmAction =
  | { type: 'toggle_active'; user: UserRow }
  | { type: 'delete';        user: UserRow }
  | { type: 'reset';         user: UserRow };

export function UsersTab() {
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const filteredUsers = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      (u.full_name?.toLowerCase().includes(q)) ||
      u.email.toLowerCase().includes(q)
    );
  }, [users, debouncedSearch]);

  // Add User dialog
  const [addOpen,    setAddOpen]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [form, setForm] = useState<AddUserForm>({ full_name: '', email: '', role: 'supervisor' });

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [acting, setActing] = useState(false);

  // Role change dialog
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [newRole, setNewRole]       = useState<AssignableRole>('supervisor');
  const [changingRole, setChangingRole] = useState(false);

  const loadUsers = () => {
    setLoading(true);
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setUsers(data.users ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const handleAddOpenChange = (v: boolean) => {
    setAddOpen(v);
    if (!v) { setForm({ full_name: '', email: '', role: 'supervisor' }); setFormError(''); setAddSuccess(''); }
  };

  const handleAddSubmit = async () => {
    setFormError('');
    if (!form.email) { setFormError('Email is required.'); return; }
    setSubmitting(true);
    try {
      const res  = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? 'Failed to create user.'); return; }
      setAddSuccess(`Account created for ${form.email}. A welcome email with login credentials has been sent.`);
      loadUsers();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Row actions ──

  async function handleConfirm() {
    if (!confirmAction) return;
    setActing(true);
    try {
      const { type, user } = confirmAction;

      if (type === 'toggle_active') {
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !user.is_active }),
        });
        if (res.ok) {
          setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !user.is_active } : u));
          toast.success(user.is_active ? 'User deactivated.' : 'User activated.');
        } else {
          toast.error('Operation failed.');
        }
      }

      if (type === 'delete') {
        const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
        if (res.ok) {
          setUsers(prev => prev.filter(u => u.id !== user.id));
          toast.success('User removed.');
        } else {
          toast.error('Delete failed.');
        }
      }

      if (type === 'reset') {
        const res = await fetch(`/api/users/${user.id}/reset`, { method: 'POST' });
        if (res.ok) {
          toast.success(`Password reset email sent to ${user.email}.`);
        } else {
          toast.error('Failed to send reset email.');
        }
      }
    } finally {
      setActing(false);
      setConfirmAction(null);
    }
  }

  async function handleRoleChange() {
    if (!roleTarget) return;
    setChangingRole(true);
    try {
      const res = await fetch(`/api/users/${roleTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === roleTarget.id ? { ...u, role: newRole } : u));
        toast.success(`Role updated to ${newRole}.`);
        setRoleTarget(null);
      } else {
        toast.error('Role update failed.');
      }
    } finally {
      setChangingRole(false);
    }
  }

  // ── Confirm dialog copy ──
  const confirmCopy = confirmAction
    ? confirmAction.type === 'toggle_active'
      ? {
          title: confirmAction.user.is_active ? 'Deactivate User' : 'Activate User',
          description: confirmAction.user.is_active
            ? `${confirmAction.user.full_name ?? confirmAction.user.email} will no longer be able to log in.`
            : `${confirmAction.user.full_name ?? confirmAction.user.email} will regain access to the system.`,
          cta: confirmAction.user.is_active ? 'Deactivate' : 'Activate',
          destructive: confirmAction.user.is_active,
        }
      : confirmAction.type === 'delete'
      ? {
          title: 'Remove User',
          description: `This will soft-delete ${confirmAction.user.full_name ?? confirmAction.user.email}. They will be unable to log in. This action can be reversed in the database.`,
          cta: 'Remove',
          destructive: true,
        }
      : {
          title: 'Send Password Reset',
          description: `A password reset email will be sent to ${confirmAction.user.email}.`,
          cta: 'Send Email',
          destructive: false,
        }
    : null;

  return (
    <div className="space-y-6">

      {/* ── Add User Dialog ── */}
      <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          {addSuccess ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                ✓ {addSuccess}
              </div>
              <DialogFooter>
                <Button onClick={() => handleAddOpenChange(false)}>Close</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input id="full_name" placeholder="Jane Doe" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                <Input id="email" type="email" placeholder="user@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role <span className="text-destructive">*</span></Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as AssignableRole }))}>
                  <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Admin role can only be assigned via the database.</p>
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <p className="text-xs text-muted-foreground">A temporary password will be generated and sent to the user via email.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleAddOpenChange(false)} disabled={submitting}>Cancel</Button>
                <Button onClick={handleAddSubmit} disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create & Send Email'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirm Dialog (activate/deactivate, delete, reset) ── */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmCopy?.title}</DialogTitle>
            <DialogDescription>{confirmCopy?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={acting}>Cancel</Button>
            <Button
              variant={confirmCopy?.destructive ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={acting}
            >
              {acting ? 'Please wait...' : confirmCopy?.cta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Role Change Dialog ── */}
      <Dialog open={!!roleTarget} onOpenChange={() => setRoleTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Change role for <strong>{roleTarget?.full_name ?? roleTarget?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>New Role</Label>
            <Select value={newRole} onValueChange={v => setNewRole(v as AssignableRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Admin role can only be assigned via the database.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)} disabled={changingRole}>Cancel</Button>
            <Button onClick={handleRoleChange} disabled={changingRole || newRole === roleTarget?.role}>
              {changingRole ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── User list ── */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Users</CardTitle>
              <CardDescription>All users in the system.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
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
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {debouncedSearch ? 'No users match your search.' : 'No users found.'}
                    </TableCell>
                  </TableRow>
                )}
                {filteredUsers.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm font-medium">{u.full_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? 'default' : 'outline'}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setNewRole((u.role as AssignableRole) in ASSIGNABLE_ROLES ? u.role as AssignableRole : 'supervisor');
                              setRoleTarget(u);
                            }}
                          >
                            Change Role
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setConfirmAction({ type: 'toggle_active', user: u })}>
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setConfirmAction({ type: 'reset', user: u })}>
                            Send Password Reset
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setConfirmAction({ type: 'delete', user: u })}
                          >
                            Remove User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* ── Permission Matrix ── */}
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
