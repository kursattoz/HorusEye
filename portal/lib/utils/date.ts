import { format, formatDistanceToNow } from 'date-fns';
import { enUS } from 'date-fns/locale';

/** Jan 15, 2025 */
export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy', { locale: enUS });
}

/** Jan 15, 2025 14:32 */
export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm', { locale: enUS });
}

/** "3 minutes ago" / "in 2 days" */
export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: enUS });
}

/** 2025-01-15 14:32:07 — used in log tables and monitor screen */
export function formatLogDate(date: string | Date): string {
  return format(new Date(date), 'yyyy-MM-dd HH:mm:ss', { locale: enUS });
}
