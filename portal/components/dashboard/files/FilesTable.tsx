'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { MoreHorizontal, Trash2, Globe, Lock, Upload, GripVertical, EyeOff, Eye, Download, ExternalLink, Pencil } from 'lucide-react';
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

const CATEGORIES = [
  { value: 'general',      label: 'General' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'report',       label: 'Report' },
  { value: 'form',         label: 'Form' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'guideline',    label: 'Guideline' },
  { value: 'other',        label: 'Other' },
] as const;


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
  category:        string | null;
  description:     string | null;
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
function EditableName({ value, onSave }: { value: string; onSave: (v: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(trimmed);
    setSaving(false);
    if (ok) {
      setEditing(false);
    } else {
      setDraft(value);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        disabled={saving}
        className="w-full h-7 text-sm border rounded px-2 bg-background font-medium disabled:opacity-50"
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

/* ── Inline editable description ── */
function EditableDescription({ value, onSave }: { value: string; onSave: (v: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);
  const [saving,  setSaving]  = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  async function commit() {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) setEditing(false);
    else { setDraft(value); setEditing(false); }
  }

  if (editing) {
    return (
      <div className="mt-1 space-y-1">
        <textarea
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          disabled={saving}
          rows={3}
          className="w-full text-xs border rounded-md px-2 py-1.5 bg-background resize-none outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          placeholder="Add a description…"
        />
        <div className="flex gap-2">
          <button
            onClick={commit}
            disabled={saving}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setDraft(value); setEditing(false); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-start gap-1 mt-1 text-left w-full"
      title="Click to edit description"
    >
      {value ? (
        <span className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{value}</span>
      ) : (
        <span className="text-xs text-muted-foreground/50 italic">Add a description…</span>
      )}
      <Pencil size={10} className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

/* ── Sortable table row ── */
interface SortableRowProps {
  file:           FileRow;
  isPreview:      boolean;
  onOpenPreview:  (f: FileRow) => void;
  onTogglePublic: (id: string, current: boolean) => void;
  onUpdateName:   (id: string, v: string) => Promise<boolean>;
  onUpdateDate:   (id: string, d: string | null) => void;
  onDelete:       (id: string) => void;
}

function SortableRow({
  file, isPreview, onOpenPreview, onTogglePublic, onUpdateName, onUpdateDate, onDelete,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    position: 'relative',
    zIndex:   isDragging ? 10 : undefined,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn('cursor-pointer', isPreview && 'bg-muted/50', isDragging && 'bg-muted shadow-md')}
      onClick={() => onOpenPreview(file)}
    >
      {/* Drag handle */}
      <TableCell className="w-8 px-2" onClick={e => e.stopPropagation()}>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
      </TableCell>

      {/* Name */}
      <TableCell onClick={e => e.stopPropagation()}>
        <EditableName value={file.display_name} onSave={v => onUpdateName(file.id, v)} />
      </TableCell>

      {/* Type + Category */}
      <TableCell>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary">{file.file_type.toUpperCase()}</Badge>
          {file.category && file.category !== 'general' && (
            <Badge variant="outline" className="text-[10px] px-1.5 capitalize">{file.category}</Badge>
          )}
        </div>
      </TableCell>

      {/* Size */}
      <TableCell className="text-muted-foreground text-sm">{formatSize(file.file_size_bytes)}</TableCell>

      {/* Date */}
      <TableCell onClick={e => e.stopPropagation()}>
        <DatePicker
          value={file.document_date ?? undefined}
          onChange={d => onUpdateDate(file.id, d ?? null)}
          placeholder={formatDate(file.created_at)}
          className="h-7 text-xs w-32 border-0 shadow-none hover:bg-muted/50"
        />
      </TableCell>

      {/* Public toggle */}
      <TableCell onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Switch
            checked={file.is_public}
            onCheckedChange={() => onTogglePublic(file.id, file.is_public)}
            aria-label="Public toggle"
          />
          {file.is_public
            ? <Globe size={13} className="text-green-600" />
            : <Lock  size={13} className="text-muted-foreground" />}
        </div>
      </TableCell>

      {/* Blur pages badge */}
      <TableCell onClick={e => e.stopPropagation()}>
        {file.file_type === 'pdf' && file.blurred_pages && file.blurred_pages.length > 0 ? (
          <Badge variant="secondary" className="text-[10px]">
            <EyeOff size={10} className="mr-1" />
            {file.blurred_pages.length} page{file.blurred_pages.length > 1 ? 's' : ''}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">–</span>
        )}
      </TableCell>

      {/* Actions */}
      <TableCell onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onOpenPreview(file)}>
              <Eye size={13} className="mr-2" /> Preview
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(file.id)}
            >
              <Trash2 size={13} className="mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export function FilesTable({ files: initial }: FilesTableProps) {
  const [files, setFiles]           = useState<FileRow[]>(initial);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview]       = useState<FileRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [, startTransition]         = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = files.findIndex(f => f.id === active.id);
    const newIdx = files.findIndex(f => f.id === over.id);
    const reordered = arrayMove(files, oldIdx, newIdx).map((f, i) => ({ ...f, sort_order: (i + 1) * 10 }));
    setFiles(reordered);

    // Persist only the changed items
    reordered.forEach((f, i) => {
      if (files[i]?.id !== f.id) {
        fetch(`/api/files/${f.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ sort_order: f.sort_order }),
        });
      }
    });
  }

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

  async function updateCategory(id: string, category: string) {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });
    if (res.ok) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f));
      setPreview(prev => prev?.id === id ? { ...prev, category } : prev);
      toast.success('Category updated.');
    } else {
      toast.error('Update failed.');
    }
  }

  async function updateDescription(id: string, description: string): Promise<boolean> {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description || null }),
    });
    if (res.ok) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, description: description || null } : f));
      setPreview(prev => prev?.id === id ? { ...prev, description: description || null } : prev);
      toast.success('Description updated.');
      return true;
    }
    toast.error('Update failed.');
    return false;
  }

  async function updateDisplayName(id: string, newName: string): Promise<boolean> {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: newName, metadata: { slug: newName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') } }),
    });
    if (res.ok) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, display_name: newName } : f));
      toast.success('Name updated.');
      return true;
    }
    toast.error('Rename failed.');
    return false;
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
              <TableHead className="w-8" />
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Blur Pages</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={files.map(f => f.id)} strategy={verticalListSortingStrategy}>
              <TableBody>
                {files.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No files uploaded yet.
                    </TableCell>
                  </TableRow>
                )}
                {files.map(file => (
                  <SortableRow
                    key={file.id}
                    file={file}
                    isPreview={preview?.id === file.id}
                    onOpenPreview={openPreview}
                    onTogglePublic={togglePublic}
                    onUpdateName={updateDisplayName}
                    onUpdateDate={updateDocumentDate}
                    onDelete={id => setDeleting(id)}
                  />
                ))}
              </TableBody>
            </SortableContext>
          </DndContext>
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

                {/* Category */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground shrink-0">Category:</span>
                  <select
                    value={preview.category ?? 'general'}
                    onChange={e => updateCategory(preview.id, e.target.value)}
                    className="h-7 text-xs rounded-md border border-input bg-background px-2 pr-6 text-foreground outline-none focus:ring-1 focus:ring-ring"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground">Description:</span>
                  <EditableDescription
                    value={preview.description ?? ''}
                    onSave={v => updateDescription(preview.id, v)}
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
