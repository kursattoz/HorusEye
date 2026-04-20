'use client';

import { useState, useMemo } from 'react';
import { FileText, FileImage, Presentation, Search, Download } from 'lucide-react';
import { Input }  from '@/components/ui/input';
import { Badge }  from '@/components/ui/badge';
import { cn }     from '@/lib/utils';

type FileTypeFilter = 'all' | 'pdf' | 'pptx' | 'other';

const TYPE_TABS: { key: FileTypeFilter; label: string }[] = [
  { key: 'all',   label: 'All'   },
  { key: 'pdf',   label: 'PDF'   },
  { key: 'pptx',  label: 'PPTX'  },
  { key: 'other', label: 'Other' },
];

export interface PublicFile {
  id:          string;
  display_name: string;
  file_type:   string;
  public_url:  string;
  slug:        string | null;
  category:    string | null;
  description: string | null;
  created_at:  string;
  file_size_bytes?: number;
  blurred_pages?: number[] | null;
  sort_order?:   number | null;
  document_date?: string | null;
}

const FILE_ICONS: Record<string, React.ElementType> = {
  pdf:   FileText,
  pptx:  Presentation,
  docx:  FileText,
  image: FileImage,
};

function FileIcon({ type }: { type: string }) {
  const Icon = FILE_ICONS[type] ?? FileText;
  return <Icon size={15} className="shrink-0 text-muted-foreground" />;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CATEGORY_LABELS: Record<string, string> = {
  reports:       'Reports',
  presentations: 'Presentations',
  documents:     'Documents',
  other:         'Other',
};

interface FileTreeProps {
  files:           PublicFile[];
  selectedId:      string | null;
  onSelect:        (file: PublicFile) => void;
  showTypeFilter?: boolean;
}

export function FileTree({ files, selectedId, onSelect, showTypeFilter = false }: FileTreeProps) {
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return files.filter(f => {
      if (q && !f.display_name.toLowerCase().includes(q)) return false;
      if (typeFilter === 'pdf')   return f.file_type === 'pdf';
      if (typeFilter === 'pptx')  return f.file_type === 'pptx';
      if (typeFilter === 'other') return f.file_type !== 'pdf' && f.file_type !== 'pptx';
      return true;
    });
  }, [files, search, typeFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, PublicFile[]> = {};
    for (const f of filtered) {
      const cat = f.category ?? 'other';
      (map[cat] ??= []).push(f);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {showTypeFilter && (
          <div className="flex gap-1">
            {TYPE_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setTypeFilter(tab.key)}
                className={cn(
                  'flex-1 text-[11px] font-medium py-1 rounded-md transition-colors',
                  typeFilter === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {Object.keys(CATEGORY_LABELS).map(cat => {
          const items = grouped[cat];
          if (!items?.length) return null;
          return (
            <div key={cat}>
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {CATEGORY_LABELS[cat]}
              </p>
              {items.map(file => (
                <button
                  key={file.id}
                  onClick={() => onSelect(file)}
                  className={cn(
                    'w-full flex items-start gap-2 px-2 py-2 rounded-md text-left text-sm transition-colors',
                    selectedId === file.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50 text-foreground'
                  )}
                >
                  <FileIcon type={file.file_type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-xs leading-tight">{file.display_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                        {file.file_type.toUpperCase()}
                      </Badge>
                      {file.file_size_bytes !== undefined && (
                        <span className="text-[10px] text-muted-foreground">{formatSize(file.file_size_bytes)}</span>
                      )}
                    </div>
                  </div>
                  <a
                    href={file.public_url}
                    download
                    onClick={e => e.stopPropagation()}
                    className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-primary"
                    aria-label="Download"
                  >
                    <Download size={13} />
                  </a>
                </button>
              ))}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            {search ? 'No results found.' : 'No published documents yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
