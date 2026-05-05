-- BL-209 (Sprint 9) — admin-tunable scoring knobs.
-- Each row is a scalar threshold the AI service rules consume.
-- /settings/ai-thresholds reads/writes this; AI service polls every
-- 60s (Sprint 10 wire-up).

CREATE TABLE IF NOT EXISTS public.ai_thresholds (
  key        TEXT PRIMARY KEY,
  value      NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.user_profiles(id)
);

ALTER TABLE public.ai_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_thresholds_select ON public.ai_thresholds;
DROP POLICY IF EXISTS ai_thresholds_admin_write ON public.ai_thresholds;

CREATE POLICY ai_thresholds_select       ON public.ai_thresholds FOR SELECT TO authenticated USING (true);
CREATE POLICY ai_thresholds_admin_write  ON public.ai_thresholds FOR ALL    TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.ai_thresholds (key, value) VALUES
  ('phone_in_hand.overlap_threshold',     0.30),
  ('phone_in_hand.sustained_seconds',     3.0),
  ('phone_in_hand.cooldown_seconds',      30.0),
  ('phone_in_hand.high_severity_conf',    0.65),
  ('phone_in_hand.medium_severity_conf',  0.50),
  ('gaze_diversion.yaw_threshold',        30.0),
  ('gaze_diversion.sustained_seconds',    3.0),
  ('gaze_diversion.glance_cooldown_s',    30.0),
  ('gaze_diversion.incident_cooldown_s',  60.0),
  ('gaze_diversion.fires_for_medium',     3),
  ('gaze_diversion.fires_for_high',       6),
  ('head_turn.yaw_threshold',             45.0),
  ('head_turn.sustained_seconds',         2.0),
  ('head_turn.cooldown_seconds',          30.0),
  ('head_turn.fires_for_combo',           3),
  ('empty_seat.medium_seconds',           60.0),
  ('empty_seat.high_seconds',             120.0),
  ('empty_seat.cooldown_seconds',         60.0),
  ('unauthorized_person.sustained_seconds', 10.0),
  ('unauthorized_person.cooldown_seconds',  120.0)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.ai_thresholds IS 'BL-209 Sprint 9 — admin-tunable scoring knobs. AI service polls every 60s (Sprint 10 wire-up).';
