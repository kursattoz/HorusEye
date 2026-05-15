-- BL-232 — Per-student calibration overrides.
-- Allows admin to bump severity ladder up or down for individual students
-- (e.g. accommodations for accessibility or stricter monitoring for
-- students with history). Optional minimum-confidence floor and free-form
-- proctor notes.

CREATE TABLE IF NOT EXISTS public.student_calibration (
  student_id            UUID PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  severity_bump         INTEGER NOT NULL DEFAULT 0
                        CHECK (severity_bump BETWEEN -2 AND 2),
  min_confidence        NUMERIC(3,2)
                        CHECK (min_confidence IS NULL OR (min_confidence >= 0 AND min_confidence <= 1)),
  notes                 TEXT,
  updated_by            UUID REFERENCES public.user_profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.student_calibration ENABLE ROW LEVEL SECURITY;
CREATE POLICY student_calibration_select ON public.student_calibration
  FOR SELECT TO authenticated USING (true);
CREATE POLICY student_calibration_modify ON public.student_calibration
  FOR ALL TO authenticated
  USING (public.user_is_admin(auth.uid()))
  WITH CHECK (public.user_is_admin(auth.uid()));

CREATE TRIGGER trg_student_calibration_updated_at BEFORE UPDATE
  ON public.student_calibration
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
