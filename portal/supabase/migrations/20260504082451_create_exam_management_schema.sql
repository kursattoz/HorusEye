-- BL-130 — PRD-013 §6.2-6.7 Exam Management DB Schema
-- exams → exam_sessions (per room) → session_proctors / session_students
-- exam_rooms (independent), cameras (per room)

-- ============ exams ============
CREATE TABLE public.exams (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  course_code       TEXT,
  description       TEXT,
  scheduled_date    DATE NOT NULL,
  scheduled_start   TIME NOT NULL,
  scheduled_end     TIME NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 120,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'cancelled')),
  settings          JSONB DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES public.user_profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_exams_date   ON public.exams (scheduled_date);
CREATE INDEX idx_exams_status ON public.exams (status);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY exams_all ON public.exams FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ exam_rooms ============
CREATE TABLE public.exam_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  capacity    INTEGER,
  location    TEXT,
  layout      JSONB DEFAULT '{}'::jsonb,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exam_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_rooms_all ON public.exam_rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ cameras ============
CREATE TABLE public.cameras (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES public.exam_rooms(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  stream_url    TEXT NOT NULL,
  camera_type   TEXT NOT NULL DEFAULT 'ip_camera'
                CHECK (camera_type IN ('ip_camera', 'phone', 'usb_webcam')),
  role          TEXT NOT NULL CHECK (role IN ('front_wide','front_close','rear_wide','side_left','side_right')),
  position_x    FLOAT,
  position_y    FLOAT,
  quality_score FLOAT DEFAULT 1.0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cameras_room ON public.cameras (room_id);

ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;
CREATE POLICY cameras_all ON public.cameras FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ exam_sessions (one per exam-room pair) ============
CREATE TABLE public.exam_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  room_id     UUID NOT NULL REFERENCES public.exam_rooms(id),
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled','active','paused','ended')),
  settings    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_exam_sessions_exam   ON public.exam_sessions (exam_id);
CREATE INDEX idx_exam_sessions_room   ON public.exam_sessions (room_id);
CREATE INDEX idx_exam_sessions_status ON public.exam_sessions (status);

ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_sessions_all ON public.exam_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ session_proctors (M:N) ============
CREATE TABLE public.session_proctors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.user_profiles(id),
  role        TEXT NOT NULL DEFAULT 'proctor'
              CHECK (role IN ('proctor','chief_proctor')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_session_proctors_unique ON public.session_proctors (session_id, user_id);

ALTER TABLE public.session_proctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_proctors_all ON public.session_proctors FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

CREATE TRIGGER trg_exams_updated_at         BEFORE UPDATE ON public.exams         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
CREATE TRIGGER trg_exam_rooms_updated_at    BEFORE UPDATE ON public.exam_rooms    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
CREATE TRIGGER trg_exam_sessions_updated_at BEFORE UPDATE ON public.exam_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
