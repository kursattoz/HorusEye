'use client';

// BL-267 — Inline create-dataset modal. Mirrors the lightweight register
// flow operators run after import_dataset.py: enter name + source +
// storage path, post to /api/ai/datasets.
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { DatasetSourceType } from '@/types/dataset';

const SOURCE_OPTIONS: { value: DatasetSourceType; label: string }[] = [
  { value: 'roboflow',    label: 'Roboflow Universe' },
  { value: 'open_images', label: 'Open Images V7'    },
  { value: 'kaggle',      label: 'Kaggle'            },
  { value: 'coco',        label: 'COCO 2017'         },
  { value: 'internal',    label: 'Internal (anonymized exam frames)' },
  { value: 'custom',      label: 'Custom'            },
];

interface Props {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  onCreated:     () => void;
}

export function DatasetCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName]                 = useState('');
  const [version, setVersion]           = useState('1.0');
  const [sourceType, setSourceType]     = useState<DatasetSourceType>('roboflow');
  const [sourceUrl, setSourceUrl]       = useState('');
  const [license, setLicense]           = useState('');
  const [targetClasses, setTargetClasses] = useState('');
  const [storagePath, setStoragePath]   = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  function reset() {
    setName(''); setVersion('1.0'); setSourceType('roboflow');
    setSourceUrl(''); setLicense(''); setTargetClasses('');
    setStoragePath(''); setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const classes = targetClasses
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);
      const body = {
        name:           name.trim(),
        version:        version.trim() || '1.0',
        source_type:    sourceType,
        source_url:     sourceUrl.trim() || null,
        license:        license.trim()   || null,
        target_classes: classes,
        storage_path:   storagePath.trim(),
      };
      const r = await fetch('/api/ai/datasets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Create failed');
      reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register new dataset</DialogTitle>
          <DialogDescription>
            Records a dataset row pointing at the bundle you imported via
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">scripts/import_dataset.py</code>.
            PRD-017 §15.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field id="name" label="Name" value={name} onChange={setName} required />
            <Field id="version" label="Version" value={version} onChange={setVersion} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="source_type">Source type</Label>
            <Select value={sourceType} onValueChange={(v) => setSourceType(v as DatasetSourceType)}>
              <SelectTrigger id="source_type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field id="source_url" label="Source URL (optional)" value={sourceUrl} onChange={setSourceUrl} placeholder="https://universe.roboflow.com/..." />
          <Field id="license"    label="License (optional)"    value={license}   onChange={setLicense}   placeholder="CC-BY-4.0" />
          <Field id="target_classes"
                 label="Target classes (comma-separated)"
                 value={targetClasses}
                 onChange={setTargetClasses}
                 required
                 placeholder="earbuds, phone, book, paper_notes" />
          <Field id="storage_path"
                 label="Storage path"
                 value={storagePath}
                 onChange={setStoragePath}
                 required
                 placeholder="data/raw/roboflow_earbuds_v1/" />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 size={14} className="mr-1 animate-spin" />}
              Create dataset
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
