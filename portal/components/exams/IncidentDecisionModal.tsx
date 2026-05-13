'use client';

// BL-236 — Modal for marking a single incident clean / suspicious / violation.
// Writes via PUT /api/incidents/[id] with source='modal' so the audit
// (BL-241) records the entry point. The 'escalate' affordance just sets
// 'violation' + flags decision_note with [ESCALATED] for the audit query.
import { useState } from 'react';
import { CheckCircle2, AlertOctagon, AlertTriangle, X, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ProctorDecision } from '@/types';

interface IncidentSummary {
  id: string;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  occurred_at: string;
  student_id: string | null;
  proctor_decision: ProctorDecision | null;
  decision_note: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  incident: IncidentSummary | null;
  onDecided?: (decision: ProctorDecision, note: string | null) => void;
}

const CHOICES: Array<{
  value: ProctorDecision;
  label: string;
  desc: string;
  cls: string;
  Icon: typeof CheckCircle2;
}> = [
  {
    value: 'clean', label: 'Clean',
    desc: 'False positive or legitimate behavior.',
    cls: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
    Icon: CheckCircle2,
  },
  {
    value: 'suspicious', label: 'Suspicious',
    desc: 'Concerning but not a clear violation.',
    cls: 'border-amber-300 text-amber-800 hover:bg-amber-50',
    Icon: AlertOctagon,
  },
  {
    value: 'violation', label: 'Violation',
    desc: 'Confirmed cheating — counts in the report.',
    cls: 'border-red-300 text-red-700 hover:bg-red-50',
    Icon: AlertTriangle,
  },
];

export function IncidentDecisionModal({ open, onClose, incident, onDecided }: Props) {
  const [decision, setDecision] = useState<ProctorDecision | null>(incident?.proctor_decision ?? null);
  const [note, setNote] = useState<string>(incident?.decision_note ?? '');
  const [escalate, setEscalate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !incident) return null;

  const submit = async () => {
    if (!decision) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        proctor_decision: decision,
        source: 'modal',
      };
      const finalNote = [
        escalate ? '[ESCALATED]' : '',
        note.trim(),
      ].filter(Boolean).join(' ');
      if (finalNote) payload.decision_note = finalNote;

      const res = await fetch(`/api/incidents/${incident.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      onDecided?.(decision, finalNote || null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Decide: {incident.incident_type.replace(/_/g, ' ')}
            <span className="text-xs font-normal text-muted-foreground capitalize">· {incident.severity}</span>
          </DialogTitle>
          <DialogDescription>
            {incident.student_id
              ? <>Student <span className="font-mono">{incident.student_id}</span> · </>
              : null}
            {new Date(incident.occurred_at).toLocaleString()} · {Math.round(incident.confidence * 100)}% conf
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="grid gap-2 sm:grid-cols-3">
          {CHOICES.map((c) => {
            const active = decision === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setDecision(c.value)}
                className={`group flex flex-col items-start gap-1 rounded-md border-2 p-3 text-left transition ${
                  active ? 'border-foreground ring-2 ring-foreground/20' : c.cls
                }`}
              >
                <c.Icon size={18} />
                <span className="text-sm font-semibold">{c.label}</span>
                <span className="text-[11px] text-muted-foreground leading-tight">{c.desc}</span>
              </button>
            );
          })}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — what convinced you?"
            rows={3}
          />
        </div>

        {decision === 'violation' && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={escalate}
              onChange={(e) => setEscalate(e.target.checked)}
              className="rounded border-input"
            />
            <span>Escalate — tag this decision for chief review</span>
          </label>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            <X size={14} /> Cancel
          </Button>
          <Button onClick={submit} disabled={!decision || submitting}>
            {submitting ? <Loader2 className="animate-spin" size={14} /> : null}
            Save decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
