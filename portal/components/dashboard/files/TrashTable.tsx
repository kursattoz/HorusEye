'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface TrashFileRow {
  id: string;
  name: string;
  display_name: string;
  file_type: string;
  file_size_bytes: number;
  deleted_at: string;
  uploaded_by: string;
}

interface TrashTableProps {
  files: TrashFileRow[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function daysUntilPurge(deletedAt: string): number {
  const deleted = new Date(deletedAt);
  const purgeDate = new Date(deleted);
  purgeDate.setDate(purgeDate.getDate() + 30);
  const now = new Date();
  return Math.max(0, Math.ceil((purgeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export function TrashTable({ files: initial }: TrashTableProps) {
  const [files, setFiles] = useState<TrashFileRow[]>(initial);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const filteredFiles = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    if (!q) return files;
    return files.filter(f =>
      f.display_name.toLowerCase().includes(q) ||
      f.name.toLowerCase().includes(q)
    );
  }, [files, debouncedSearch]);

  async function confirmRestore() {
    if (!restoring) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/files/${restoring}/restore`, { method: 'POST' });
      if (res.ok) {
        setFiles(prev => prev.filter(f => f.id !== restoring));
        toast.success('File restored successfully.');
      } else {
        const data = await res.json();
        toast.error(data.error ?? 'Restore failed.');
      }
    } finally {
      setLoading(false);
      setRestoring(null);
    }
  }

  return (
    <>
      {files.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search deleted files..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Deleted At</TableHead>
              <TableHead>Auto-Purge</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFiles.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  {debouncedSearch ? 'No files match your search.' : 'Trash is empty.'}
                </TableCell>
              </TableRow>
            )}
            {filteredFiles.map(file => {
              const remaining = daysUntilPurge(file.deleted_at);
              return (
                <TableRow key={file.id}>
                  <TableCell className="font-medium max-w-xs truncate">
                    {file.display_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{file.file_type.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatSize(file.file_size_bytes)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(file.deleted_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={remaining <= 7 ? 'destructive' : 'outline'} className="text-xs">
                      {remaining} day{remaining !== 1 ? 's' : ''} left
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Restore file"
                      onClick={() => setRestoring(file.id)}
                    >
                      <RotateCcw size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Restore confirm dialog */}
      <Dialog open={!!restoring} onOpenChange={() => setRestoring(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore File</DialogTitle>
            <DialogDescription>
              This file will be moved back to the active files list and will be visible again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoring(null)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={confirmRestore} disabled={loading}>
              {loading ? 'Restoring...' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
