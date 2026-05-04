-- BL-122 — PRD-013 §5.4 Student management + §6.7 session_students junction
-- Student pool (room/exam-independent) + session assignments

CREATE TABLE public.students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  email         TEXT,
  department    TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_students_student_id ON public.students (student_id);
CREATE INDEX idx_students_department ON public.students (department) WHERE deleted_at IS NULL;
CREATE INDEX idx_students_active     ON public.students (is_active) WHERE deleted_at IS NULL;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY students_all ON public.students FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- session_students (M:N student ↔ exam_session, with seat assignment)
CREATE TABLE public.session_students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.students(id),
  seat_number TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_session_students_unique  ON public.session_students (session_id, student_id);
CREATE INDEX        idx_session_students_session ON public.session_students (session_id);
CREATE INDEX        idx_session_students_student ON public.session_students (student_id);

ALTER TABLE public.session_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_students_all ON public.session_students FOR ALL TO authenticated USING (true) WITH CHECK (true);
