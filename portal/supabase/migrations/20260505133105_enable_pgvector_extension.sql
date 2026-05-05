-- BL-214 (Sprint 10) — pgvector for face embeddings.
-- Enables HNSW + IVFFlat cosine-similarity indexes on the upcoming
-- students.face_embedding vector(512) column (BL-215). Supabase ships
-- pgvector 0.8.0 by default; CREATE IF NOT EXISTS is idempotent across
-- envs.

CREATE EXTENSION IF NOT EXISTS vector;

COMMENT ON EXTENSION vector IS 'BL-214 Sprint 10 — pgvector for face embedding cosine similarity (PRD-013 §6.13).';
