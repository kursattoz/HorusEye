import { createClient } from '@/lib/supabase/server';
import type { NotificationCategory } from '@/types';

interface CreateNotificationPayload {
  user_id: string;
  category: NotificationCategory;
  title: string;
  description?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget: creates a notification for a user. Never throws. */
export async function createNotification(payload: CreateNotificationPayload): Promise<void> {
  try {
    const supabase = await createClient({ serviceRole: true });
    await supabase.from('notifications').insert(payload);
  } catch {
    // Fire-and-forget — log silently in dev
    if (process.env.NEXT_PUBLIC_ENV === 'local') {
      console.error('[Notification] Failed to create notification:', payload);
    }
  }
}

/** Send notification to all admins */
export async function notifyAdmins(
  category: NotificationCategory,
  title: string,
  description?: string,
  link?: string,
): Promise<void> {
  try {
    const supabase = await createClient({ serviceRole: true });
    const { data: admins } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true);
    if (admins) {
      await Promise.all(
        admins.map(admin =>
          createNotification({ user_id: admin.id, category, title, description, link })
        )
      );
    }
  } catch {}
}
