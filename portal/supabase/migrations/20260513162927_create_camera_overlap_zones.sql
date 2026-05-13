-- PRD-021 §3 Sprint 18 (BL-316): camera overlap zones.
-- Declares which camera pairs see overlapping ground area so the
-- multi-cam coordinator (BL-310) knows whose tracks to cross-match.
--
-- An overlap zone is a directed pair (camera_a, camera_b) with an
-- optional confidence + descriptive label. The coordinator treats
-- the pair as symmetric — entries auto-fan-out by the reader.

CREATE TABLE IF NOT EXISTS public.camera_overlap_zones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_a_id  UUID NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  camera_b_id  UUID NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  label        TEXT,                              -- 'door-side overlap', 'back-row', etc.
  confidence   FLOAT NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  created_by   UUID REFERENCES public.user_profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT camera_overlap_zones_no_self CHECK (camera_a_id <> camera_b_id),
  CONSTRAINT camera_overlap_zones_unique  UNIQUE (camera_a_id, camera_b_id)
);

CREATE INDEX IF NOT EXISTS idx_camera_overlap_zones_a ON public.camera_overlap_zones (camera_a_id);
CREATE INDEX IF NOT EXISTS idx_camera_overlap_zones_b ON public.camera_overlap_zones (camera_b_id);

CREATE TRIGGER update_camera_overlap_zones_updated_at
  BEFORE UPDATE ON public.camera_overlap_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.camera_overlap_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage overlap zones"
  ON public.camera_overlap_zones FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Supervisors can read overlap zones"
  ON public.camera_overlap_zones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );
