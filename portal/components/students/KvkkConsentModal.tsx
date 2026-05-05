'use client';

// BL-222 — KVKK explicit consent modal shown before face enrollment.
// PRD-013 §27 — KVKK m.6 explicit consent for biometric data.
//
// IMPORTANT — placeholder text below is engineering scaffolding; the
// final notice must be drafted/approved by TEDU's data-protection
// officer (DPO). The notice_version field on the consent endpoint
// pins which text the student saw, so future legal review can
// invalidate older consents without code changes.

import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const KVKK_NOTICE_VERSION = 'v1';

const NOTICE_TR = `HorusEye sınav gözetim sistemi, sınav esnasında kimlik doğrulama amacıyla yüz görüntünüzden 512-boyutlu sayısal vektör (face embedding) çıkarır.

Bu vektör:
• Sadece sınav oturumu süresince ve ilgili olay incelemesinde kullanılır.
• HorusEye veritabanında, kişisel bilgilerinizle (öğrenci numarası) ilişkili olarak saklanır.
• 6 ay aktif kullanım sonrası otomatik silinir; her dönem yeni rıza ile yenilenir.
• Hiçbir üçüncü tarafla paylaşılmaz.

Onayınız üzerine:
• Yüz görüntünüz işlenir, embedding hesaplanır ve kaydedilir.
• Sınav sırasında kimliğinizi doğrulamak için kullanılır.

Onayınızı dilediğiniz an "Profil → KVKK Onayı" sayfasından geri çekebilirsiniz; embedding o anda silinir ve yeniden enroll olmadan sistem sınavlarda sizi tanıyamaz.

KVKK m.6/3 kapsamında özel nitelikli kişisel veridir; aşağıdaki "Onaylıyorum" düğmesine basarak bu işlenmeye AÇIK RIZA verdiğinizi kabul edersiniz.`;

interface Props {
  open:        boolean;
  studentName: string;
  onClose:     () => void;
  onAccept:    (noticeVersion: string) => Promise<void> | void;
}

export function KvkkConsentModal({ open, studentName, onClose, onAccept }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleAccept() {
    setBusy(true);
    try {
      await onAccept(KVKK_NOTICE_VERSION);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            KVKK Açık Rıza — Yüz Tanıma ({studentName})
          </DialogTitle>
          <DialogDescription>
            Yüz tanıma kaydı öncesi, lütfen aşağıdaki bilgilendirmeyi okuyun.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">
          {NOTICE_TR}
        </pre>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            <X size={14} className="mr-1" /> İptal
          </Button>
          <Button onClick={handleAccept} disabled={busy}>
            <ShieldCheck size={14} className="mr-1" />
            {busy ? 'Kaydediliyor…' : 'Onaylıyorum'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
