import type { UserRole } from '@/types';

// PRD-010: Permission matrix — display-only, driven by role, not per-user
export const PERMISSION_MATRIX: Record<string, Record<Exclude<UserRole, 'guest'> | 'guest', boolean>> = {
  view_public_docs:  { admin: true,  supervisor: true,  assistant: true,  guest: true  },
  view_dashboard:    { admin: true,  supervisor: true,  assistant: true,  guest: false },
  manage_files:      { admin: true,  supervisor: false, assistant: false, guest: false },
  upload_files:      { admin: true,  supervisor: false, assistant: false, guest: false },
  delete_files:      { admin: true,  supervisor: false, assistant: false, guest: false },
  write_feedback:    { admin: true,  supervisor: true,  assistant: false, guest: false },
  view_feedback:     { admin: true,  supervisor: true,  assistant: true,  guest: false },
  resolve_feedback:  { admin: true,  supervisor: true,  assistant: false, guest: false },
  manage_users:      { admin: true,  supervisor: false, assistant: false, guest: false },
  view_monitor:      { admin: true,  supervisor: false, assistant: false, guest: false },
  view_audit_logs:   { admin: true,  supervisor: false, assistant: false, guest: false },
};

export const PERMISSION_LABELS: Record<string, string> = {
  view_public_docs:  'View public documents',
  view_dashboard:    'View dashboard',
  manage_files:      'Manage files (upload/delete)',
  upload_files:      'Upload files',
  delete_files:      'Delete files',
  write_feedback:    'Write feedback',
  view_feedback:     'View feedback',
  resolve_feedback:  'Resolve feedback',
  manage_users:      'Manage users',
  view_monitor:      'View monitor dashboard',
  view_audit_logs:   'View audit logs',
};
