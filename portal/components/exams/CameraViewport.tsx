'use client';

// PRD-019 §6.4 — Camera viewport with zoom (mouse wheel + buttons),
// rotation (90° increments), pan (click-drag while zoomed) and a reset.
// Wraps LiveVideoOverlay so the bbox overlays transform with the JPEG.

import { useCallback, useRef, useState } from 'react';
import {
  RotateCw, RotateCcw, ZoomIn, ZoomOut, Maximize2, Move,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiveVideoOverlay } from '@/components/exams/LiveVideoOverlay';
import type { ServerFrame } from '@/types/ai';

interface Props {
  frame: ServerFrame | null;
  label?: string;
  stale?: boolean;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.25;
const ROTATIONS = [0, 90, 180, 270] as const;

export function CameraViewport({ frame, label, stale }: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState<typeof ROTATIONS[number]>(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const reset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  const setZoomClamped = useCallback((next: number) => {
    setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next)));
    if (next <= 1) setPan({ x: 0, y: 0 });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    setZoomClamped(zoom + dir * ZOOM_STEP);
  }, [zoom, setZoomClamped]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, [zoom, pan]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({
      x: drag.panX + (e.clientX - drag.startX),
      y: drag.panY + (e.clientY - drag.startY),
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    setDragging(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  const rotate = useCallback((dir: 1 | -1) => {
    setRotation(prev => {
      const idx = ROTATIONS.indexOf(prev);
      const next = ROTATIONS[(idx + dir + ROTATIONS.length) % ROTATIONS.length];
      return next ?? 0;
    });
  }, []);

  // Compose CSS transform — rotate first, then scale, then translate.
  const transform = `rotate(${rotation}deg) scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`;
  const transformed = zoom !== 1 || rotation !== 0 || pan.x !== 0 || pan.y !== 0;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={containerRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex-1 min-h-0 bg-black overflow-hidden flex items-center justify-center select-none"
        style={{ cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <div
          className="w-full h-full transition-transform duration-150 ease-out flex items-center justify-center"
          style={{ transform, transformOrigin: 'center center' }}
        >
          <LiveVideoOverlay frame={frame} showBbox label={label} stale={stale} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="border-t bg-card/80 backdrop-blur px-3 py-1.5 flex items-center gap-1 text-xs">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoomClamped(zoom + ZOOM_STEP)} title="Zoom in">
          <ZoomIn size={14} />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoomClamped(zoom - ZOOM_STEP)} title="Zoom out">
          <ZoomOut size={14} />
        </Button>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => rotate(-1)} title="Rotate left 90°">
          <RotateCcw size={14} />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => rotate(1)} title="Rotate right 90°">
          <RotateCw size={14} />
        </Button>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-8 text-center">
          {rotation}°
        </span>
        <span className="ml-1 text-[10px] text-muted-foreground hidden sm:inline-flex items-center gap-1">
          {zoom > 1 && (<><Move size={10} /> sürükle · </>)}wheel = zoom
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 ml-auto"
          onClick={reset}
          disabled={!transformed}
          title="Reset view"
        >
          <Maximize2 size={12} /> Reset
        </Button>
      </div>
    </div>
  );
}
