import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { ids, all } = body as { ids?: string[]; all?: boolean };

  if (!all && (!ids || !Array.isArray(ids) || ids.length === 0)) {
    return NextResponse.json(
      { error: 'Provide { ids: string[] } or { all: true }.' },
      { status: 400 },
    );
  }

  let query = supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id);

  if (!all && ids) {
    query = query.in('id', ids);
  }

  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
