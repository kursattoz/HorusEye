// PRD-013 §6.2 — Exam CRUD: list + create
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

const STATUS_VALUES = ['draft', 'scheduled', 'active', 'completed', 'cancelled'] as const;
type ExamStatus = typeof STATUS_VALUES[number];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let q = auth.supabase
    .from('exams')
    .select('id, name, course_code, description, scheduled_date, scheduled_start, scheduled_end, duration_minutes, status, created_at, updated_at')
    .order('scheduled_date', { ascending: false })
    .order('scheduled_start', { ascending: true });

  if (status && (STATUS_VALUES as readonly string[]).includes(status)) {
    q = q.eq('status', status);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exams: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const name = String(body.name ?? '').trim();
  const scheduled_date  = String(body.scheduled_date  ?? '').trim();
  const scheduled_start = String(body.scheduled_start ?? '').trim();
  const scheduled_end   = String(body.scheduled_end   ?? '').trim();
  const duration_minutes = Number(body.duration_minutes ?? 120);

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!DATE_RE.test(scheduled_date))  return NextResponse.json({ error: 'scheduled_date must be YYYY-MM-DD' }, { status: 400 });
  if (!TIME_RE.test(scheduled_start)) return NextResponse.json({ error: 'scheduled_start must be HH:MM' }, { status: 400 });
  if (!TIME_RE.test(scheduled_end))   return NextResponse.json({ error: 'scheduled_end must be HH:MM' }, { status: 400 });
  if (!Number.isFinite(duration_minutes) || duration_minutes <= 0 || duration_minutes > 600) {
    return NextResponse.json({ error: 'duration_minutes must be 1-600' }, { status: 400 });
  }

  const status: ExamStatus = (STATUS_VALUES as readonly string[]).includes(body.status) ? body.status : 'draft';

  const { data, error } = await auth.supabase
    .from('exams')
    .insert({
      name,
      course_code: body.course_code ?? null,
      description: body.description ?? null,
      scheduled_date,
      scheduled_start,
      scheduled_end,
      duration_minutes,
      status,
      settings: body.settings ?? {},
      created_by: auth.userId,
    })
    .select('id, name, course_code, description, scheduled_date, scheduled_start, scheduled_end, duration_minutes, status, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam',
    resource_id:   data.id,
    action:        `Exam created: ${data.name} (${data.scheduled_date})`,
  });

  return NextResponse.json({ exam: data }, { status: 201 });
}
