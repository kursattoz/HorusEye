'use client';

// BL-267 — Merge wizard. Operator picks 2+ parent datasets, declares
// the target class list + output storage path, and we POST to
// /api/ai/datasets/merge so the row gets registered with merged_from +
// dataset.merge audit. Actual byte-level merge runs offline in
// scripts/merge_datasets.py — the wizard records the result.

import { useMemo, useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { DatasetSummary } from '@/types/dataset';

interface Props {
  open:         boolean;
  candidates:   DatasetSummary[];
  onOpenChange: (open: boolean) => void;
  onMerged:     () => void;
}

export function DatasetMergeWizard({ open, candidates, onOpenChange, onMerged }: Props) {
  const [name, setName]                 = useState('');
  const [version, setVersion]           = useState('1.0');
  const [targetClasses, setTargetClasses] = useState('');
  const [storagePath, setStoragePath]   = useState('');
  const [selectedIds, setSelectedIds]   = useState<string[]>([]);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  function reset() {
    setName(''); setVersion('1.0'); setTargetClasses('');
    setStoragePath(''); setSelectedIds([]); setError(null);
  }

  const totals = useMemo(() => {
    const picked = candidates.filter(c => selectedIds.includes(c.id));
    return {
      images:      picked.reduce((s, d) => s + (d.total_images ?? 0), 0),
      annotations: picked.reduce((s, d) => s + (d.total_annotations ?? 0), 0),
    };
  }, [candidates, selectedIds]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length < 2) {
      setError('Pick at least two parent datasets.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const classes = targetClasses
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);
      const r = await fetch('/api/ai/datasets/merge', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:           name.trim(),
          version:        version.trim() || '1.0',
          source_ids:     selectedIds,
          target_classes: classes,
          storage_path:   storagePath.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Merge failed');
      reset();
      onMerged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 size={16} /> Merge datasets
          </DialogTitle>
          <DialogDescription>
            Pick the parent datasets (run
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">scripts/merge_datasets.py</code>
            offline first) and record the merged corpus. PRD-017 §8 + §9.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field id="merge-name"    label="Merged name"    value={name}    onChange={setName}    required placeholder="v1_earbuds_phone" />
            <Field id="merge-version" label="Version"        value={version} onChange={setVersion} required />
          </div>
          <Field id="merge-classes"
                 label="Final classes (comma-separated)"
                 value={targetClasses}
                 onChange={setTargetClasses}
                 required
                 placeholder="earbuds, phone, book, paper_notes" />
          <Field id="merge-storage"
                 label="Output storage path"
                 value={storagePath}
                 onChange={setStoragePath}
                 required
                 placeholder="data/merged/v1_earbuds_phone/" />

          <div className="rounded-md border">
            <p className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Parents ({selectedIds.length} selected · {totals.images.toLocaleString()} imgs · {totals.annotations.toLocaleString()} anns)
            </p>
            <div className="max-h-64 divide-y overflow-y-auto text-sm">
              {candidates.length === 0 ? (
                <p className="px-3 py-4 text-muted-foreground">No datasets to merge yet.</p>
              ) : candidates.map(c => {
                const checked = selectedIds.includes(c.id);
                return (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={checked}
                      onChange={(e) => setSelectedIds(prev =>
                        e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id),
                      )}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{c.name} <span className="text-muted-foreground">v{c.version}</span></p>
                      <p className="text-xs text-muted-foreground">
                        {c.source_type} · {(c.total_images ?? 0).toLocaleString()} imgs · {c.status}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || selectedIds.length < 2}>
              {submitting && <Loader2 size={14} className="mr-1 animate-spin" />}
              Record merge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field(props: {
  id:           string;
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  required?:    boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        required={props.required}
        placeholder={props.placeholder}
      />
    </div>
  );
}
