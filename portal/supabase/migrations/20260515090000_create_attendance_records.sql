-- Pre-exam attendance — Plan §D (post-sync improvements).
-- Tracks per-session face-match verification of each enrolled student
-- before the exam starts. Proctor drives the flow from
-- /exams/[id]/attendance.

CREATE TABLE public.attendance_records (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id              UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','verified','low_confidence','failed','manual_override')),
  -- Cosine similarity from match_face_embedding RPC. NULL until the
  -- first capture attempt. ≥0.75 → verified, 0.65–0.75 → low_confidence,
  -- <0.65 (or no match) → failed.
  similarity              DOUBLE PRECISION,
  attempts                INTEGER NOT NULL DEFAULT 0,
  first_check_at          TIMESTAMPTZ,
  verified_at             TIMESTAMPTZ,
  manual_override_by      UUID REFERENCES public.user_profiles(id),
  manual_override_reason  TEXT,
  -- Capture snapshot in the attendance-evidence bucket. KVKW retention
  -- handled by the orphan-cleanup cron (planned, Plan §B5).
  evidence_path           TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX idx_attendance_session        ON public.attendance_records (session_id);
CREATE INDEX idx_attendance_session_status ON public.attendance_records (session_id, status);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Same permissive policy used for the rest of the exam-management
-- tables (BL-130) — auth is enforced at the API layer via role checks.
CREATE POLICY attendance_records_all
  ON public.attendance_records
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

COMMENT ON TABLE public.attendance_records IS
  'Plan §D — pre-exam attendance: per session_id × student_id face-match verification before the exam goes active.';

-- Storage bucket for attendance check-in snapshots. Private; signed
-- URLs only. Mirrors the incident-evidence pattern.
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-evidence', 'attendance-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated reads (signed URL only, no public path);
-- service_role unrestricted (used by AI service uploads + Next.js API
-- via service-role key for evidence preview).
CREATE POLICY attendance_evidence_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-evidence');

CREATE POLICY attendance_evidence_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-evidence');

CREATE POLICY attendance_evidence_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-evidence');
