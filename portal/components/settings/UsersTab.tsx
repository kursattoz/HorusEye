'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge }   from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PERMISSION_MATRIX, PERMISSION_LABELS } from '@/constants/permissions';
import { Skeleton } from '@/components/ui/skeleton';

const ROLES = ['admin', 'supervisor', 'assistant', 'guest'] as const;

interface UserRow {
  id:        string;
  email:     string;
  full_name: string | null;
  role:      string;
  is_active: boolean;
}

export function UsersTab() {
  const [users, setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setUsers(data.users ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* User list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
          <CardDescription>All users in the system. Use the Team page for detailed management.</CardDescription>
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
