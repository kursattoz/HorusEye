'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoginDocPanel } from './LoginDocPanel';
import type { PublicFile } from '@/components/public/FileTree';

interface LoginDocModalProps {
  files: PublicFile[];
}

export function LoginDocModal({ files }: LoginDocModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="View Documents"
        className="text-muted-foreground hover:text-foreground"
      >
        <FileText className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-4xl h-[90svh] p-0 overflow-hidden bg-zinc-950 border-zinc-800"
          showCloseButton={true}
        >
          <DialogTitle className="sr-only">Document Hub</DialogTitle>
          <div className="h-full">
            <LoginDocPanel files={files} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
