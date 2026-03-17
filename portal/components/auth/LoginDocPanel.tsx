'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  FileText, FileImage, Presentation, Search,
  Download, ExternalLink, BookOpen, ChevronRight,
  MessageSquarePlus, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PublicFile } from '@/components/public/FileTree';

const PdfViewer = dynamic(
  () => import('@/components/public/PdfViewer').then(m => ({ default: m.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="h-6 w-6 rounded-full border-2 border-border border-t-foreground/40 animate-spin" />
      </div>
    ),
  }
);

const FILE_ICONS: Record<string, React.ElementType> = {
  pdf:   FileText,
  pptx:  Presentation,
  docx:  FileText,
  image: FileImage,
};

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf:   'text-red-500',
  pptx:  'text-orange-500',
  docx:  'text-blue-500',
  image: 'text-green-500',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface LoginDocPanelProps {
  files: PublicFile[];
}

export function LoginDocPanel({ files }: LoginDocPanelProps) {
  const [selected,    setSelected]    = useState<PublicFile | null>(files[0] ?? null);
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(false);
  const [fbName,      setFbName]      = useState('');
  const [fbContent,   setFbContent]   = useState('');
  const [fbSending,   setFbSending]   = useState(false);
  const [fbSuccess,   setFbSuccess]   = useState(false);

  const filtered = search
    ? files.filter(f => f.display_name.toLowerCase().includes(search.toLowerCase()))
    : files;

  function handleSelect(file: PublicFile) {
    if (file.id === selected?.id) return;
    setLoading(true);
    setSelected(file);
    setFbSuccess(false);
  }

  async function handleFbSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || fbSending) return;
    setFbSending(true);
    try {
      const res = await fetch('/api/public/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: selected.id, author_name: fbName.trim(), content: fbContent.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit.');
      setFbName('');
      setFbContent('');
      setFbSuccess(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit feedback.');
    } finally {
      setFbSending(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center p-3 md:p-6 lg:p-8">
      {/* Floating card */}
      <div className="w-full max-w-3xl h-[min(700px,calc(100svh-3rem))] rounded-2xl overflow-hidden flex flex-col bg-card border border-border shadow-xl">

        {/* Card header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-muted/40">
          <div className="h-6 w-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
            H
          </div>
          <span className="text-sm font-semibold text-foreground">Document Hub</span>
          <span className="ml-auto text-xs text-muted-foreground">{files.length} document{files.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

          {/* Left — file list */}
          <div className="w-full md:w-56 shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-border bg-muted/20 max-h-44 md:max-h-none">
            {/* Search */}
            <div className="p-2.5 border-b border-border">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-md bg-background border border-input pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {filtered.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  {search ? 'No results found.' : 'No documents yet.'}
                </p>
              )}
              {filtered.map(file => {
                const Icon  = FILE_ICONS[file.file_type] ?? FileText;
                const color = FILE_TYPE_COLORS[file.file_type] ?? 'text-muted-foreground';
                const active = selected?.id === file.id;
                return (
                  <button
                    key={file.id}
                    onClick={() => handleSelect(file)}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-all group',
                      active
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    )}
                  >
                    <Icon size={13} className={cn('shrink-0 mt-0.5', active ? color : 'text-muted-foreground/50 group-hover:' + color)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate font-medium leading-tight', active ? 'text-foreground' : 'text-foreground/70')}>
                        {file.display_name}
                      </p>
                      <p className="text-muted-foreground/60 text-[10px] mt-0.5">{formatDate(file.created_at)}</p>
                    </div>
                    {active && <ChevronRight size={10} className="shrink-0 mt-1 text-muted-foreground" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right — preview */}
          <div className="flex flex-1 flex-col overflow-hidden bg-background/50">
            {selected ? (
              <>
                {/* Preview header */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{selected.display_name}</p>
                    {selected.description && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{selected.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium uppercase">
                      {selected.file_type}
                    </span>
                    <a
                      href={selected.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                    >
                      <ExternalLink size={10} /> Open
                    </a>
                    <a
                      href={selected.public_url}
                      download
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                    >
                      <Download size={10} /> Download
                    </a>
                  </div>
                </div>

                {/* Viewer */}
                <div className="flex-1 relative overflow-hidden">
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
                      <div className="h-6 w-6 rounded-full border-2 border-border border-t-foreground/40 animate-spin" />
                    </div>
                  )}
                  <DocViewer file={selected} onLoad={() => setLoading(false)} />
                </div>

                {/* Feedback form */}
                <div className="border-t border-border px-4 py-3 bg-muted/20 shrink-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <MessageSquarePlus size={12} className="text-muted-foreground" />
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Leave Feedback</p>
                  </div>
                  {fbSuccess ? (
                    <p className="text-xs text-green-600 dark:text-green-400 py-1">
                      Thank you! Your feedback has been submitted.
                    </p>
                  ) : (
                    <form onSubmit={handleFbSubmit} className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Your name *"
                          value={fbName}
                          onChange={e => setFbName(e.target.value.slice(0, 100))}
                          maxLength={100}
                          required
                          className="flex-1 min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-[10px] text-muted-foreground self-center">{fbName.length}/100</span>
                      </div>
                      <div>
                        <textarea
                          placeholder="Write your feedback… (10–1000 characters)"
                          value={fbContent}
                          onChange={e => setFbContent(e.target.value.slice(0, 1000))}
                          maxLength={1000}
                          required
                          rows={2}
                          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[10px] text-muted-foreground/60">Plain text only. No HTML or code.</span>
                          <span className="text-[10px] text-muted-foreground">{fbContent.length}/1000</span>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={fbSending || fbName.trim().length < 2 || fbContent.trim().length < 10}
                        className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {fbSending ? <Loader2 size={11} className="animate-spin" /> : null}
                        Submit Feedback
                      </button>
                    </form>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <BookOpen size={20} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Select a document</p>
                <p className="text-xs text-muted-foreground/60">Choose a document from the list on the left to preview it.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DocViewer({ file, onLoad }: { file: PublicFile; onLoad: () => void }) {
  const { file_type, public_url, display_name } = file;

  if (file_type === 'pdf') {
    return <PdfViewer key={public_url} url={public_url} blurredPage={file.blurred_page} />;
  }

  if (file_type === 'pptx') {
    const viewer = `https://docs.google.com/viewer?url=${encodeURIComponent(public_url)}&embedded=true`;
    return (
      <iframe
        key={public_url}
        src={viewer}
        title={display_name}
        className="w-full h-full border-0"
        onLoad={onLoad}
      />
    );
  }

  if (file_type === 'image') {
    return (
      <div className="flex items-center justify-center h-full p-6" onLoad={onLoad}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={public_url}
          alt={display_name}
          className="max-w-full max-h-full object-contain rounded-lg"
          onLoad={onLoad}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <p className="text-xs text-muted-foreground">This file cannot be previewed in the browser.</p>
      <a
        href={public_url}
        download
        className="flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-md transition-colors"
      >
        <Download size={12} /> Download File
      </a>
    </div>
  );
}
