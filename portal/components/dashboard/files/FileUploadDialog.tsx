'use client';

import { useState, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch }   from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Upload, X } from 'lucide-react';
import { toast }    from 'sonner';
import { cn }       from '@/lib/utils/cn';

const ACCEPTED = '.pdf,.pptx,.docx,.png,.jpg,.jpeg,.webp';
const MAX_SIZE  = 50 * 1024 * 1024; // 50 MB

const CATEGORIES = [
  { value: 'reports',       label: 'Raporlar' },
  { value: 'presentations', label: 'Sunumlar' },
  { value: 'documents',     label: 'Dokümanlar' },
  { value: 'other',         label: 'Diğer' },
];

interface FileUploadDialogProps {
  open:       boolean;
  onClose:    () => void;
  onUploaded: (file: Record<string, unknown>) => void;
}

export function FileUploadDialog({ open, onClose, onUploaded }: FileUploadDialogProps) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState('documents');
  const [isPublic, setIsPublic] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging]   = useState(false);

  function pickFile(f: File) {
    if (f.size > MAX_SIZE) { toast.error('Maksimum dosya boyutu 50MB.'); return; }
    setFile(f);
    setDisplayName(f.name.replace(/\.[^.]+$/, ''));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setProgress(10);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('display_name', displayName || file.name);
    fd.append('category', category);
    fd.append('is_public', String(isPublic));

    try {
      setProgress(40);
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
      setProgress(90);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Upload başarısız');
      }
      const data = await res.json();
      setProgress(100);
      onUploaded(data.file);
      resetState();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Yükleme hatası.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function resetState() {
    setFile(null); setDisplayName(''); setCategory('documents');
    setIsPublic(false); setProgress(0);
  }

  return (
    <Dialog open={open} onOpenChange={() => { if (!uploading) { resetState(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dosya Yükle</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
              file && 'border-primary/50 bg-primary/5'
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setFile(null); }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload size={24} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Dosyayı buraya sürükleyin veya <span className="text-primary underline">seçin</span>
                </p>
                <p className="text-xs text-muted-foreground">PDF, PPTX, DOCX, PNG, JPG — max 50MB</p>
              </div>
            )}
          </div>
          <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />

          <div className="space-y-2">
            <Label htmlFor="display-name">Görünen İsim</Label>
            <Input id="display-name" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Dosya adı" />
          </div>

          <div className="space-y-2">
            <Label>Kategori</Label>
            <Select value={category} onValueChange={(v) => { if (v !== null) setCategory(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="public" checked={isPublic} onCheckedChange={setIsPublic} />
            <Label htmlFor="public">Public (herkese açık)</Label>
          </div>

          {uploading && <Progress value={progress} className="h-1.5" />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetState(); onClose(); }} disabled={uploading}>İptal</Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? 'Yükleniyor...' : 'Yükle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
