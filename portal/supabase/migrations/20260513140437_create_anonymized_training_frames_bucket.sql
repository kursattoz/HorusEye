-- PRD-021 §2 Tasarım Kararı + Sprint 14 (BL-269): anonymized-training-frames bucket.
-- Private bucket for face-anonymized evidence frames promoted into the
-- training corpus. PRD-017 §18.3 KVKK: original frames stay in
-- incident-evidence with 90-day retention; the anonymized copy lives
-- here permanently. Admin-only RLS — supervisors and assistants do NOT
-- get direct bucket access; the /api/ai/datasets endpoints proxy reads.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anonymized-training-frames',
  'anonymized-training-frames',
  false,
  52428800, -- 50 MB (PRD-021 Tasarım Kararı §2)
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "anonymized_training_frames_admin_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'anonymized-training-frames' AND public.is_admin());

CREATE POLICY "anonymized_training_frames_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anonymized-training-frames' AND public.is_admin());

CREATE POLICY "anonymized_training_frames_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'anonymized-training-frames' AND public.is_admin())
  WITH CHECK (bucket_id = 'anonymized-training-frames' AND public.is_admin());

CREATE POLICY "anonymized_training_frames_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'anonymized-training-frames' AND public.is_admin());
