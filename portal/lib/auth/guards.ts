import type { UserRole } from '@/types';
import { PERMISSION_MATRIX } from '@/constants/permissions';

type Permission = keyof typeof PERMISSION_MATRIX;

export function canAccess(role: UserRole, permission: Permission): boolean {
  return PERMISSION_MATRIX[permission]?.[role] ?? false;
}

export function requireRole(userRole: UserRole, requiredRole: UserRole): boolean {
  const hierarchy: UserRole[] = ['guest', 'assistant', 'supervisor', 'admin'];
  return hierarchy.indexOf(userRole) >= hierarchy.indexOf(requiredRole);
}
