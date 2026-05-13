// PRD-013 §5 — Student management: list + single create
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

const STUDENT_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401, supabase, userId: '' };
  return { error: null, status: 200, supabase, userId: user.id };
}

// GET /api/students?session_id=&q=&include_inactive=true
export async function GET(request: NextRequest) {
  const { error, status, supabase } = await requireAuth();
  if (error) return NextResponse.json({ error }, { status });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');
  const q = url.searchParams.get('q')?.trim();
  const includeInactive = url.searchParams.get('include_inactive') === 'true';

  if (sessionId) {
    const { data, error: dbError } = await supabase
      .from('session_students')
      .select('seat_number, students!inner(id, student_id, full_name, email, department, is_active, created_at, updated_at)')
      .eq('session_id', sessionId);
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ students: data ?? [] });
  }

  let query = supabase
    .from('students')
    .select('id, student_id, full_name, email, department, is_active, risk_score, risk_level, risk_trend, incident_count, risk_updated_at, created_at, updated_at')
    .is('deleted_at', null)
    .order('student_id', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);
  if (q) query = query.or(`student_id.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%`);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ students: data ?? [] });
}

// POST /api/students — single create
export async function POST(request: NextRequest) {
  const { error, status, supabase, userId } = await requireAuth();
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const student_id = String(body.student_id ?? '').trim();
  const full_name = String(body.full_name ?? '').trim();
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const department = body.department ? String(body.department).trim() : null;

  if (!STUDENT_ID_RE.test(student_id)) {
    return NextResponse.json({ error: 'Invalid student_id (1–32 chars, alphanumeric/_-).' }, { status: 400 });
  }
  if (!full_name) {
    return NextResponse.json({ error: 'full_name is required.' }, { status: 400 });
  }
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email.' }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from('students')
    .insert({ student_id, full_name, email, department })
    .select('id, student_id, full_name, email, department, is_active, risk_score, risk_level, risk_trend, incident_count, risk_updated_at, created_at, updated_at')
    .single();

  if (dbError) {
    if (dbError.code === '23505') {
      return NextResponse.json({ error: 'student_id already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await log({
    event_type: 'system.info',
    severity:   'info',
    user_id:    userId,
    resource_type: 'student',
    resource_id:   data.id,
    action:        `Student created: ${student_id}`,
  });

  return NextResponse.json({ student: data }, { status: 201 });
}
