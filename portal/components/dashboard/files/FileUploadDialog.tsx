'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Label }    from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch }   from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast }    from 'sonner';
import { cn }       from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';

const PdfPagePicker = dynamic(
  () => import('@/components/public/PdfPagePicker').then(m => ({ default: m.PdfPagePicker })),
  { ssr: false }
);

const ACCEPTED = '.pdf,.pptx,.docx,.png,.jpg,.jpeg,.webp';
const MAX_SIZE  = 50 * 1024 * 1024; // 50 MB
const MAX_FILES = 5;

const CATEGORIES = [
  { value: 'reports',       label: 'Reports' },
  { value: 'presentations', label: 'Presentations' },
  { value: 'documents',     label: 'Documents' },
  { value: 'other',         label: 'Other' },
];

interface FileUploadDialogProps {
  open:       boolean;
  onClose:    () => void;
  onUploaded: (file: Record<string, unknown>) => void;
}

export function FileUploadDialog({ open, onClose, onUploaded }: FileUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles]           = useState<File[]>([]);
  const [category, setCategory]     = useState('documents');
  const [isPublic, setIsPublic]     = useState(false);
  const [blurredPages, setBlurredPages] = useState<number[]>([]);
  const [progress, setProgress]     = useState(0);
  const [uploading, setUploading]   = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [dragging, setDragging]     = useState(false);
  const [documentDate, setDocumentDate] = useState<string | undefined>(undefined);
  const [dateDetecting, setDateDetecting] = useState(false);

  function pickFiles(incoming: File[]) {
    const valid: File[] = [];
    for (const f of incoming) {
      if (f.size > MAX_SIZE) {
        toast.error(`"${f.name}" exceeds the 50 MB limit.`);
        continue;
      }
      valid.push(f);
    }

    const combined = [...files, ...valid];
    if (combined.length > MAX_FILES) {
      toast.error(`You can upload at most ${MAX_FILES} files at once.`);
      const trimmed = combined.slice(0, MAX_FILES);
      setFiles(trimmed);
      if (!documentDate) detectDateFromPdf(trimmed);
    } else {
      setFiles(combined);
      if (!documentDate) detectDateFromPdf(combined);
    }
  }

  async function detectDateFromPdf(fileList: File[]) {
    const pdfFile = fileList.find(f => f.type === 'application/pdf');
    if (!pdfFile) return;

    setDateDetecting(true);
    try {
      const { extractDateFromPdf } = await import('@/lib/utils/extract-pdf-date');
      const date = await extractDateFromPdf(pdfFile);
      if (date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        setDocumentDate(dateStr);
        toast.success(`Date detected: ${date.toLocaleDateString()}`);
      }
    } catch { /* ignore */ }
    finally { setDateDetecting(false); }
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) pickFiles(dropped);
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);

    const total = files.length;
    const results: Record<string, unknown>[] = [];

    try {
      for (const [i, f] of files.entries()) {
        setUploadStatus(`Uploading ${i + 1} of ${total}...`);
        setProgress(Math.round(((i) / total) * 100));

        const fd = new FormData();
        fd.append('file', f);
        fd.append('display_name', f.name.replace(/\.[^.]+$/, ''));
        fd.append('category', category);
        fd.append('is_public', String(isPublic));
        if (blurredPages.length > 0 && total === 1 && f.type === 'application/pdf') {
          fd.append('blurred_pages', JSON.stringify(blurredPages));
        }
        if (documentDate) {
          fd.append('document_date', documentDate);
        }

        const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `Upload failed for "${f.name}"`);
        }
        const data = await res.json();
        results.push(data.file);
      }

      setProgress(100);
      setUploadStatus('Done!');
      for (const r of results) {
        onUploaded(r);
      }
      resetState();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload error.');
    } finally {
      setUploading(false);
      setProgress(0);
      setUploadStatus('');
    }
  }

  function resetState() {
    setFiles([]); setCategory('documents');
    setIsPublic(false); setBlurredPages([]);
    setDocumentDate(undefined);
    setProgress(0); setUploadStatus('');
  }

  const firstFile = files[0] as File | undefined;
  const singlePdf = files.length === 1 && firstFile?.type === 'application/pdf';

  return (
    <Dialog open={open} onOpenChange={() => { if (!uploading) { resetState(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
              files.length > 0 && 'border-primary/50 bg-primary/5'
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            {files.length > 0 ? (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-center gap-2">
                    <span className="text-sm font-medium truncate max-w-xs">{f.name}</span>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeFile(i); }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {files.length < MAX_FILES && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Click or drop to add more ({MAX_FILES - files.length} remaining)
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <Upload size={24} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag and drop files here or <span className="text-primary underline">choose files</span>
                </p>
                <p className="text-xs text-muted-foreground">PDF, PPTX, DOCX, PNG, JPG — max 50 MB each, up to {MAX_FILES} files</p>
              </div>
            )}
          </div>
          <input ref={inputRef} type="file" accept={ACCEPTED} multiple className="hidden"
            onChange={e => {
              const selected = e.target.files;
              if (selected && selected.length > 0) pickFiles(Array.from(selected));
              e.target.value = '';
            }}
          />

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Document Date</Label>
            <div className="flex items-center gap-2">
              <DatePicker
                value={documentDate}
                onChange={setDocumentDate}
                placeholder={dateDetecting ? 'Detecting from PDF...' : 'Select document date'}
                disabled={dateDetecting}
                className="w-full h-9 text-sm"
              />
              {dateDetecting && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="public" checked={isPublic} onCheckedChange={setIsPublic} />
            <Label htmlFor="public">Public (visible to everyone)</Label>
          </div>

          {singlePdf && (
            <div className="space-y-2">
              <Label>Blur Page (optional)</Label>
              <PdfPagePicker file={firstFile!} selected={blurredPages} onSelect={setBlurredPages} />
            </div>
          )}

          {uploading && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1.5" />
              <p className="text-xs text-muted-foreground text-center">{uploadStatus}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetState(); onClose(); }} disabled={uploading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={files.length === 0 || uploading}>
            {uploading ? uploadStatus : files.length > 1 ? `Upload ${files.length} Files` : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
