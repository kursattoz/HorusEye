-- demo-assets bucket — public, hosts looping classroom footage used for
-- presentations (see /cam-pair?video=… in CamPairCapture). MP4/webm
-- video plus stills; capped at 50 MB per object.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'demo-assets',
  'demo-assets',
  true,
  52428800,
  ARRAY['video/mp4','video/webm','image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies: any authenticated user can read (public bucket also
-- exposes unauthenticated reads via the /object/public/… path); writes
-- limited to admin role so only operators can swap demo content.
CREATE POLICY demo_assets_select_authenticated
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'demo-assets');

CREATE POLICY demo_assets_admin_writes
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'demo-assets'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'demo-assets'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  );
