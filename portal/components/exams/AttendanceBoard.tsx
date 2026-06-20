'use client';

// Plan §D — proctor-driven attendance board.
// Lists every student enrolled in the first session of an exam, lets
// the proctor capture a frame per row (verification against the
// enrolled face_embedding), and provides manual override for ambiguous
// or failed cases.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCw, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AttendanceRow, AttendanceStatus } from '@/types/attendance';

interface Props {
  examId:   string;
  examName: string;
}

interface ListResponse {
  session_id: string;
  records:    AttendanceRow[];
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  pending:          'Pending',
  verified:         'Verified',
  low_confidence:   'Low confidence',
  failed:           'Failed',
  manual_override:  'Manual override',
};

const STATUS_BADGE_CLASS: Record<AttendanceStatus, string> = {
  pending:         'bg-muted text-muted-foreground',
  verified:        'bg-green-500/15 text-green-700 dark:text-green-300',
  low_confidence:  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  failed:          'bg-red-500/15 text-red-700 dark:text-red-300',
  manual_override: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
};

export function AttendanceBoard({ examId, examName: _examName }: Props) {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [captureRow, setCaptureRow] = useState<AttendanceRow | null>(null);
  const [overrideRow, setOverrideRow] = useState<AttendanceRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/exams/${examId}/attendance`, { cache: 'no-store' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `status ${r.status}`);
      }
      const data = await r.json() as ListResponse;
      setRows(data.records);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [examId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time list fetch
  useEffect(() => { void refresh(); }, [refresh]);

  const total      = rows.length;
  const verified   = rows.filter(r => r.status === 'verified' || r.status === 'manual_override').length;
  const lowConf    = rows.filter(r => r.status === 'low_confidence').length;
  const failed     = rows.filter(r => r.status === 'failed').length;
  const pending    = rows.filter(r => r.status === 'pending').length;
  const percentage = total > 0 ? Math.round((verified / total) * 100) : 0;

  function handleRecordUpdated(updated: AttendanceRow) {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="border rounded-lg p-4 bg-card flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="flex-1">
          <div className="text-sm text-muted-foreground">Roster progress</div>
          <div className="text-2xl font-semibold">
            {verified} / {total}
            <span className="text-base font-normal text-muted-foreground ml-2">
              ({percentage}% verified)
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-green-500 transition-[width] duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat label="Verified"  value={verified} className="text-green-600" />
          <Stat label="Low conf." value={lowConf}  className="text-amber-600" />
          <Stat label="Failed"    value={failed}   className="text-red-600" />
          <Stat label="Pending"   value={pending}  className="text-muted-foreground" />
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={14} className={cn('mr-1.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {loadError && (
        <div className="border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 rounded-md p-3 text-sm">
          {loadError}
        </div>
      )}

      {/* Roster table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Student</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Similarity</th>
              <th className="px-4 py-2 font-medium">Attempts</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No students enrolled in this session yet.
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className="border-t hover:bg-accent/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium">{row.students.full_name}</div>
                  <div className="text-xs text-muted-foreground">{row.students.student_id}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
                    STATUS_BADGE_CLASS[row.status],
                  )}>
                    {STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {row.similarity != null ? row.similarity.toFixed(3) : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{row.attempts}</td>
                <td className="px-4 py-3 text-right space-x-1">
                  <Button size="sm" variant="outline" onClick={() => setCaptureRow(row)}>
                    <Camera size={13} className="mr-1" />
                    Verify
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setOverrideRow(row)}>
                    Override
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CaptureDialog
        examId={examId}
        row={captureRow}
        onClose={() => setCaptureRow(null)}
        onResult={updated => {
          handleRecordUpdated(updated);
          setCaptureRow(null);
        }}
      />

      <OverrideDialog
        examId={examId}
        row={overrideRow}
        onClose={() => setOverrideRow(null)}
        onResult={updated => {
          handleRecordUpdated(updated);
          setOverrideRow(null);
        }}
      />
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="text-center">
      <div className={cn('text-lg font-semibold', className)}>{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

// ───────────────────────── Capture dialog ─────────────────────────

interface CaptureProps {
  examId:    string;
  row:       AttendanceRow | null;
  onClose:   () => void;
  onResult:  (record: AttendanceRow) => void;
}

function CaptureDialog({ examId, row, onClose, onResult }: CaptureProps) {
  const [streamError, setStreamError] = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const open = row != null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stream error on reopen
    setStreamError(null);
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: 640, height: 480 }, audio: false })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      })
      .catch(err => {
        if (cancelled) return;
        setStreamError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  async function captureAndSubmit() {
    if (!videoRef.current || !row) return;
    const v = videoRef.current;
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92),
    );
    if (!blob) {
      toast.error('Could not grab a frame');
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('image', blob, `attendance-${Date.now()}.jpg`);
      form.append('student_id', row.student_id);

      const r = await fetch(`/api/exams/${examId}/attendance/check-in`, {
        method: 'POST',
        body:   form,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `status ${r.status}`);
      }
      const data = await r.json() as { record: AttendanceRow; status: AttendanceStatus; similarity: number | null };
      const sim = data.similarity != null ? `sim=${data.similarity.toFixed(3)}` : 'no match';
      const msgs: Record<AttendanceStatus, string> = {
        verified:        `Verified ✓ (${sim})`,
        low_confidence:  `Low confidence — needs override (${sim})`,
        failed:          `Failed — wrong person or no match (${sim})`,
        pending:         'Pending',
        manual_override: 'Manual override',
      };
      const fn = data.status === 'verified' ? toast.success
        : data.status === 'low_confidence' ? toast.warning
        : toast.error;
      fn(msgs[data.status]);
      onResult(data.record);
    } catch (err) {
      toast.error(`Check-in failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            Verify — {row?.students.full_name}
          </DialogTitle>
        </DialogHeader>

        {streamError && (
          <div className="border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 rounded-md p-3 text-sm">
            Camera unavailable: {streamError}
          </div>
        )}

        <div className="rounded-md overflow-hidden border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no track */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-auto block"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Point the camera at <strong>{row?.students.full_name}</strong> and
          click Capture. Match similarity ≥0.75 → verified; 0.65–0.75 needs
          override; below 0.65 → failed.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void captureAndSubmit()} disabled={submitting || !!streamError}>
            <Camera size={14} className="mr-1.5" />
            {submitting ? 'Matching…' : 'Capture & Verify'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Override dialog ─────────────────────────

interface OverrideProps {
  examId:   string;
  row:      AttendanceRow | null;
  onClose:  () => void;
  onResult: (record: AttendanceRow) => void;
}

function OverrideDialog({ examId, row, onClose, onResult }: OverrideProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const open = row != null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on reopen
    if (open) setReason('');
  }, [open]);

  async function submit(decision: 'approve' | 'reject') {
    if (!row) return;
    if (reason.trim().length < 3) {
      toast.error('Please enter a reason (min 3 chars)');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/exams/${examId}/attendance/${row.id}/override`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ decision, reason }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `status ${r.status}`);
      }
      const data = await r.json() as { record: AttendanceRow };
      toast.success(decision === 'approve' ? 'Marked verified (override)' : 'Marked failed');
      onResult(data.record);
    } catch (err) {
      toast.error(`Override failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-500" />
            Override — {row?.students.full_name}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Manually approve or reject this student. A note is required and
          recorded in the audit log.
        </p>

        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="Reason — e.g., proctor visually confirmed identity from student ID card"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <DialogFooter className="flex-row sm:justify-between gap-2">
          <Button
            variant="destructive"
            onClick={() => void submit('reject')}
            disabled={submitting}
          >
            <X size={14} className="mr-1" />
            Reject
          </Button>
          <Button
            onClick={() => void submit('approve')}
            disabled={submitting}
          >
            <Check size={14} className="mr-1" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
