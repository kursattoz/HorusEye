-- PRD-017 §10 + PRD-021 §3 Sprint 14 (BL-258): datasets table.
-- Tracks external + internal dataset versions used for YOLOv8 fine-tunes.
-- FK to ai_models so we can answer "which dataset trained this model".

CREATE TABLE IF NOT EXISTS public.datasets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  version           TEXT NOT NULL DEFAULT '1.0',
  source_type       TEXT NOT NULL
                    CHECK (source_type IN ('roboflow','open_images','kaggle','coco','internal','merged','custom')),
  source_url        TEXT,                          -- download origin (Roboflow / OID / Kaggle URL)
  license           TEXT,                          -- 'CC-BY-4.0', 'CC0', 'CC-BY-NC' etc.
  target_classes    TEXT[] NOT NULL,               -- ['earbuds','phone','book','paper_notes']
  total_images      INTEGER DEFAULT 0,
  total_annotations INTEGER DEFAULT 0,
  split_counts      JSONB DEFAULT '{}'::jsonb,     -- {"train": 1530, "val": 437, "test": 219}
  class_counts      JSONB DEFAULT '{}'::jsonb,     -- {"earbuds": 1199, "phone": 600}
  quality_report    JSONB DEFAULT '{}'::jsonb,     -- validate_dataset.py output
  storage_path      TEXT NOT NULL,                 -- 'data/merged/v1_earbuds_phone/'
  merged_from       UUID[] DEFAULT '{}'::uuid[],   -- parent dataset IDs (merge source)
  parent_id         UUID REFERENCES public.datasets(id),
  ai_model_id       UUID REFERENCES public.ai_models(id),  -- model trained on this
  status            TEXT NOT NULL DEFAULT 'importing'
                    CHECK (status IN ('importing','validating','ready','merged','training','archived')),
  created_by        UUID REFERENCES public.user_profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS idx_datasets_status     ON public.datasets (status);
CREATE INDEX IF NOT EXISTS idx_datasets_source     ON public.datasets (source_type);
CREATE INDEX IF NOT EXISTS idx_datasets_ai_model   ON public.datasets (ai_model_id);
CREATE INDEX IF NOT EXISTS idx_datasets_parent     ON public.datasets (parent_id);

CREATE TRIGGER update_datasets_updated_at
  BEFORE UPDATE ON public.datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

-- Admin-only access (PRD-021 Faz Uyumu §1 RBAC).
CREATE POLICY "Admins can read datasets"
  ON public.datasets FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can insert datasets"
  ON public.datasets FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update datasets"
  ON public.datasets FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admins can delete datasets"
  ON public.datasets FOR DELETE TO authenticated
  USING (is_admin());
