'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface ImagePreviewModalProps {
  src: string | null;
  alt: string;
  onClose: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export function ImagePreviewModal({ src, alt, onClose }: ImagePreviewModalProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const clampZoom = useCallback((z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)), []);

  // Reset on image change
  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset */
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [src]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Zoom toward cursor position
  const zoomAtPoint = useCallback((newZoom: number, clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    // Cursor position relative to container center
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;

    setZoom(prevZoom => {
      const clamped = clampZoom(newZoom);
      const ratio = 1 - clamped / prevZoom;
      setPan(prevPan => ({
        x: prevPan.x + (cx - prevPan.x) * ratio,
        y: prevPan.y + (cy - prevPan.y) * ratio,
      }));
      return clamped;
    });
  }, [clampZoom]);

  // Global wheel listener (capture phase to beat Radix scroll lock)
  useEffect(() => {
    if (!src) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        zoomAtPoint(zoom + delta, e.clientX, e.clientY);
      }
    }

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', handleWheel, { capture: true });
  }, [src, zoom, zoomAtPoint]);

  // Mouse drag to pan
  function handleMouseDown(e: React.MouseEvent) {
    if (zoom <= 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }

  function handleMouseUp() {
    setDragging(false);
  }

  function handleReset() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  return (
    <Dialog open={!!src} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-4xl p-0 bg-black/95 border-none overflow-hidden">
        {/* Toolbar */}
        <div className="absolute top-2 right-10 z-10 flex items-center gap-1 bg-black/60 rounded-lg px-2 py-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => setZoom(prev => clampZoom(prev - ZOOM_STEP))}
            disabled={zoom <= MIN_ZOOM}
          >
            <ZoomOut size={14} />
          </Button>
          <span className="text-[11px] text-white/70 w-10 text-center select-none">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => setZoom(prev => clampZoom(prev + ZOOM_STEP))}
            disabled={zoom >= MAX_ZOOM}
          >
            <ZoomIn size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
            onClick={handleReset}
            disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
          >
            <RotateCcw size={13} />
          </Button>
        </div>

        {/* Image container */}
        <div
          ref={containerRef}
          className={cn(
            'flex items-center justify-center min-h-[60vh] max-h-[90vh] overflow-hidden select-none',
            zoom > 1 ? 'cursor-grab' : 'cursor-default',
            dragging && 'cursor-grabbing',
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={e => {
            if (zoom === 1) {
              zoomAtPoint(2, e.clientX, e.clientY);
            } else {
              handleReset();
            }
          }}
        >
          {src && (
            <Image
              src={src}
              alt={alt}
              width={1200}
              height={800}
              className="max-h-[85vh] object-contain rounded pointer-events-none"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transition: dragging ? 'none' : 'transform 0.15s ease-out',
              }}
              draggable={false}
            />
          )}
        </div>

        {/* Hint */}
        <p className="text-[10px] text-white/30 text-center pb-2 select-none">
          Ctrl/Cmd + Scroll to zoom · Double-click to toggle · Drag to pan
        </p>
      </DialogContent>
    </Dialog>
  );
}
