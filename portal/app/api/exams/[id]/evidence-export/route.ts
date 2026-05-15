// BL-242 — Evidence export (legal hold).
// Walks every incident in scope (exam/session), downloads each evidence
// file from Storage, packs them into a zip with a manifest.json that
// records the SHA-256 of each file and the proctor decision attached.
import { type NextRequest } from 'next/server';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

const MAX_INCIDENTS = 2000;
const MAX_BYTES = 500 * 1024 * 1024;  // 500 MB safety net

export async function GET(req: NextRequest, { params }: Params) {
  const { id: examId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  // Admin-only — this is a privileged operation.
  const { data: prof } = await supabase
    .from('user_profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  if (!prof?.is_active || prof.role !== 'admin') {
    return new Response('Admin only', { status: 403 });
  }

  const url = new URL(req.url);
  const sessionScope = url.searchParams.get('session_id');

  const { data: exam } = await supabase
    .from('exams').select('id, name, scheduled_date').eq('id', examId).maybeSingle();
  if (!exam) return new Response('Exam not found', { status: 404 });

  const { data: sessionsData } = await supabase
    .from('exam_sessions').select('id').eq('exam_id', examId);
  const allSessionIds = ((sessionsData ?? []) as Array<{ id: string }>).map((s) => s.id);
  const sessionIds = sessionScope ? [sessionScope] : allSessionIds;

  let q = supabase
    .from('incidents')
    .select('id, session_id, occurred_at, incident_type, severity, confidence, student_id, evidence_paths, proctor_decision, decision_note, decided_by, decided_at')
    .order('occurred_at', { ascending: true })
    .limit(MAX_INCIDENTS + 1);
  q = q.in('session_id', sessionIds);
  const { data: incidents, error: incErr } = await q;
  if (incErr) return new Response(incErr.message, { status: 500 });
  if ((incidents ?? []).length > MAX_INCIDENTS) {
    return new Response(`Too many incidents (>${MAX_INCIDENTS}). Narrow to a session.`, { status: 413 });
  }

  const admin = await createClient({ serviceRole: true });
  const zip = new JSZip();
  let totalBytes = 0;
  const manifest: Array<Record<string, unknown>> = [];

  interface IncidentRow {
    id: string; session_id: string; occurred_at: string;
    incident_type: string; severity: string; confidence: number;
    student_id: string | null; evidence_paths: string[];
    proctor_decision: string | null; decision_note: string | null;
    decided_by: string | null; decided_at: string | null;
  }
  for (const inc of ((incidents ?? []) as IncidentRow[])) {
    for (const [idx, path] of (inc.evidence_paths ?? []).entries()) {
      const { data: blob, error: dlErr } = await admin.storage
        .from('incident-evidence').download(path);
      if (dlErr || !blob) continue;
      const buf = Buffer.from(await blob.arrayBuffer());
      totalBytes += buf.byteLength;
      if (totalBytes > MAX_BYTES) {
        return new Response(`Export exceeded ${MAX_BYTES} bytes`, { status: 413 });
      }
      const sha256 = createHash('sha256').update(buf).digest('hex');
      const ext = (path.split('.').pop() ?? 'bin').slice(0, 6);
      const zipPath = `evidence/${inc.session_id}/${inc.id}-${idx + 1}.${ext}`;
      zip.file(zipPath, buf);
      manifest.push({
        zip_path:     zipPath,
        sha256,
        bytes:        buf.byteLength,
        storage_path: path,
        incident_id:  inc.id,
        session_id:   inc.session_id,
        occurred_at:  inc.occurred_at,
        incident_type: inc.incident_type,
        severity:     inc.severity,
        student_id:   inc.student_id,
        proctor_decision: inc.proctor_decision,
        decision_note:    inc.decision_note,
        decided_at:       inc.decided_at,
      });
    }
  }

  // manifest.json + a README
  zip.file('manifest.json', JSON.stringify({
    exam_id:      exam.id,
    exam_name:    exam.name,
    scope:        sessionScope ? 'session' : 'exam',
    session_id:   sessionScope,
    generated_at: new Date().toISOString(),
    generated_by: user.id,
    incident_count: (incidents ?? []).length,
    file_count:   manifest.length,
    files:        manifest,
  }, null, 2));

  zip.file('README.txt',
    `HorusEye legal-hold evidence export\n` +
    `Exam: ${exam.name}\n` +
    `Generated: ${new Date().toISOString()}\n\n` +
    `Each file's SHA-256 hash and incident metadata is in manifest.json.\n` +
    `Files are stored under evidence/<session_id>/<incident_id>-<n>.<ext>.\n`
  );

  const zipBuffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

  await log({
    event_type:    'system.info',
    severity:      'warn',  // legal export is high-attention
    user_id:       user.id,
    resource_type: 'evidence_export',
    resource_id:   examId,
    action:        `Evidence export (${manifest.length} files, ${(zipBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)`,
    metadata: {
      scope:         sessionScope ? 'session' : 'exam',
      session_id:    sessionScope,
      incident_count: (incidents ?? []).length,
      file_count:    manifest.length,
      bytes:         zipBuffer.byteLength,
    },
  });

  const fname = [
    'horuseye',
    exam.name.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40).toLowerCase(),
    'evidence',
    sessionScope ? sessionScope.slice(0, 8) : 'exam',
    new Date().toISOString().slice(0, 10),
  ].join('_') + '.zip';

  // Force a fresh ArrayBuffer-backed Uint8Array to keep BodyInit happy
  // across DOM lib variants (Uint8Array<ArrayBufferLike> vs ArrayBuffer).
  const ab = new ArrayBuffer(zipBuffer.byteLength);
  new Uint8Array(ab).set(zipBuffer);
  return new Response(ab, {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Content-Length':      String(ab.byteLength),
      'Cache-Control':       'private, no-store',
    },
  });
}
