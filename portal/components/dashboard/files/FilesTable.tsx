'use client';

import { useState, useTransition } from 'react';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2, Globe, Lock, Upload, ArrowUp, ArrowDown, EyeOff } from 'lucide-react';
import { toast }      from 'sonner';
import { FileUploadDialog } from './FileUploadDialog';

interface FileRow {
  id:              string;
  display_name:    string;
  name:            string;
  file_type:       string;
  file_size_bytes: number;
  is_public:       boolean;
  public_url:      string;
  metadata:        Record<string, unknown>;
  created_at:      string;
  deleted_at:      string | null;
  blurred_page:    number | null;
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

export function FilesTable({ files: initial }: FilesTableProps) {
  const [files, setFiles]           = useState<FileRow[]>(initial);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [, startTransition]         = useTransition();

  async function togglePublic(id: string, current: boolean) {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: !current }),
    });
    if (res.ok) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, is_public: !current } : f));
    } else {
      toast.error('Update failed.');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await fetch(`/api/files/${deleting}`, { method: 'DELETE' });
    if (res.ok) {
      setFiles(prev => prev.filter(f => f.id !== deleting));
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

  async function updateBlurPage(id: string, page: number | null) {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blurred_page: page }),
    });
    if (res.ok) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, blurred_page: page } : f));
      toast.success('Blur page updated.');
    } else {
      toast.error('Update failed.');
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
              <TableHead className="w-24">Blur Page</TableHead>
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
              <TableRow key={file.id}>
                <TableCell className="font-medium max-w-xs truncate">{file.display_name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{file.file_type.toUpperCase()}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{formatSize(file.file_size_bytes)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{formatDate(file.created_at)}</TableCell>
                <TableCell>
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
                <TableCell>
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
                <TableCell>
                  {file.file_type === 'pdf' ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        defaultValue={file.blurred_page ?? ''}
                        placeholder="–"
                        className="w-14 h-7 text-xs border rounded px-2 bg-background"
                        onBlur={e => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : null;
                          if (val !== file.blurred_page) updateBlurPage(file.id, val);
                        }}
                      />
                      {file.blurred_page && <EyeOff size={12} className="text-muted-foreground" />}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">–</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
