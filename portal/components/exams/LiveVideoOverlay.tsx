'use client';

// PRD-019 §6.4 — Renders the latest annotated JPEG frame from the AI service.
// The JPEG is shown via a plain <img> so the browser handles aspect-ratio
// preservation natively. Bbox overlays are HTML divs with absolute % positions —
// pixel-sharp borders at any container size, no SVG stroke surprises.

import { memo } from 'react';
import type { ServerFrame } from '@/types/ai';

interface LiveVideoOverlayProps {
  frame: ServerFrame | null;
  showBbox?: boolean;
  /** Override the camera id shown in the corner badge. */
  label?: string;
  /** Last frame older than ~10s — show a stale overlay. */
  stale?: boolean;
}

const CLASS_COLORS: Record<string, string> = {
  'cell phone': '#ef4444',
  'laptop':     '#f59e0b',
  'book':       '#f59e0b',
  'keyboard':   '#f59e0b',
  'person':     '#10b981',
};

const DEFAULT_COLOR = '#3b82f6';

function LiveVideoOverlayImpl({ frame, showBbox = true, label, stale = false }: LiveVideoOverlayProps) {
  if (!frame) {
    return (
      <p className="text-xs text-muted-foreground p-4 text-center">
        Awaiting first frame…
      </p>
    );
  }

  const aspect = frame.height > 0 ? `${frame.width} / ${frame.height}` : '16 / 9';

  return (
    <div className="relative w-full h-full max-h-full overflow-hidden flex items-center justify-center bg-black">
      <div className="relative max-w-full max-h-full" style={{ aspectRatio: aspect }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL, no remote image */}
        <img
          src={`data:image/jpeg;base64,${frame.jpeg_base64}`}
          alt=""
          className="block w-full h-full object-contain select-none"
          draggable={false}
        />

        {showBbox && frame.detections.map((det, i) => {
          const [x1, y1, x2, y2] = det.bbox;
          const color = CLASS_COLORS[det.detection_class] ?? DEFAULT_COLOR;
          const w = Math.max(0, x2 - x1);
          const h = Math.max(0, y2 - y1);
          return (
            <div
              key={`box-${i}`}
              className="absolute border-2 rounded-sm pointer-events-none"
              style={{
                left:    `${x1 * 100}%`,
                top:     `${y1 * 100}%`,
                width:   `${w * 100}%`,
                height:  `${h * 100}%`,
                borderColor: color,
                boxShadow: `0 0 0 1px rgba(0,0,0,0.4)`,
              }}
            />
          );
        })}

        {showBbox && frame.detections.map((det, i) => {
          const [x1, y1] = det.bbox;
          const color = CLASS_COLORS[det.detection_class] ?? DEFAULT_COLOR;
          return (
            <div
              key={`lbl-${i}`}
              className="absolute text-[10px] font-mono font-semibold text-white px-1 py-0.5 rounded-sm pointer-events-none whitespace-nowrap"
              style={{
                left:    `${x1 * 100}%`,
                top:     `${y1 * 100}%`,
                background: color,
                transform: 'translateY(-100%)',
              }}
            >
              {det.detection_class} {(det.confidence * 100).toFixed(0)}%
            </div>
          );
        })}

        <div className="absolute bottom-1.5 left-1.5 text-[10px] font-mono text-white/80 bg-black/50 px-1.5 py-0.5 rounded">
          {label ?? `cam ${frame.camera_id.slice(0, 8)}`} · {frame.width}×{frame.height} · {frame.detections.length} det
        </div>

        {stale && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 backdrop-blur-[1px]">
            <div className="text-center text-white">
              <p className="text-sm font-bold uppercase tracking-wide bg-red-600 px-3 py-1 rounded">
                Yayın koptu
              </p>
              <p className="mt-2 text-xs">10+ saniyedir frame gelmiyor</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const LiveVideoOverlay = memo(LiveVideoOverlayImpl, (a, b) =>
  a.frame?.camera_id === b.frame?.camera_id &&
  a.frame?.timestamp === b.frame?.timestamp &&
  a.showBbox === b.showBbox &&
  a.label === b.label &&
  a.stale === b.stale
);
