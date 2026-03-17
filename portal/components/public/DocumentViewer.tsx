'use client';

import { Download, ExternalLink } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn }             from '@/lib/utils/cn';
import type { PublicFile } from './FileTree';

interface DocumentViewerProps {
  file: PublicFile | null;
}

export function DocumentViewer({ file }: DocumentViewerProps) {
  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center text-3xl">
          👁️
        </div>
        <div>
          <h2 className="text-xl font-semibold">HorusEye Doküman Merkezi</h2>
          <p className="text-muted-foreground text-sm mt-1 max-w-md">
            Sol panelden bir doküman seçerek görüntüleyebilirsiniz.
            Tüm belgeler kamuya açıktır, giriş yapmanıza gerek yoktur.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div>
          <h2 className="font-medium text-sm">{file.display_name}</h2>
          {file.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{file.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={file.public_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <ExternalLink size={14} className="mr-1.5" /> Aç
          </a>
          <a
            href={file.public_url}
            download
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <Download size={14} className="mr-1.5" /> İndir
          </a>
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1 overflow-hidden">
        <FileRenderer file={file} />
      </div>
    </div>
  );
}

function FileRenderer({ file }: { file: PublicFile }) {
  const { file_type, public_url, display_name } = file;

  if (file_type === 'pdf') {
    return (
      <iframe
        src={public_url}
        title={display_name}
        className="w-full h-full border-0"
      />
    );
  }

  if (file_type === 'pptx') {
    const googleViewer = `https://docs.google.com/viewer?url=${encodeURIComponent(public_url)}&embedded=true`;
    return (
      <iframe
        src={googleViewer}
        title={display_name}
        className="w-full h-full border-0"
      />
    );
  }

  if (file_type === 'image') {
    return (
      <div className="flex items-center justify-center h-full p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={public_url}
          alt={display_name}
          className="max-w-full max-h-full object-contain rounded-lg shadow"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <p className="text-muted-foreground text-sm">Bu dosya tarayıcıda görüntülenemiyor.</p>
      <a href={public_url} download className={cn(buttonVariants())}>
        <Download size={14} className="mr-2" /> Dosyayı İndir
      </a>
    </div>
  );
}
