-- BL-129 — PRD-013 §7 Incident schema (full Incident @1.1 spec including post-exam decision fields)

CREATE TABLE public.incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id        TEXT,                          -- school student_id OR 'track:{N}' before matching
  track_id          INTEGER,                       -- BoT-SORT tracker ID
  incident_type     TEXT NOT NULL CHECK (incident_type IN (
    'phone_detected','earbuds_detected','paper_detected',
    'gaze_diversion','head_turn','empty_seat',
    'whispering','unauthorized_communication','position_uncertainty'
  )),
  severity          TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  confidence        FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  risk_score        FLOAT,
  triggered_rules   TEXT[]   NOT NULL DEFAULT ARRAY[]::TEXT[],
  camera_ids        UUID[]   NOT NULL DEFAULT ARRAY[]::UUID[],
  evidence_paths    TEXT[]   NOT NULL DEFAULT ARRAY[]::TEXT[],
  raw_signals       JSONB,
  is_reviewed       BOOLEAN  NOT NULL DEFAULT false,
  reviewed_by       UUID REFERENCES public.user_profiles(id),
  review_note       TEXT,
  proctor_decision  TEXT CHECK (proctor_decision IN ('clean','suspicious','violation')),
  decision_note     TEXT,
  decided_by        UUID REFERENCES public.user_profiles(id),
  decided_at        TIMESTAMPTZ,
  occurred_at       TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_incidents_session    ON public.incidents (session_id, occurred_at DESC);
CREATE INDEX idx_incidents_severity   ON public.incidents (severity);
CREATE INDEX idx_incidents_student    ON public.incidents (student_id);
CREATE INDEX idx_incidents_type       ON public.incidents (incident_type);
CREATE INDEX idx_incidents_unreviewed ON public.incidents (is_reviewed) WHERE is_reviewed = false;

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY incidents_all ON public.incidents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Re-scoring history (PRD-013 §7.3 — fine-tuning support)
CREATE TABLE public.incident_rescoring_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  triggered_by    UUID REFERENCES public.user_profiles(id),
  config_changes  JSONB NOT NULL,                  -- threshold edits etc.
  changes         JSONB NOT NULL,                  -- { incidents_affected: 3, severity_lowered: 2, suppressed: 1 }
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.incident_rescoring_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY incident_rescoring_history_all ON public.incident_rescoring_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
