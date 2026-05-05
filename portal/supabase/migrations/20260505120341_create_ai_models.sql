-- BL-210 (Sprint 9) — AI model registry.
-- Tracks YOLO / MediaPipe / ArcFace weights versions, benchmark results, and
-- which model is currently active in production. Sprint 11's fine-tune
-- workflow will INSERT here when a new weights file is uploaded.

CREATE TABLE IF NOT EXISTS public.ai_models (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  version           TEXT NOT NULL,
  weights_path      TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT false,
  benchmark_results JSONB,
  trained_on        TIMESTAMPTZ,
  deployed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_models_active ON public.ai_models (active) WHERE active;
CREATE INDEX IF NOT EXISTS idx_ai_models_name_version ON public.ai_models (name, version DESC);

ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_models_select ON public.ai_models;
DROP POLICY IF EXISTS ai_models_admin_write ON public.ai_models;

CREATE POLICY ai_models_select       ON public.ai_models FOR SELECT TO authenticated USING (true);
CREATE POLICY ai_models_admin_write  ON public.ai_models FOR ALL    TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ai_models IS 'BL-210 Sprint 9 — AI model registry: weights paths + benchmark results + active flag.';
COMMENT ON COLUMN public.ai_models.benchmark_results IS 'BL-193/BL-211 — JSON output of scripts/benchmark_phone.py per model+version.';
