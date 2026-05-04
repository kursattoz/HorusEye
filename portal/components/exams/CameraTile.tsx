'use client';

// PRD-019 §6.4 — Small thumbnail tile shown beneath the focused live frame.
// No bbox overlay (those go on the focused/main camera only). Click to
// promote this tile to focus.

import { memo } from 'react';
import { Camera as CameraIcon, Smartphone, RadioTower } from 'lucide-react';
import type { ServerFrame } from '@/types/ai';

interface Props {
  cameraId: string;
  label: string;
  cameraType: 'ip_camera' | 'phone' | 'usb_webcam';
  frame: ServerFrame | null;
  active: boolean;
  onSelect: () => void;
}

function CameraTileImpl({ cameraId, label, cameraType, frame, active, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={label}
      className={`relative shrink-0 w-32 sm:w-36 aspect-video rounded-md overflow-hidden border-2 transition group ${
        active ? 'border-primary shadow-lg shadow-primary/30' : 'border-border hover:border-primary/60'
      }`}
    >
      {frame ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/jpeg;base64,${frame.jpeg_base64}`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40 text-muted-foreground">
          <RadioTower size={16} className="animate-pulse" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 flex items-center gap-1 text-white text-[10px]">
        {cameraType === 'phone' ? <Smartphone size={10} /> : <CameraIcon size={10} />}
        <span className="truncate">{label}</span>
      </div>
      {active && (
        <span className="absolute top-1 right-1 text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-1 py-0.5 rounded">
          live
        </span>
      )}
      {!frame && (
        <span className="absolute top-1 right-1 text-[9px] font-mono bg-muted/70 text-foreground/70 px-1 py-0.5 rounded">
          {cameraId.slice(0, 6)}
        </span>
      )}
    </button>
  );
}

// Skip re-render when only the focused camera's frame changed in the parent —
// non-focused tiles only re-render when their own jpeg_base64 changes (frame
// arrival for THIS camera) or when active flips.
export const CameraTile = memo(CameraTileImpl, (a, b) =>
  a.cameraId === b.cameraId &&
  a.active === b.active &&
  a.label === b.label &&
  a.cameraType === b.cameraType &&
  a.frame?.jpeg_base64 === b.frame?.jpeg_base64
);
