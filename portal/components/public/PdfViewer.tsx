'use client';

import { useState, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, Loader2, EyeOff, AlertTriangle, Download, RotateCcw } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url:         string;
  fileName?:   string;
  blurredPages?: number[] | null; // 1-indexed pages to blur
  className?:  string;
}

export function PdfViewer({ url, fileName, blurredPages, className }: PdfViewerProps) {
  const [numPages,    setNumPages]    = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [retryKey,    setRetryKey]    = useState(0);
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    setLoading(false);
    setError(err?.message ?? 'Unknown error');
    // Log to error_logs via API (fire-and-forget)
    fetch('/api/log/pdf-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileUrl:  url,
        fileName: fileName ?? url.split('/').pop() ?? 'unknown',
        errorMsg: err?.message ?? 'Unknown error',
      }),
    }).catch(() => {});
  }, [url, fileName]);

  const width = containerRef?.clientWidth ?? 600;

  const isBlurred = blurredPages != null && blurredPages.includes(currentPage);

  function handleRetry() {
    setError(null);
    setLoading(true);
    setNumPages(0);
    setCurrentPage(1);
    setRetryKey(k => k + 1);
  }

  // Keyboard navigation: arrow left/right
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPage(p => Math.max(1, p - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentPage(p => Math.min(numPages || p, p + 1));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages]);

  return (
    <div ref={setContainerRef} className={`flex flex-col h-full bg-zinc-950 ${className ?? ''}`}>
      {/* PDF Document */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center py-4 px-2 relative">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-6 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10">
              <AlertTriangle className="h-7 w-7 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-200">PDF görüntülenemiyor</p>
              <p className="text-xs text-zinc-500 mt-1">
                Dosya yüklenirken bir hata oluştu. Lütfen tekrar deneyin veya dosyayı indirin.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRetry}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800')}
              >
                <RotateCcw size={14} className="mr-1.5" /> Retry
              </button>
              <a
                href={url}
                download
                className={cn(buttonVariants({ size: 'sm' }), 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100')}
              >
                <Download size={14} className="mr-1.5" /> Download PDF
              </a>
            </div>
          </div>
        ) : (
          <Document
            key={retryKey}
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
            error={null}
          >
            <div className="relative">
              <Page
                pageNumber={currentPage}
                width={Math.min(width - 16, 800)}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
              {isBlurred && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded pointer-events-none"
                  style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(0,0,0,0.6)' }}>
                  <EyeOff className="h-8 w-8 text-zinc-300" />
                  <p className="text-sm font-medium text-zinc-200 text-center px-6 max-w-sm">
                    This page has been hidden as it contains sensitive or personal information.
                  </p>
                </div>
              )}
            </div>
          </Document>
        )}
      </div>

      {/* Page navigation */}
      {!error && numPages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-3 border-t border-zinc-800 py-2.5 bg-zinc-950">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-zinc-400">
            Page {currentPage} of {numPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
