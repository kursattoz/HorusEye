-- BL-220 (Sprint 10) — face embedding ANN search RPC.
-- Called from the AI service per-track matcher: takes a 512-dim query
-- vector, returns the top-K students whose embedding cosine similarity
-- exceeds match_threshold. Uses the HNSW index from BL-215.

CREATE OR REPLACE FUNCTION public.match_face_embedding(
  query_embedding vector(512),
  match_threshold double precision DEFAULT 0.65,
  match_count     integer           DEFAULT 1
)
RETURNS TABLE (
  id          uuid,
  student_id  text,
  full_name   text,
  similarity  double precision
)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT s.id,
         s.student_id,
         s.full_name,
         (1.0 - (s.face_embedding <=> query_embedding))::double precision AS similarity
  FROM   public.students s
  WHERE  s.face_embedding IS NOT NULL
    AND  s.is_active = true
    AND  s.deleted_at IS NULL
    AND  (1.0 - (s.face_embedding <=> query_embedding)) > match_threshold
  ORDER  BY s.face_embedding <=> query_embedding
  LIMIT  match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_face_embedding(vector, double precision, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.match_face_embedding IS 'BL-220 Sprint 10 — face embedding ANN search via pgvector HNSW. Used by AI service track ↔ student matcher.';
