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
import { MoreHorizontal, Trash2, Globe, Lock, Upload } from 'lucide-react';
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
}

interface FilesTableProps {
  files: FileRow[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
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
      toast.error('Güncelleme başarısız.');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await fetch(`/api/files/${deleting}`, { method: 'DELETE' });
    if (res.ok) {
      setFiles(prev => prev.filter(f => f.id !== deleting));
      toast.success('Dosya silindi.');
    } else {
      toast.error('Silme işlemi başarısız.');
    }
    setDeleting(null);
  }

  function handleUploaded(file: Record<string, unknown>) {
    startTransition(() => setFiles(prev => [file as unknown as FileRow, ...prev]));
    setUploadOpen(false);
    toast.success(`"${file.display_name}" yüklendi.`);
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setUploadOpen(true)}>
          <Upload size={15} className="mr-2" /> Dosya Yükle
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>İsim</TableHead>
              <TableHead>Tip</TableHead>
              <TableHead>Boyut</TableHead>
              <TableHead>Tarih</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Henüz dosya yüklenmemiş.
                </TableCell>
              </TableRow>
            )}
            {files.map(file => (
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
                        <Trash2 size={13} className="mr-2" /> Sil
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
            <DialogTitle>Dosyayı Sil</DialogTitle>
            <DialogDescription>
              Bu dosyayı silmek istediğinizden emin misiniz? Public alanda görünmez hale gelir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>İptal</Button>
            <Button variant="destructive" onClick={confirmDelete}>Sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FileUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} />
    </>
  );
}
