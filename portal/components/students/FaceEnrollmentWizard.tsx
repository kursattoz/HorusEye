'use client';

// BL-219 — Face enrollment wizard.
// Three-step flow on a single dialog:
//   1. Read KVKK consent — calls KvkkConsentModal if face_consent_at NULL.
//   2. Camera preview (getUserMedia, facingMode:'user') with capture button.
//   3. Submit to /api/students/[id]/face-enroll.
//
// Sprint 10 v1 captures one frame; Sprint 11 follow-up will burst 3-5
// frames + server-side average per PRD-013 §6.13. The single-frame path
// is enough to validate the full enroll → match loop end-to-end.

import { useEffect, useRef, useState } from 'react';
import { Camera, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KVKK_NOTICE_VERSION, KvkkConsentModal } from '@/components/students/KvkkConsentModal';

interface Props {
  open:           boolean;
  studentId:      string;
  studentName:    string;
  consentStamped: boolean;        // students.face_consent_at IS NOT NULL?
  onClose:        () => void;
  onEnrolled?:    () => void;
}

type Stage = 'consent' | 'camera' | 'submitting' | 'done';

export function FaceEnrollmentWizard({
  open, studentId, studentName, consentStamped, onClose, onEnrolled,
}: Props) {
  const initialStage: Stage = consentStamped ? 'camera' : 'consent';
  const [stage, setStage] = useState<Stage>(initialStage);
  const [streamError, setStreamError] = useState<string | null>(null);

  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Reset stage whenever the dialog reopens
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prop-driven reset on reopen
    setStage(consentStamped ? 'camera' : 'consent');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pairs with stage reset
    setStreamError(null);
  }, [open, consentStamped]);

  // Camera lifecycle: start when entering camera stage, stop on unmount/close
  useEffect(() => {
    if (!open || stage !== 'camera') return;
    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
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
  }, [open, stage]);

  async function grantConsent(noticeVersion: string) {
    const r = await fetch(`/api/students/${studentId}/consent`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ consent: true, notice_version: noticeVersion }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      toast.error(`KVKK consent failed: ${body.error ?? r.status}`);
      return;
    }
    toast.success('KVKK rızası kaydedildi');
    setStage('camera');
  }

  async function captureAndSubmit() {
    if (!videoRef.current) return;
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
      toast.error('Kameradan kare alınamadı');
      return;
    }
    setStage('submitting');
    const form = new FormData();
    form.append('image', blob, `enroll-${Date.now()}.jpg`);
    try {
      const r = await fetch(`/api/students/${studentId}/face-enroll`, {
        method: 'POST',
        body:   form,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `status ${r.status}`);
      }
      toast.success('Yüz kaydı tamamlandı');
      setStage('done');
      onEnrolled?.();
    } catch (err) {
      toast.error(`Yüz kaydı başarısız: ${err instanceof Error ? err.message : String(err)}`);
      setStage('camera');
    }
  }

  return (
    <>
      <Dialog open={open && stage !== 'consent'} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" />
              Yüz Kaydı — {studentName}
            </DialogTitle>
          </DialogHeader>

          {stage === 'camera' && (
            <div className="space-y-3">
              <div className="aspect-video w-full overflow-hidden rounded border bg-black">
                {streamError ? (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-red-300">
                    {streamError}
                  </div>
                ) : (
                  <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>İptal</Button>
                <Button disabled={Boolean(streamError)} onClick={captureAndSubmit}>
                  <Camera size={14} className="mr-1" /> Kaydet
                </Button>
              </div>
            </div>
          )}
          {stage === 'submitting' && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Embedding hesaplanıyor…
            </p>
          )}
          {stage === 'done' && (
            <div className="space-y-3 py-2 text-center text-sm">
              <p>✅ Yüz vektörü kaydedildi.</p>
              <Button onClick={onClose}>Kapat</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <KvkkConsentModal
        open={open && stage === 'consent'}
        studentName={studentName}
        onClose={() => { onClose(); }}
        onAccept={(version) => grantConsent(version || KVKK_NOTICE_VERSION)}
      />
    </>
  );
}
