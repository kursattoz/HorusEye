import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Always read fresh sprint/backlog state — no static cache or CDN fronting.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // All sprints
  const { data: sprints } = await supabase
    .from('sprints')
    .select('*')
    .order('start_date', { ascending: true });

  // All items with assignee/reviewer
  const { data: items } = await supabase
    .from('backlog_items')
    .select('id, title, sprint_id, status, priority, dev_role, assigned_to, reviewer_id, estimated_hours, actual_hours, started_at, completed_at, created_at, epic, prd_id, assignee:user_profiles!assigned_to(full_name, avatar_url)')
    .order('created_at');

  // All activity
  const { data: activities } = await supabase
    .from('backlog_activity')
    .select('*, user:user_profiles!user_id(full_name)')
    .order('created_at', { ascending: true });

  const allSprints = sprints ?? [];
  const allItems = items ?? [];
  const allActivities = activities ?? [];

  // ── Project-level summary ────────────────────────────────
  const totalItems = allItems.length;
  const doneItems = allItems.filter(i => i.status === 'done').length;
  const totalEstimated = allItems.reduce((s, i) => s + (i.estimated_hours ?? 0), 0);
  const totalActual = allItems.reduce((s, i) => s + (i.actual_hours ?? 0), 0);

  // ── Completion projection ────────────────────────────────
  const firstCreated = allItems.length > 0 ? new Date(allItems[0]!.created_at) : new Date();
  const now = new Date();
  const daysSinceStart = Math.max(1, Math.ceil((now.getTime() - firstCreated.getTime()) / (1000 * 60 * 60 * 24)));
  const velocity = doneItems / daysSinceStart; // items/day
  const remainingItems = totalItems - doneItems;
  const estimatedDaysLeft = velocity > 0 ? Math.ceil(remainingItems / velocity) : null;
  const projectedEndDate = estimatedDaysLeft ? new Date(now.getTime() + estimatedDaysLeft * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null;

  // Deadline from last sprint
  const lastSprint = allSprints[allSprints.length - 1];
  const deadline = lastSprint?.end_date ?? null;

  // ── Per-sprint stats ─────────────────────────────────────
  const sprintStats = allSprints.map(s => {
    const sItems = allItems.filter(i => i.sprint_id === s.id);
    const sDone = sItems.filter(i => i.status === 'done').length;
    const sEst = sItems.reduce((sum, i) => sum + (i.estimated_hours ?? 0), 0);
    const sAct = sItems.reduce((sum, i) => sum + (i.actual_hours ?? 0), 0);
    return {
      id: s.id,
      name: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
      status: s.status,
      total: sItems.length,
      done: sDone,
      estimated_hours: sEst,
      actual_hours: sAct,
      progress: sItems.length > 0 ? Math.round((sDone / sItems.length) * 100) : 0,
    };
  });

  // ── Per-member across all sprints ────────────────────────
  const memberMap = new Map<string, {
    name: string;
    avatar_url: string | null;
    sprints: Map<string, { total: number; done: number; estimated: number; actual: number }>;
    total: number;
    done: number;
    in_progress: number;
    review_assigned: number;
    estimated_hours: number;
    actual_hours: number;
    completed_dates: string[];
  }>();

  for (const item of allItems) {
    if (!item.assigned_to) continue;
    if (!memberMap.has(item.assigned_to)) {
      const a = (item.assignee as unknown) as { full_name: string; avatar_url: string | null } | null;
      memberMap.set(item.assigned_to, {
        name: a?.full_name ?? 'Unknown',
        avatar_url: a?.avatar_url ?? null,
        sprints: new Map(),
        total: 0, done: 0, in_progress: 0, review_assigned: 0,
        estimated_hours: 0, actual_hours: 0,
        completed_dates: [],
      });
    }
    const m = memberMap.get(item.assigned_to)!;
    m.total++;
    if (item.status === 'done') {
      m.done++;
      if (item.completed_at) m.completed_dates.push(item.completed_at);
    }
    if (item.status === 'in_progress') m.in_progress++;
    m.estimated_hours += item.estimated_hours ?? 0;
    m.actual_hours += item.actual_hours ?? 0;

    // Per-sprint breakdown
    const sid = item.sprint_id ?? 'backlog';
    if (!m.sprints.has(sid)) m.sprints.set(sid, { total: 0, done: 0, estimated: 0, actual: 0 });
    const ss = m.sprints.get(sid)!;
    ss.total++;
    if (item.status === 'done') ss.done++;
    ss.estimated += item.estimated_hours ?? 0;
    ss.actual += item.actual_hours ?? 0;
  }

  // Count reviews assigned to each person
  for (const item of allItems) {
    if (item.reviewer_id && memberMap.has(item.reviewer_id)) {
      memberMap.get(item.reviewer_id)!.review_assigned++;
    }
  }

  const members = Array.from(memberMap.entries()).map(([id, stats]) => ({
    id,
    name: stats.name,
    avatar_url: stats.avatar_url,
    total: stats.total,
    done: stats.done,
    in_progress: stats.in_progress,
    review_assigned: stats.review_assigned,
    estimated_hours: stats.estimated_hours,
    actual_hours: stats.actual_hours,
    completion_rate: stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0,
    sprint_breakdown: Array.from(stats.sprints.entries()).map(([sprintId, ss]) => {
      const sprint = allSprints.find(s => s.id === sprintId);
      return { sprint_id: sprintId, sprint_name: sprint?.name ?? 'Backlog', ...ss };
    }),
    // Activity heatmap — items completed per day
    daily_completions: stats.completed_dates.reduce((acc, d) => {
      const day = new Date(d).toISOString().split('T')[0]!;
      acc[day] = (acc[day] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  }));

  // ── Calendar events ──────────────────────────────────────
  const calendarEvents: { date: string; type: string; title: string; color: string }[] = [];

  for (const s of allSprints) {
    calendarEvents.push({ date: s.start_date, type: 'sprint_start', title: `${s.name} starts`, color: '#3b82f6' });
    calendarEvents.push({ date: s.end_date, type: 'sprint_end', title: `${s.name} ends`, color: '#ef4444' });
  }

  // Deadlines from report_deliverables
  const { data: deliverables } = await supabase
    .from('report_deliverables')
    .select('title, deliverable_number, deadline, status')
    .order('deadline');

  for (const d of deliverables ?? []) {
    calendarEvents.push({
      date: d.deadline,
      type: d.status === 'completed' ? 'deliverable_done' : 'deliverable_due',
      title: `${d.deliverable_number}: ${d.title}`,
      color: d.status === 'completed' ? '#22c55e' : '#f59e0b',
    });
  }

  // ── PRD coverage ─────────────────────────────────────────
  const prdMap = new Map<string, { total: number; done: number }>();
  for (const item of allItems) {
    if (!item.prd_id) continue;
    if (!prdMap.has(item.prd_id)) prdMap.set(item.prd_id, { total: 0, done: 0 });
    const p = prdMap.get(item.prd_id)!;
    p.total++;
    if (item.status === 'done') p.done++;
  }
  const prdCoverage = Array.from(prdMap.entries())
    .map(([prd_id, stats]) => ({ prd_id, ...stats, progress: Math.round((stats.done / stats.total) * 100) }))
    .sort((a, b) => a.prd_id.localeCompare(b.prd_id));

  return NextResponse.json({
    summary: {
      total_items: totalItems,
      done_items: doneItems,
      total_estimated_hours: totalEstimated,
      total_actual_hours: totalActual,
      velocity_items_per_day: Math.round(velocity * 100) / 100,
      estimated_days_left: estimatedDaysLeft,
      projected_end_date: projectedEndDate,
      deadline,
    },
    sprint_stats: sprintStats,
    members,
    prd_coverage: prdCoverage,
    calendar_events: calendarEvents,
    recent_activity: allActivities.slice(-50).reverse(),
  });
}
