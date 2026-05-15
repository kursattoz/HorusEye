'use client';

// BL-224 — Profile shell: header + risk card + sessions list.
// Mounts BL-227 timeline + BL-231 charts as tabs.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarRange, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RiskScoreCard, type StudentRisk } from '@/components/students/RiskScoreCard';
import { IncidentsTimeline } from '@/components/students/IncidentsTimeline';
import { IncidentCharts } from '@/components/students/IncidentCharts';
import { routes } from '@/constants/routes';

interface StudentSummary {
  id: string;
  student_id: string;
  full_name: string;
  email: string | null;
  department: string | null;
  is_active: boolean;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_trend: 'rising' | 'stable' | 'falling';
  incident_count: number;
  risk_updated_at: string | null;
  face_embedding_updated_at: string | null;
  face_consent_at: string | null;
}

interface PastSession {
  session_id: string;
  seat_number: string | null;
  enrolled_at: string;
  session: {
    id: string;
    status: string;
    started_at: string | null;
    ended_at: string | null;
    exam: { id: string; name: string; scheduled_date: string | null } | null;
    room: { id: string; name: string } | null;
  } | null;
  incident_count: number;
}

interface ProfileResponse {
  student: StudentSummary;
  risk: StudentRisk;
  past_sessions: PastSession[];
}

export function StudentProfile({ studentUuid }: { studentUuid: string }) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/students/${studentUuid}/profile`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        if (!cancelled) setProfile(body as ProfileResponse);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [studentUuid]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">Could not load profile: {error}</p>
        <Link href={routes.students} className="text-sm underline">Back to students</Link>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const { student, risk, past_sessions } = profile;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link href={routes.students} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> Students
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{student.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{student.student_id}</span>
            {student.department ? <> · {student.department}</> : null}
            {student.email ? <> · {student.email}</> : null}
            {!student.is_active && (
              <Badge variant="outline" className="ml-2">Inactive</Badge>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <RiskScoreCard risk={risk} updatedAt={student.risk_updated_at} className="md:col-span-2" />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Face enrolled" value={student.face_embedding_updated_at ? new Date(student.face_embedding_updated_at).toLocaleDateString() : '—'} />
            <Row label="KVKK consent"  value={student.face_consent_at ? new Date(student.face_consent_at).toLocaleDateString() : '—'} />
            <Row label="Sessions" value={past_sessions.length.toString()} />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Incidents timeline</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger value="sessions">Sessions ({past_sessions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline" className="mt-4">
          <IncidentsTimeline studentUuid={studentUuid} />
        </TabsContent>
        <TabsContent value="charts" className="mt-4">
          <IncidentCharts studentUuid={studentUuid} />
        </TabsContent>
        <TabsContent value="sessions" className="mt-4">
          <SessionsList sessions={past_sessions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

function SessionsList({ sessions }: { sessions: PastSession[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No session history yet.</p>;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {sessions.map((s) => (
            <li key={s.session_id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {s.session?.exam?.name ?? 'Unknown exam'}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarRange size={12} />
                  {s.session?.started_at
                    ? new Date(s.session.started_at).toLocaleString()
                    : new Date(s.enrolled_at).toLocaleDateString()}
                  {s.session?.room ? ` · ${s.session.room.name}` : null}
                  {s.seat_number ? ` · Seat ${s.seat_number}` : null}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {s.incident_count > 0 ? (
                  <Badge variant="destructive">{s.incident_count} incidents</Badge>
                ) : (
                  <Badge variant="outline">Clean</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
