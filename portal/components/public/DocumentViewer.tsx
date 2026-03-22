'use client';

import { useState, useEffect } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn }             from '@/lib/utils';
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
          <h2 className="text-xl font-semibold">HorusEye Document Hub</h2>
          <p className="text-muted-foreground text-sm mt-1 max-w-md">
            Select a document from the left panel to view it.
            All documents are publicly accessible — no login required.
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
            <ExternalLink size={14} className="mr-1.5" /> Open
          </a>
          <a
            href={file.public_url}
            download
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <Download size={14} className="mr-1.5" /> Download
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

function DocxViewer({ url, title }: { url: string; title: string }) {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function convert() {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const mammoth = (await import('mammoth')).default;
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) {
          setHtml(result.value);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document');
          setLoading(false);
        }
      }
    }
    convert();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6 lg:p-10">
      <article
        className="prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
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

  if (file_type === 'docx') {
    return <DocxViewer url={public_url} title={display_name} />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <p className="text-muted-foreground text-sm">This file cannot be previewed in the browser.</p>
      <a href={public_url} download className={cn(buttonVariants())}>
        <Download size={14} className="mr-2" /> Download File
      </a>
    </div>
  );
}
