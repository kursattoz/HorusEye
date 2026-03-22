import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('report_deliverables')
    .select('*, checklist_items(id, is_checked), assignee:user_profiles!assigned_to(full_name, avatar_url)')
    .order('deadline', { ascending: true })
    .order('deliverable_number', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const deliverables = (data ?? []).map(d => {
    const items = d.checklist_items ?? [];
    const total = items.length;
    const checked = items.filter((i: { is_checked: boolean }) => i.is_checked).length;
    const { checklist_items: _, assignee, ...rest } = d;
    return {
      ...rest,
      checklist_total: total,
      checklist_checked: checked,
      assignee_name: (assignee as { full_name: string; avatar_url: string | null } | null)?.full_name ?? null,
      assignee_avatar: (assignee as { full_name: string; avatar_url: string | null } | null)?.avatar_url ?? null,
    };
  });

  return NextResponse.json({ deliverables });
}
