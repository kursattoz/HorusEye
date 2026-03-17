'use client';

import { useState } from 'react';
import { FileTree, type PublicFile } from './FileTree';
import { DocumentViewer }            from './DocumentViewer';
import { useRouter, usePathname }    from 'next/navigation';
import { routes }                    from '@/constants/routes';

interface PublicLayoutProps {
  files:        PublicFile[];
  initialFile?: PublicFile | null;
}

export function PublicLayout({ files, initialFile }: PublicLayoutProps) {
  const [selected, setSelected] = useState<PublicFile | null>(initialFile ?? null);
  const router   = useRouter();
  const pathname = usePathname();

  function handleSelect(file: PublicFile) {
    setSelected(file);
    const slug = file.slug ?? file.id;
    if (pathname !== `/docs/${slug}`) {
      router.push(routes.docs(slug), { scroll: false });
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-64 border-r flex flex-col shrink-0 overflow-hidden">
        <FileTree files={files} selectedId={selected?.id ?? null} onSelect={handleSelect} />
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-hidden">
        <DocumentViewer file={selected} />
      </div>
    </div>
  );
}
