import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Sprint info
  const { data: sprint } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', id)
    .single();

  if (!sprint) return NextResponse.json({ error: 'Sprint not found' }, { status: 404 });

  // All items in this sprint
  const { data: items } = await supabase
    .from('backlog_items')
    .select('id, title, status, priority, assigned_to, reviewer_id, estimated_hours, actual_hours, started_at, completed_at, epic, assignee:user_profiles!assigned_to(full_name, avatar_url)')
    .eq('sprint_id', id);

  // All activity for items in this sprint
  const itemIds = (items ?? []).map(i => i.id);
  const { data: activities } = itemIds.length > 0
    ? await supabase
        .from('backlog_activity')
        .select('*, user:user_profiles!user_id(full_name)')
        .in('backlog_item_id', itemIds)
        .order('created_at', { ascending: true })
    : { data: [] };

  const allItems = items ?? [];
  const allActivities = activities ?? [];

  // ── Per-member stats ──────────────────────────────────────
  const memberMap = new Map<string, {
    name: string;
    avatar_url: string | null;
    total: number;
    done: number;
    in_progress: number;
    estimated_hours: number;
    actual_hours: number;
    items_completed_dates: string[];
  }>();

  for (const item of allItems) {
    if (!item.assigned_to) continue;
    if (!memberMap.has(item.assigned_to)) {
      const assignee = (item.assignee as unknown) as { full_name: string; avatar_url: string | null } | null;
      memberMap.set(item.assigned_to, {
        name: assignee?.full_name ?? 'Unknown',
        avatar_url: assignee?.avatar_url ?? null,
        total: 0,
        done: 0,
        in_progress: 0,
        estimated_hours: 0,
        actual_hours: 0,
        items_completed_dates: [],
      });
    }
    const m = memberMap.get(item.assigned_to)!;
    m.total++;
    if (item.status === 'done') {
      m.done++;
      if (item.completed_at) m.items_completed_dates.push(item.completed_at);
    }
    if (item.status === 'in_progress') m.in_progress++;
    m.estimated_hours += item.estimated_hours ?? 0;
    m.actual_hours += item.actual_hours ?? 0;
  }

  const members = Array.from(memberMap.entries()).map(([id, stats]) => ({
    id,
    ...stats,
    completion_rate: stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0,
    avg_cycle_hours: stats.done > 0 ? Math.round(stats.actual_hours / stats.done * 10) / 10 : null,
  }));

  // ── Burndown data (daily) ─────────────────────────────────
  const startDate = new Date(sprint.start_date);
  const endDate = new Date(sprint.end_date);
  const totalItems = allItems.length;

  const burndown: { date: string; remaining: number; ideal: number }[] = [];
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  // Get completion dates
  const completionDates = allItems
    .filter(i => i.status === 'done' && i.completed_at)
    .map(i => new Date(i.completed_at!).toISOString().split('T')[0]);

  for (let d = 0; d <= totalDays; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];

    const completedByDate = completionDates.filter(cd => cd && dateStr && cd <= dateStr).length;
    burndown.push({
      date: dateStr!,
      remaining: totalItems - completedByDate,
      ideal: Math.round(totalItems * (1 - d / totalDays)),
    });
  }

  // ── Epic breakdown ────────────────────────────────────────
  const epicMap = new Map<string, { total: number; done: number; hours: number }>();
  for (const item of allItems) {
    const epic = item.epic ?? 'Uncategorized';
    if (!epicMap.has(epic)) epicMap.set(epic, { total: 0, done: 0, hours: 0 });
    const e = epicMap.get(epic)!;
    e.total++;
    if (item.status === 'done') e.done++;
    e.hours += item.estimated_hours ?? 0;
  }
  const epics = Array.from(epicMap.entries()).map(([name, stats]) => ({ name, ...stats }));

  // ── Status distribution ───────────────────────────────────
  const statusCounts = { backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0 };
  for (const item of allItems) {
    statusCounts[item.status as keyof typeof statusCounts]++;
  }

  // ── Priority distribution ──────────────────────────────────
  const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of allItems) {
    priorityCounts[item.priority as keyof typeof priorityCounts]++;
  }

  // ── Velocity (estimated vs actual) ────────────────────────
  const totalEstimated = allItems.reduce((sum, i) => sum + (i.estimated_hours ?? 0), 0);
  const totalActual = allItems.reduce((sum, i) => sum + (i.actual_hours ?? 0), 0);
  const completedEstimated = allItems
    .filter(i => i.status === 'done')
    .reduce((sum, i) => sum + (i.estimated_hours ?? 0), 0);

  // ── Recent activity feed ──────────────────────────────────
  const recentActivity = allActivities.slice(-30).reverse();

  // ── Review stats per reviewer ─────────────────────────────
  const { data: reviews } = itemIds.length > 0
    ? await supabase
        .from('backlog_reviews')
        .select('*, reviewer:user_profiles!reviewer_id(full_name, avatar_url)')
        .in('backlog_item_id', itemIds)
    : { data: [] };

  const reviewerMap = new Map<string, {
    name: string;
    avatar_url: string | null;
    total_reviews: number;
    approved: number;
    changes_requested: number;
    avg_comment_length: number;
    with_screenshot: number;
  }>();

  for (const r of reviews ?? []) {
    if (!reviewerMap.has(r.reviewer_id)) {
      const rev = (r.reviewer as unknown) as { full_name: string; avatar_url: string | null } | null;
      reviewerMap.set(r.reviewer_id, {
        name: rev?.full_name ?? 'Unknown',
        avatar_url: rev?.avatar_url ?? null,
        total_reviews: 0, approved: 0, changes_requested: 0,
        avg_comment_length: 0, with_screenshot: 0,
      });
    }
    const rm = reviewerMap.get(r.reviewer_id)!;
    rm.total_reviews++;
    if (r.status === 'approved') rm.approved++;
    if (r.status === 'changes_requested') rm.changes_requested++;
    if (r.has_screenshot) rm.with_screenshot++;
    rm.avg_comment_length += (r.comment?.length ?? 0);
  }

  const reviewStats = Array.from(reviewerMap.entries()).map(([id, stats]) => ({
    id,
    ...stats,
    avg_comment_length: stats.total_reviews > 0 ? Math.round(stats.avg_comment_length / stats.total_reviews) : 0,
    quality_score: stats.total_reviews > 0 ? Math.round(
      ((stats.avg_comment_length / stats.total_reviews > 20 ? 30 : 10) +
       (stats.with_screenshot > 0 ? 30 : 0) +
       (stats.changes_requested > 0 ? 20 : 0) +
       Math.min(20, stats.total_reviews * 5))
    ) : 0,
  }));

  // Pending reviews count per reviewer
  const pendingReviews = new Map<string, number>();
  for (const item of allItems) {
    if (item.status === 'review' && item.reviewer_id) {
      const rid = item.reviewer_id as string;
      pendingReviews.set(rid, (pendingReviews.get(rid) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    sprint,
    summary: {
      total_items: totalItems,
      done_items: statusCounts.done,
      total_estimated_hours: totalEstimated,
      total_actual_hours: totalActual,
      completed_estimated_hours: completedEstimated,
      status_counts: statusCounts,
      priority_counts: priorityCounts,
    },
    burndown,
    members,
    epics,
    review_stats: reviewStats,
    pending_reviews: Object.fromEntries(pendingReviews),
    recent_activity: recentActivity,
  });
}
