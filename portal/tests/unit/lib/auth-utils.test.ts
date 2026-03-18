import { describe, it, expect } from 'vitest';
import { canAccess, requireRole } from '@/lib/auth/guards';

describe('canAccess', () => {
  it('grants admin all permissions', () => {
    expect(canAccess('admin', 'manage_files')).toBe(true);
    expect(canAccess('admin', 'delete_files')).toBe(true);
    expect(canAccess('admin', 'manage_users')).toBe(true);
    expect(canAccess('admin', 'view_feedback')).toBe(true);
    expect(canAccess('admin', 'write_feedback')).toBe(true);
    expect(canAccess('admin', 'view_files')).toBe(true);
  });

  it('denies supervisor admin-only permissions', () => {
    expect(canAccess('supervisor', 'manage_users')).toBe(false);
    expect(canAccess('supervisor', 'delete_files')).toBe(false);
  });

  it('grants supervisor feedback and file viewing', () => {
    expect(canAccess('supervisor', 'view_feedback')).toBe(true);
    expect(canAccess('supervisor', 'write_feedback')).toBe(true);
    expect(canAccess('supervisor', 'view_files')).toBe(true);
  });

  it('denies assistant write_feedback and admin permissions', () => {
    expect(canAccess('assistant', 'manage_users')).toBe(false);
    expect(canAccess('assistant', 'write_feedback')).toBe(false);
    expect(canAccess('assistant', 'delete_files')).toBe(false);
  });

  it('denies guest any protected permission', () => {
    expect(canAccess('guest', 'view_files')).toBe(false);
    expect(canAccess('guest', 'view_feedback')).toBe(false);
    expect(canAccess('guest', 'manage_users')).toBe(false);
  });
});

describe('requireRole', () => {
  it('admin satisfies all role requirements', () => {
    expect(requireRole('admin', 'admin')).toBe(true);
    expect(requireRole('admin', 'supervisor')).toBe(true);
    expect(requireRole('admin', 'assistant')).toBe(true);
    expect(requireRole('admin', 'guest')).toBe(true);
  });

  it('supervisor satisfies supervisor and below', () => {
    expect(requireRole('supervisor', 'admin')).toBe(false);
    expect(requireRole('supervisor', 'supervisor')).toBe(true);
    expect(requireRole('supervisor', 'assistant')).toBe(true);
  });

  it('assistant does not satisfy supervisor or admin', () => {
    expect(requireRole('assistant', 'admin')).toBe(false);
    expect(requireRole('assistant', 'supervisor')).toBe(false);
    expect(requireRole('assistant', 'assistant')).toBe(true);
  });

  it('guest satisfies only guest', () => {
    expect(requireRole('guest', 'guest')).toBe(true);
    expect(requireRole('guest', 'assistant')).toBe(false);
  });
});
