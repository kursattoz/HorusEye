-- PRD-021 §1 Tasarım Kararı + Sprint 14 (BL-270): internal_training_samples.
-- Tracks anonymized evidence frames that have been promoted into the
-- training corpus. Decouples the lifecycle of the training copy from
-- the source incident (PRD-013 §21.1 evidence is purged at 90 days, but
-- the anonymized training frame lives in anonymized-training-frames
-- forever — see PRD-017 §18.2).

CREATE TABLE IF NOT EXISTS public.internal_training_samples (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Provenance. ON DELETE SET NULL so a GDPR/KVKK incident purge does
  -- not orphan the sample row (the bucket object stays — it is already
  -- anonymized and the source link is severed).
  original_incident_id  UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
  dataset_id            UUID REFERENCES public.datasets(id)  ON DELETE SET NULL,
  -- YOLO label payload.
  class_id              INTEGER NOT NULL,
  class_name            TEXT    NOT NULL,
  bbox_yolo             REAL[] NOT NULL CHECK (cardinality(bbox_yolo) = 4),
  -- {x_center, y_center, width, height} all normalized 0..1
  -- Storage object path inside anonymized-training-frames bucket.
  storage_path          TEXT NOT NULL UNIQUE,
  -- Source incident metadata captured at promotion time. We persist this
  -- so an analyst can sanity-check the label without re-querying the
  -- (potentially purged) incidents row.
  source_session_id     UUID REFERENCES public.exam_sessions(id) ON DELETE SET NULL,
  source_incident_type  TEXT,
  -- Review workflow.
  annotation_status     TEXT NOT NULL DEFAULT 'pending'
                        CHECK (annotation_status IN ('pending','approved','rejected','needs_revision')),
  annotated_by          UUID REFERENCES public.user_profiles(id),
  annotated_at          TIMESTAMPTZ,
  review_note           TEXT,
  -- Privacy guarantee — set to true once the bucket object has been
  -- confirmed face-blurred (BL-263 anonymize_frame.py).
  is_anonymized         BOOLEAN NOT NULL DEFAULT false,
  -- Audit.
  created_by            UUID REFERENCES public.user_profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_training_samples_status
  ON public.internal_training_samples (annotation_status);
CREATE INDEX IF NOT EXISTS idx_internal_training_samples_class
  ON public.internal_training_samples (class_id);
CREATE INDEX IF NOT EXISTS idx_internal_training_samples_dataset
  ON public.internal_training_samples (dataset_id);
CREATE INDEX IF NOT EXISTS idx_internal_training_samples_incident
  ON public.internal_training_samples (original_incident_id);

CREATE TRIGGER update_internal_training_samples_updated_at
  BEFORE UPDATE ON public.internal_training_samples
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.internal_training_samples ENABLE ROW LEVEL SECURITY;

-- Admin-only access. Mirrors public.datasets (PRD-021 §1 RBAC).
CREATE POLICY "Admins can read training samples"
  ON public.internal_training_samples FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can insert training samples"
  ON public.internal_training_samples FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update training samples"
  ON public.internal_training_samples FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admins can delete training samples"
  ON public.internal_training_samples FOR DELETE TO authenticated
  USING (is_admin());
