-- BL-215 (Sprint 10) — face embedding columns + KVKK consent timestamp.
-- Phase B identity: ArcFace ResNet50 (insightface buffalo_l) produces a
-- 512-dim normalized vector per face. HNSW cosine index on the partial
-- WHERE face_embedding IS NOT NULL filter keeps the index small while
-- not-yet-enrolled students are still in the table.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS face_embedding             vector(512),
  ADD COLUMN IF NOT EXISTS face_embedding_updated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS face_consent_at            TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_students_face_embedding
  ON public.students
  USING hnsw (face_embedding vector_cosine_ops)
  WHERE face_embedding IS NOT NULL;

COMMENT ON COLUMN public.students.face_embedding IS 'BL-215 — ArcFace 512-dim embedding (insightface buffalo_l). Cosine distance via HNSW index.';
COMMENT ON COLUMN public.students.face_consent_at IS 'BL-222 — KVKK explicit consent timestamp. NULL = no consent → AI service must not embed.';
