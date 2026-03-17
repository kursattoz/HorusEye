'use client';

import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { EyeOff } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPagePickerProps {
  file:         File;
  selected:     number | null; // 1-indexed selected page to blur, null = none
  onSelect:     (page: number | null) => void;
}

export function PdfPagePicker({ file, selected, onSelect }: PdfPagePickerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [url] = useState(() => URL.createObjectURL(file));

  const onLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Select a page to blur (hides sensitive content from viewers). Click again to deselect.
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Document file={url} onLoadSuccess={onLoadSuccess} loading={
          <p className="text-xs text-muted-foreground py-4">Loading pages...</p>
        }>
          {pages.map(pageNum => {
            const isSelected = selected === pageNum;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => onSelect(isSelected ? null : pageNum)}
                className={`relative shrink-0 rounded border-2 overflow-hidden transition-all ${
                  isSelected ? 'border-primary' : 'border-border hover:border-primary/50'
                }`}
              >
                <Page
                  pageNumber={pageNum}
                  width={90}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
                <div className="absolute bottom-0 left-0 right-0 text-center text-[9px] bg-black/60 text-white py-0.5">
                  {pageNum}
                </div>
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <div className="bg-primary rounded-full p-0.5">
                      <EyeOff size={10} className="text-primary-foreground" />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </Document>
      </div>
      {selected && (
        <p className="text-xs text-primary">Page {selected} will be blurred for viewers.</p>
      )}
    </div>
  );
}
