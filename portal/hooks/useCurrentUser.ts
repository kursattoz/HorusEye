'use client';

import { useState, useEffect } from 'react';
import type { UserRole } from '@/types';

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  team_id: string | null;
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then((data: { user: CurrentUser } | null) => {
        setUser(data?.user ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { user, loading };
}
