'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2, Globe, Lock, Upload, ArrowUp, ArrowDown, EyeOff, Eye, Download, ExternalLink, Pencil } from 'lucide-react';
import { toast }      from 'sonner';
import { cn }         from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { FileUploadDialog } from './FileUploadDialog';

const PdfPagePicker = dynamic(
  () => import('@/components/public/PdfPagePicker').then(m => ({ default: m.PdfPagePicker })),
  { ssr: false },
);

const DocxViewer = dynamic(
  () => import('./DocxViewerInline').then(m => ({ default: m.DocxViewerInline })),
  { ssr: false },
);

interface FileRow {
  id:              string;
  display_name:    string;
  name:            string;
  file_type:       string;
  file_size_bytes: number;
  is_public:       boolean;
  public_url:      string | null;
  storage_path:    string;
  metadata:        Record<string, unknown>;
  created_at:      string;
  deleted_at:      string | null;
  document_date:   string | null;
  blurred_pages:   number[] | null;
  sort_order:      number | null;
}

interface FilesTableProps {
  files: FileRow[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Inline editable name cell ── */
function EditableName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className="w-full h-7 text-sm border rounded px-2 bg-background font-medium"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 text-left font-medium max-w-xs truncate hover:text-primary transition-colors"
      title="Click to rename"
    >
      <span className="truncate">{value}</span>
      <Pencil size={11} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

export function FilesTable({ files: initial }: FilesTableProps) {
  const [files, setFiles]           = useState<FileRow[]>(initial);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview]       = useState<FileRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [, startTransition]         = useTransition();

  /* ── Preview ── */
  async function openPreview(file: FileRow) {
    setPreview(file);
    // Get a signed URL for preview via the /d/[id] proxy
    if (file.public_url) {
      setPreviewUrl(file.public_url);
    } else {
      // For private files, use the proxy route
      setPreviewUrl(`/d/${file.id}`);
    }
  }

  /* ── CRUD helpers ── */
  async function togglePublic(id: string, current: boolean) {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: !current }),
    });
    if (res.ok) {
      const { file } = await res.json();
      setFiles(prev => prev.map(f => f.id === id ? { ...f, is_public: !current, public_url: file?.public_url ?? f.public_url } : f));
    } else {
      toast.error('Update failed.');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await fetch(`/api/files/${deleting}`, { method: 'DELETE' });
    if (res.ok) {
      setFiles(prev => prev.filter(f => f.id !== deleting));
      if (preview?.id === deleting) setPreview(null);
      toast.success('File deleted.');
    } else {
      toast.error('Delete operation failed.');
    }
    setDeleting(null);
  }

  function handleUploaded(file: Record<string, unknown>) {
    startTransition(() => setFiles(prev => [file as unknown as FileRow, ...prev]));
    setUploadOpen(false);
    toast.success(`"${file.display_name}" uploaded.`);
  }

  async function moveFile(id: string, direction: 'up' | 'down') {
    const idx = files.findIndex(f => f.id === id);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === files.length - 1) return;

    const newFiles = [...files];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const tmp = newFiles[idx]!;
    newFiles[idx] = newFiles[swapIdx]!;
    newFiles[swapIdx] = tmp;

    const idAtIdx   = newFiles[idx]!.id;
    const idAtSwap  = newFiles[swapIdx]!.id;

    setFiles(newFiles.map((f, i) => ({ ...f, sort_order: (i + 1) * 10 })));

    await Promise.all([
      fetch(`/api/files/${idAtIdx}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: (idx + 1) * 10 }),
      }),
      fetch(`/api/files/${idAtSwap}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: (swapIdx + 1) * 10 }),
      }),
    ]);
  }

  async function updateBlurPages(id: string, pages: number[] | null) {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blurred_pages: pages }),
    });
    if (res.ok) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, blurred_pages: pages } : f));
      toast.success('Blur pages updated.');
    } else {
      toast.error('Update failed.');
    }
  }

  async function updateDocumentDate(id: string, date: string | null) {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_date: date }),
    });
    if (res.ok) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, document_date: date } : f));
      toast.success('Document date updated.');
    } else {
      toast.error('Update failed.');
    }
  }

  async function updateDisplayName(id: string, newName: string) {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: newName, metadata: { slug: newName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') } }),
    });
    if (res.ok) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, display_name: newName } : f));
      toast.success('Name updated.');
    } else {
      toast.error('Rename failed.');
    }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setUploadOpen(true)}>
          <Upload size={15} className="mr-2" /> Upload File
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20">Order</TableHead>
              <TableHead className="w-24">Blur Pages</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No files uploaded yet.
                </TableCell>
              </TableRow>
            )}
            {files.map((file, idx) => (
              <TableRow
                key={file.id}
                className={cn('cursor-pointer', preview?.id === file.id && 'bg-muted/50')}
                onClick={() => openPreview(file)}
              >
                <TableCell onClick={e => e.stopPropagation()}>
                  <EditableName
                    value={file.display_name}
                    onSave={v => updateDisplayName(file.id, v)}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{file.file_type.toUpperCase()}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{formatSize(file.file_size_bytes)}</TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <DatePicker
                    value={file.document_date ?? undefined}
                    onChange={(d) => updateDocumentDate(file.id, d ?? null)}
                    placeholder={formatDate(file.created_at)}
                    className="h-7 text-xs w-32 border-0 shadow-none hover:bg-muted/50"
                  />
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={file.is_public}
                      onCheckedChange={() => togglePublic(file.id, file.is_public)}
                      aria-label="Public toggle"
                    />
                    {file.is_public
                      ? <Globe size={13} className="text-green-600" />
                      : <Lock size={13} className="text-muted-foreground" />}
                  </div>
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => moveFile(file.id, 'up')}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-accent disabled:opacity-30 transition-colors"
                      aria-label="Move up"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      onClick={() => moveFile(file.id, 'down')}
                      disabled={idx === files.length - 1}
                      className="p-1 rounded hover:bg-accent disabled:opacity-30 transition-colors"
                      aria-label="Move down"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  {file.file_type === 'pdf' ? (
                    <div className="flex items-center gap-1.5">
                      {file.blurred_pages && file.blurred_pages.length > 0 ? (
                        <Badge variant="secondary" className="text-[10px]">
                          <EyeOff size={10} className="mr-1" />
                          {file.blurred_pages.length} page{file.blurred_pages.length > 1 ? 's' : ''}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">–</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">–</span>
                  )}
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openPreview(file)}>
                        <Eye size={13} className="mr-2" /> Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleting(file.id)}
                      >
                        <Trash2 size={13} className="mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── File Preview Sheet ── */}
      <Sheet open={!!preview} onOpenChange={open => { if (!open) { setPreview(null); setPreviewUrl(null); } }}>
        <SheetContent className="sm:max-w-xl lg:max-w-2xl 2xl:max-w-4xl w-full p-0 flex flex-col">
          {preview && (
            <>
              <SheetHeader className="px-6 py-4 border-b shrink-0">
                <SheetTitle className="text-base">{preview.display_name}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">{preview.file_type.toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground">{formatSize(preview.file_size_bytes)}</span>
                  <span className="text-xs text-muted-foreground">
                    {preview.document_date ? formatDate(preview.document_date) : formatDate(preview.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/d/${preview.id}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={13} className="mr-1.5" /> Open
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/d/${preview.id}?dl=1`}>
                      <Download size={13} className="mr-1.5" /> Download
                    </a>
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">Document date:</span>
                  <DatePicker
                    value={preview.document_date ?? undefined}
                    onChange={(d) => {
                      updateDocumentDate(preview.id, d ?? null);
                      setPreview(prev => prev ? { ...prev, document_date: d ?? null } : null);
                    }}
                    placeholder="Set date"
                    className="h-7 text-xs"
                  />
                </div>
              </SheetHeader>

              {/* Preview content */}
              <div className="flex-1 overflow-hidden">
                <FilePreview file={preview} url={previewUrl} />
              </div>

              {/* Blur page picker for PDFs */}
              {preview.file_type === 'pdf' && previewUrl && (
                <div className="border-t px-6 py-4 shrink-0">
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <EyeOff size={14} /> Blur Pages
                    {preview.blurred_pages && preview.blurred_pages.length > 0 && (
                      <span className="text-muted-foreground font-normal">({preview.blurred_pages.length} selected)</span>
                    )}
                  </p>
                  <div className="max-h-32 overflow-auto">
                    <PdfPagePicker
                      url={previewUrl}
                      selected={preview.blurred_pages ?? []}
                      onSelect={(pages) => {
                        updateBlurPages(preview.id, pages.length > 0 ? pages : null);
                        setPreview(prev => prev ? { ...prev, blurred_pages: pages.length > 0 ? pages : null } : null);
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this file? It will no longer be visible in the public area.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FileUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} />
    </>
  );
}

/* ── File preview renderer ── */
function FilePreview({ file, url }: { file: FileRow; url: string | null }) {
  if (!url) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading preview...</p>
      </div>
    );
  }

  if (file.file_type === 'pdf') {
    return <iframe src={url} title={file.display_name} className="w-full h-full border-0" />;
  }

  if (file.file_type === 'pptx') {
    const googleViewer = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    return <iframe src={googleViewer} title={file.display_name} className="w-full h-full border-0" />;
  }

  if (file.file_type === 'image') {
    return (
      <div className="flex items-center justify-center h-full p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={file.display_name} className="max-w-full max-h-full object-contain rounded-lg shadow" />
      </div>
    );
  }

  if (file.file_type === 'docx') {
    return <DocxViewer url={url} />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <p className="text-muted-foreground text-sm">This file type cannot be previewed.</p>
      <Button variant="outline" asChild>
        <a href={`/d/${file.id}?dl=1`}>
          <Download size={14} className="mr-2" /> Download File
        </a>
      </Button>
    </div>
  );
}
