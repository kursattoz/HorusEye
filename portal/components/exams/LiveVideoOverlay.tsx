'use client';

// PRD-019 §6.4 — Renders the latest annotated JPEG frame from the AI service.
// The JPEG is shown via a plain <img> so the browser handles aspect-ratio
// preservation natively (no canvas stretching). Bbox overlays sit in a
// position-aligned <svg> with a viewBox of 0 0 1 1 — works in any container
// size with no manual coordinate math.

import type { ServerFrame } from '@/types/ai';

interface LiveVideoOverlayProps {
  frame: ServerFrame | null;
  showBbox?: boolean;
  /** Override the camera id shown in the corner badge. */
  label?: string;
}

const CLASS_COLORS: Record<string, string> = {
  'cell phone': '#ef4444',
  'laptop':     '#f59e0b',
  'book':       '#f59e0b',
  'keyboard':   '#f59e0b',
  'person':     '#10b981',
};

const DEFAULT_COLOR = '#3b82f6';

export function LiveVideoOverlay({ frame, showBbox = true, label }: LiveVideoOverlayProps) {
  if (!frame) {
    return (
      <p className="text-xs text-muted-foreground p-4 text-center">
        Awaiting first frame…
      </p>
    );
  }

  const aspect = frame.height > 0 ? `${frame.width} / ${frame.height}` : '16 / 9';

  return (
    <div
      className="relative w-full h-full max-h-full overflow-hidden flex items-center justify-center bg-black"
    >
      <div
        className="relative max-w-full max-h-full"
        style={{ aspectRatio: aspect }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL, no remote image */}
        <img
          src={`data:image/jpeg;base64,${frame.jpeg_base64}`}
          alt=""
          className="block w-full h-full object-contain select-none"
          draggable={false}
        />

        {showBbox && frame.detections.length > 0 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            {frame.detections.map((det, i) => {
              const [x1, y1, x2, y2] = det.bbox;
              const color = CLASS_COLORS[det.detection_class] ?? DEFAULT_COLOR;
              const w = Math.max(0, x2 - x1);
              const h = Math.max(0, y2 - y1);
              return (
                <rect
                  key={i}
                  x={x1}
                  y={y1}
                  width={w}
                  height={h}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.004}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        )}

        {/* Class labels rendered on top with HTML so font scaling stays sharp. */}
        {showBbox && frame.detections.map((det, i) => {
          const [x1, y1] = det.bbox;
          const color = CLASS_COLORS[det.detection_class] ?? DEFAULT_COLOR;
          return (
            <div
              key={`lbl-${i}`}
              className="absolute text-[10px] font-mono font-semibold text-white px-1 py-0.5 rounded-sm pointer-events-none"
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
      </div>
    </div>
  );
}
