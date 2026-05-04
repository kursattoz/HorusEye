-- PRD-019 §2.1 — cameras tablosu eklemeleri
ALTER TABLE public.cameras
  ADD COLUMN IF NOT EXISTS is_fixed       BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_user_id  UUID REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS device_id      TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at   TIMESTAMPTZ;

-- room_id artık nullable: taşınabilir kameralar (telefonlar) home room'a sahip olmayabilir
ALTER TABLE public.cameras ALTER COLUMN room_id DROP NOT NULL;

-- Sabit kamera ↔ home room bütünlüğü
ALTER TABLE public.cameras
  DROP CONSTRAINT IF EXISTS fixed_cameras_have_home_room;
ALTER TABLE public.cameras
  ADD CONSTRAINT fixed_cameras_have_home_room
  CHECK (NOT is_fixed OR room_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_cameras_owner   ON public.cameras (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_cameras_device  ON public.cameras (device_id) WHERE device_id IS NOT NULL;

-- PRD-019 §2.2 — session_cameras junction
CREATE TABLE IF NOT EXISTS public.session_cameras (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  camera_id   UUID NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  added_by    UUID REFERENCES public.user_profiles(id),
  UNIQUE (session_id, camera_id)
);

CREATE INDEX IF NOT EXISTS idx_session_cameras_session ON public.session_cameras (session_id);
CREATE INDEX IF NOT EXISTS idx_session_cameras_camera  ON public.session_cameras (camera_id);

ALTER TABLE public.session_cameras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_cameras_all ON public.session_cameras;
CREATE POLICY session_cameras_all ON public.session_cameras FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PRD-019 §2.3 — camera_health_events
CREATE TABLE IF NOT EXISTS public.camera_health_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id   UUID NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES public.exam_sessions(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'connected', 'disconnected', 'reconnected',
    'low_battery', 'critical_battery', 'charging',
    'app_backgrounded', 'app_foregrounded',
    'overheat', 'orientation_changed', 'preview_offscreen',
    'permission_revoked'
  )),
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camera_health_camera   ON public.camera_health_events (camera_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_camera_health_session  ON public.camera_health_events (session_id);

ALTER TABLE public.camera_health_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS camera_health_events_all ON public.camera_health_events;
CREATE POLICY camera_health_events_all ON public.camera_health_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
