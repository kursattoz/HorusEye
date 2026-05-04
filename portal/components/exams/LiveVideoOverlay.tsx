'use client';

// BL-118 — Renders the latest annotated JPEG frame from the AI service
// with detection bboxes overlaid on a canvas. Severity colors mirror
// the incident severity palette in LiveMonitor.

import { useEffect, useRef } from 'react';
import type { ServerFrame } from '@/types/ai';

interface LiveVideoOverlayProps {
  frame: ServerFrame | null;
}

const CLASS_COLORS: Record<string, string> = {
  'cell phone': '#ef4444',  // red
  'laptop':     '#f59e0b',  // amber
  'book':       '#f59e0b',
  'keyboard':   '#f59e0b',
  'person':     '#10b981',  // green (informational)
};

const DEFAULT_COLOR = '#3b82f6'; // blue

export function LiveVideoOverlay({ frame }: LiveVideoOverlayProps) {
  const imgRef    = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!frame) return;
    const img    = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    img.src = `data:image/jpeg;base64,${frame.jpeg_base64}`;
    img.onload = () => {
      canvas.width  = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw detection boxes
      ctx.lineWidth = 2;
      ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'top';

      for (const det of frame.detections) {
        const [x1, y1, x2, y2] = det.bbox;
        const px1 = x1 * frame.width;
        const py1 = y1 * frame.height;
        const px2 = x2 * frame.width;
        const py2 = y2 * frame.height;

        const color = CLASS_COLORS[det.detection_class] ?? DEFAULT_COLOR;
        ctx.strokeStyle = color;
        ctx.fillStyle   = color;

        // Box
        ctx.strokeRect(px1, py1, px2 - px1, py2 - py1);

        // Label background + text
        const label = `${det.detection_class} ${(det.confidence * 100).toFixed(0)}%`;
        const metrics = ctx.measureText(label);
        const labelH  = 14;
        const labelW  = metrics.width + 8;
        ctx.fillRect(px1, py1 - labelH, labelW, labelH);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, px1 + 4, py1 - labelH + 1);
      }
    };
  }, [frame]);

  if (!frame) {
    return (
      <p className="text-xs text-muted-foreground p-4 text-center">
        Awaiting first frame…
      </p>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Hidden img — used as the canvas source so we control sizing */}
      <img ref={imgRef} alt="" className="hidden" />
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
      />
      <div className="absolute bottom-2 left-2 text-[10px] font-mono text-white/80 bg-black/40 px-2 py-0.5 rounded">
        {frame.width}×{frame.height} · cam {frame.camera_id.slice(0,8)} · {frame.detections.length} det
      </div>
    </div>
  );
}
