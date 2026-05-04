-- BL-121 — incident evidence storage bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'incident-evidence',
  'incident-evidence',
  false,
  26214400, -- 25 MB
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for the bucket — only authenticated users can read/write
CREATE POLICY "incident_evidence_authenticated_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'incident-evidence');

CREATE POLICY "incident_evidence_authenticated_write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'incident-evidence');

CREATE POLICY "incident_evidence_authenticated_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'incident-evidence');
