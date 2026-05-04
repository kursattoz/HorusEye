// PRD-013 §7 — Evidence upload for incidents (image/video clip)
// Stored under Supabase Storage bucket 'incident-evidence'; path appended
// to incidents.evidence_paths array. UI reads via createSignedUrl.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

const BUCKET = 'incident-evidence';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_PREFIXES = ['image/', 'video/'];

export async function POST(request: NextRequest, { params }: Params) {
  const { id: incidentId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file form field is required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 25 MB' }, { status: 413 });
  }
  if (!ALLOWED_PREFIXES.some(p => file.type.startsWith(p))) {
    return NextResponse.json({ error: 'Only image/* or video/* allowed' }, { status: 415 });
  }

  // Verify the incident exists (also returns session for path scoping)
  const { data: incident, error: lookupErr } = await auth.supabase
    .from('incidents')
    .select('id, session_id, evidence_paths')
    .eq('id', incidentId)
    .maybeSingle();
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!incident)  return NextResponse.json({ error: 'Incident not found' }, { status: 404 });

  // Use service role for storage write so RLS doesn't trip the upload
  const { createClient } = await import('@/lib/supabase/server');
  const admin = await createClient({ serviceRole: true });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin';
  const path = `${incident.session_id}/${incidentId}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Append to evidence_paths
  const newPaths = [...(incident.evidence_paths ?? []), path];
  const { error: updErr } = await admin
    .from('incidents')
    .update({ evidence_paths: newPaths })
    .eq('id', incidentId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'incident',
    resource_id:   incidentId,
    action:        `Evidence uploaded (${(file.size / 1024).toFixed(0)} KB, ${file.type})`,
    metadata:      { path, file_name: file.name },
  });

  return NextResponse.json({ path, evidence_paths: newPaths }, { status: 201 });
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id: incidentId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path query param is required' }, { status: 400 });

  // Verify the path is one of this incident's evidence_paths (anti-IDOR)
  const { data: incident } = await auth.supabase
    .from('incidents')
    .select('evidence_paths')
    .eq('id', incidentId)
    .maybeSingle();
  if (!incident || !(incident.evidence_paths ?? []).includes(path)) {
    return NextResponse.json({ error: 'Evidence not found' }, { status: 404 });
  }

  const { createClient } = await import('@/lib/supabase/server');
  const admin = await createClient({ serviceRole: true });
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 300); // 5 minutes
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signed_url: data.signedUrl, expires_in: 300 });
}
