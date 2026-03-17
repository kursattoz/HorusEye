import { describe, it, expect } from 'vitest';
import { canAccess } from '@/lib/auth/guards';

describe('canAccess', () => {
  it('grants admin access to all permissions', () => {
    expect(canAccess('admin', 'manage_files')).toBe(true);
    expect(canAccess('admin', 'delete_files')).toBe(true);
    expect(canAccess('admin', 'manage_users')).toBe(true);
  });

  it('denies supervisor access to admin-only permissions', () => {
    expect(canAccess('supervisor', 'manage_users')).toBe(false);
    expect(canAccess('supervisor', 'delete_files')).toBe(false);
  });

  it('grants supervisor access to feedback and viewing', () => {
    expect(canAccess('supervisor', 'view_feedback')).toBe(true);
    expect(canAccess('supervisor', 'write_feedback')).toBe(true);
  });

  it('denies assistant access to write_feedback and admin permissions', () => {
    expect(canAccess('assistant', 'manage_users')).toBe(false);
    expect(canAccess('assistant', 'write_feedback')).toBe(false);
  });

  it('denies guest access to any protected permission', () => {
    expect(canAccess('guest', 'view_files')).toBe(false);
    expect(canAccess('guest', 'view_feedback')).toBe(false);
    expect(canAccess('guest', 'manage_users')).toBe(false);
  });
});
