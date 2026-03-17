'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  FileText, FileImage, Presentation, Search,
  Download, ExternalLink, BookOpen, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PublicFile } from '@/components/public/FileTree';

const PdfViewer = dynamic(
  () => import('@/components/public/PdfViewer').then(m => ({ default: m.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="h-6 w-6 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
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
  pdf:   'text-red-400',
  pptx:  'text-orange-400',
  docx:  'text-blue-400',
  image: 'text-green-400',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface LoginDocPanelProps {
  files: PublicFile[];
}

export function LoginDocPanel({ files }: LoginDocPanelProps) {
  const [selected, setSelected] = useState<PublicFile | null>(files[0] ?? null);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(false);

  const filtered = search
    ? files.filter(f => f.display_name.toLowerCase().includes(search.toLowerCase()))
    : files;

  function handleSelect(file: PublicFile) {
    if (file.id === selected?.id) return;
    setLoading(true);
    setSelected(file);
  }

  return (
    /* Force dark theme variables inside this panel */
    <div className="dark h-full flex items-center justify-center p-3 md:p-6 lg:p-8">
      {/* Floating card */}
      <div className="w-full max-w-3xl h-[min(700px,calc(100svh-3rem))] rounded-2xl overflow-hidden flex flex-col bg-zinc-900 border border-zinc-700/60 shadow-[0_32px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/5">

        {/* Card header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0 bg-zinc-950/60">
          <div className="h-6 w-6 rounded-md bg-white/10 border border-white/10 flex items-center justify-center text-white font-bold text-xs">
            H
          </div>
          <span className="text-sm font-semibold text-zinc-100">Document Hub</span>
          <span className="ml-auto text-xs text-zinc-500">{files.length} document{files.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

          {/* Left — file list */}
          <div className="w-full md:w-56 shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-950/30 max-h-44 md:max-h-none">
            {/* Search */}
            <div className="p-2.5 border-b border-zinc-800">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-md bg-zinc-800 border border-zinc-700 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-zinc-500"
                />
              </div>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {filtered.length === 0 && (
                <p className="text-center text-xs text-zinc-500 py-8">
                  {search ? 'No results found.' : 'No documents yet.'}
                </p>
              )}
              {filtered.map(file => {
                const Icon  = FILE_ICONS[file.file_type] ?? FileText;
                const color = FILE_TYPE_COLORS[file.file_type] ?? 'text-zinc-400';
                const active = selected?.id === file.id;
                return (
                  <button
                    key={file.id}
                    onClick={() => handleSelect(file)}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-all group',
                      active
                        ? 'bg-white/10 text-zinc-100'
                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                    )}
                  >
                    <Icon size={13} className={cn('shrink-0 mt-0.5', active ? color : 'text-zinc-600 group-hover:' + color)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate font-medium leading-tight', active ? 'text-zinc-100' : 'text-zinc-300')}>
                        {file.display_name}
                      </p>
                      <p className="text-zinc-600 text-[10px] mt-0.5">{formatDate(file.created_at)}</p>
                    </div>
                    {active && <ChevronRight size={10} className="shrink-0 mt-1 text-zinc-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right — preview */}
          <div className="flex flex-1 flex-col overflow-hidden bg-zinc-950/20">
            {selected ? (
              <>
                {/* Preview header */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{selected.display_name}</p>
                    {selected.description && (
                      <p className="text-[10px] text-zinc-500 truncate mt-0.5">{selected.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium uppercase">
                      {selected.file_type}
                    </span>
                    <a
                      href={selected.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-800"
                    >
                      <ExternalLink size={10} /> Open
                    </a>
                    <a
                      href={selected.public_url}
                      download
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-800"
                    >
                      <Download size={10} /> Download
                    </a>
                  </div>
                </div>

                {/* Viewer */}
                <div className="flex-1 relative overflow-hidden">
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 z-10">
                      <div className="h-6 w-6 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
                    </div>
                  )}
                  <DocViewer file={selected} onLoad={() => setLoading(false)} />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                <div className="h-12 w-12 rounded-xl bg-zinc-800 flex items-center justify-center">
                  <BookOpen size={20} className="text-zinc-500" />
                </div>
                <p className="text-sm font-medium text-zinc-400">Select a document</p>
                <p className="text-xs text-zinc-600">Choose a document from the list on the left to preview it.</p>
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
      <p className="text-xs text-zinc-500">This file cannot be previewed in the browser.</p>
      <a
        href={public_url}
        download
        className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-md transition-colors"
      >
        <Download size={12} /> Download File
      </a>
    </div>
  );
}
