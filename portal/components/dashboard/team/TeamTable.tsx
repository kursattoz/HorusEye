'use client';

import { useState } from 'react';
import { Badge }    from '@/components/ui/badge';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label }  from '@/components/ui/label';
import { MoreHorizontal, UserPlus, Search } from 'lucide-react';
import { toast }  from 'sonner';

interface UserRow {
  id:        string;
  email:     string;
  full_name: string | null;
  role:      string;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
}

interface TeamTableProps {
  users: UserRow[];
}

const ROLE_COLORS: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin:      'default',
  supervisor: 'secondary',
  assistant:  'outline',
};

function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return email[0]?.toUpperCase() ?? 'U';
}

export function TeamTable({ users: initial }: TeamTableProps) {
  const [users, setUsers]       = useState<UserRow[]>(initial);
  const [search, setSearch]     = useState('');
  const [addOpen, setAddOpen]   = useState(false);

  // Add user form state
  const [newName,  setNewName]  = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole,  setNewRole]  = useState('supervisor');
  const [adding,   setAdding]   = useState(false);

  const filtered = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    });
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: !current } : u));
      toast.success(!current ? 'User activated.' : 'User deactivated.');
    } else {
      toast.error('Operation failed.');
    }
  }

  async function sendReset(id: string) {
    const res = await fetch(`/api/users/${id}/reset`, { method: 'POST' });
    if (res.ok) toast.success('Password reset email sent.');
    else toast.error('Failed to send email.');
  }

  async function handleAddUser() {
    setAdding(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: newName, email: newEmail, role: newRole }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(prev => [...prev, data.user]);
      toast.success(`User ${newEmail} created.`);
      setAddOpen(false); setNewName(''); setNewEmail(''); setNewRole('supervisor');
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Failed to create user.');
    }
    setAdding(false);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus size={14} className="mr-2" /> Add User
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(u => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={u.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{getInitials(u.full_name, u.email)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{u.full_name ?? '—'}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={ROLE_COLORS[u.role] ?? 'outline'} className="capitalize">
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.is_active ? 'default' : 'secondary'}>
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
                      <DropdownMenuItem onClick={() => toggleActive(u.id, u.is_active)}>
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => sendReset(u.id)}>
                        Reset Password
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add user dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              A welcome email will be sent to the user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="User's full name" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="assistant">Assistant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={!newEmail || adding}>
              {adding ? 'Sending...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
