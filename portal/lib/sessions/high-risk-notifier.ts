// BL-229 — Pre-session high-risk notifier. Shared between
// POST /api/exam-sessions/[id]/high-risk-notify (manual) and the
// PUT /api/exam-sessions/[id] handler (auto on status → 'active').
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications';
import { routes } from '@/constants/routes';
import { log } from '@/lib/logger';

export interface HighRiskNotifyResult {
  high_risk_count: number;
  notified: number;
  notified_user_ids: string[];
  students: Array<{
    id: string;
    student_id: string;
    full_name: string;
    risk_score: number;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    risk_trend: 'rising' | 'stable' | 'falling';
    incident_count: number;
  }>;
}

export async function notifyHighRiskForSession(
  sessionId: string,
  actorUserId: string,
): Promise<HighRiskNotifyResult> {
  const supabase = await createClient();

  // Refresh cached risk so the notification reflects the latest 90d window.
  await supabase.rpc('refresh_session_students_risk', { p_session_id: sessionId });

  const { data: assigned } = await supabase
    .from('session_students')
    .select('students:student_id (id, student_id, full_name, risk_score, risk_level, risk_trend, incident_count)')
    .eq('session_id', sessionId);

  interface Row { students: HighRiskNotifyResult['students'][number] | null }
  const rows = (assigned ?? []) as unknown as Row[];

  const highRisk = rows
    .map((r) => r.students)
    .filter((s): s is HighRiskNotifyResult['students'][number] =>
      Boolean(s) && (s!.risk_level === 'high' || s!.risk_level === 'critical')
    )
    .sort((a, b) => b.risk_score - a.risk_score);

  if (highRisk.length === 0) {
    return { high_risk_count: 0, notified: 0, notified_user_ids: [], students: [] };
  }

  const { data: proctorsData } = await supabase
    .from('session_proctors')
    .select('user_id, role')
    .eq('session_id', sessionId);

  const proctors = (proctorsData ?? []) as Array<{ user_id: string; role: string }>;
  const chiefIds  = proctors.filter((p) => p.role === 'chief_proctor').map((p) => p.user_id);
  const targetIds: string[] = chiefIds.length > 0 ? chiefIds : proctors.map((p) => p.user_id);

  if (targetIds.length === 0) {
    return { high_risk_count: highRisk.length, notified: 0, notified_user_ids: [], students: highRisk };
  }

  const top = highRisk.slice(0, 3).map((s) => s.full_name).join(', ');
  const title = `${highRisk.length} high-risk student${highRisk.length === 1 ? '' : 's'} in upcoming session`;
  const description = `Watch for: ${top}${highRisk.length > 3 ? ` (+${highRisk.length - 3} more)` : ''}.`;
  const link = routes.examLive(sessionId);

  await Promise.all(
    targetIds.map((uid) =>
      createNotification({
        user_id: uid,
        category: 'system',
        title,
        description,
        link,
        metadata: {
          session_id: sessionId,
          high_risk_students: highRisk.map((s) => ({
            student_uuid: s.id,
            student_id:   s.student_id,
            full_name:    s.full_name,
            risk_score:   s.risk_score,
            risk_level:   s.risk_level,
            risk_trend:   s.risk_trend,
          })),
        },
      })
    )
  );

  await log({
    event_type: 'system.info',
    severity: 'info',
    user_id: actorUserId,
    session_id: sessionId,
    resource_type: 'exam_session',
    resource_id: sessionId,
    action: `High-risk notification sent: ${highRisk.length} student(s), ${targetIds.length} proctor(s)`,
    metadata: {
      high_risk_count: highRisk.length,
      notified_user_ids: targetIds,
      chief_fallback_to_all: chiefIds.length === 0,
    },
  });

  return {
    high_risk_count: highRisk.length,
    notified: targetIds.length,
    notified_user_ids: targetIds,
    students: highRisk,
  };
}
