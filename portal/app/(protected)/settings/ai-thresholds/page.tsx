// BL-209 (Sprint 9) — AI scoring threshold admin panel.
// Read-write list of every key in public.ai_thresholds. Rules are
// grouped by their prefix (rule_name) and each row gets a number input
// + Save button. PUT updates the single row server-side and audit-logs
// the change. AI service consumption lands in Sprint 10.
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';
import { routes } from '@/constants/routes';
import { AiThresholdsForm } from '@/components/settings/AiThresholdsForm';

export const metadata: Metadata = { title: 'AI thresholds — HorusEye' };

interface ThresholdRow {
  key:        string;
  value:      number;
  updated_at: string;
  updated_by: string | null;
}

export default async function AiThresholdsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') notFound();

  const { data: rows } = await supabase
    .from('ai_thresholds')
    .select('key, value, updated_at, updated_by')
    .order('key');

  const thresholds = (rows ?? []) as ThresholdRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">AI scoring thresholds</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Phase A scoring knobs. Updates audit-logged; AI service picks them
          up on the next 60-second poll (Sprint 10 wire-up).
        </p>
      </div>
      <AiThresholdsForm initialThresholds={thresholds} />
    </div>
  );
}
