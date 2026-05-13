'use client';

// PRD-019 §6.4 — Renders the latest annotated JPEG frame from the AI service.
// The JPEG is shown via a plain <img> so the browser handles aspect-ratio
// preservation natively. Bbox overlays are HTML divs with absolute % positions —
// pixel-sharp borders at any container size, no SVG stroke surprises.

import { memo } from 'react';
import type { ServerFrame, ServerIncident } from '@/types/ai';
import type { IncidentSeverity, IncidentType } from '@/types';

interface LiveVideoOverlayProps {
  frame: ServerFrame | null;
  showBbox?: boolean;
  /** Override the camera id shown in the corner badge. */
  label?: string;
  /** Last frame older than ~10s — show a stale overlay. */
  stale?: boolean;
  /**
   * Recent incidents for THIS camera. The overlay highlights the
   * person bbox whose track_id matches and stamps the incident_type
   * + severity on top. Caller filters by camera_id + time window.
   */
  activeIncidents?: ServerIncident[];
}

// PRD-013 §7 + PRD-021 §3 Sprint 15/16/18 — visual color taxonomy for
// every class the active YOLO model can emit. Phone-family stays red
// (highest immediate risk); writing surfaces are amber; permitted
// accessories (calculator, smart_watch) lighter cyan; person green.
// face_covering is purple to stand out from the rest.
const CLASS_COLORS: Record<string, string> = {
  // Phase A (COCO)
  'cell phone':   '#ef4444',   // red
  'book':         '#f59e0b',   // amber
  'person':       '#10b981',   // emerald
  // Sprint 15 v1.0 classes
  'earbuds':      '#ef4444',
  'phone':        '#ef4444',
  'smart_watch':  '#06b6d4',   // cyan — permitted but tracked
  // Sprint 16 v2.0 classes
  'paper_notes':  '#f97316',   // orange — higher risk than book
  'pencil_case':  '#a78bfa',   // violet — usually permitted
  'calculator':   '#06b6d4',
  // Sprint 18 v3.0 classes
  'face_covering': '#8b5cf6',  // purple
};

const DEFAULT_COLOR = '#3b82f6';

// Severity → ring color when an incident is active on a track.
const SEVERITY_RING: Record<IncidentSeverity, string> = {
  low:      '#3b82f6',   // blue
  medium:   '#f59e0b',   // amber
  high:     '#f97316',   // orange
  critical: '#dc2626',   // red
};

// Compact display labels for the new long incident_type names so the
// overlay tag stays legible at the typical 320×240 tile size.
const INCIDENT_LABELS: Partial<Record<IncidentType, string>> = {
  body_lean_neighbor:    'lean',
  standing_up:           'stand',
  hand_under_desk:       'hand→desk',
  hand_to_ear_mouth:     'hand→ear',
  object_passing:        'pass',
  gaze_at_lap:           'gaze↓',
  gaze_at_neighbor:      'gaze→nbr',
  synchronized_behavior: 'sync',
  face_covering:         'face×',
  gaze_diversion:        'gaze',
  head_turn:             'head',
  phone_detected:        'phone',
  earbuds_detected:      'earbuds',
  paper_detected:        'paper',
  empty_seat:            'empty',
  whispering:            'wsp',
  unauthorized_communication: 'comm',
  position_uncertainty:  'pos?',
};

function LiveVideoOverlayImpl({
  frame,
  showBbox = true,
  label,
  stale = false,
  activeIncidents = [],
}: LiveVideoOverlayProps) {
  if (!frame) {
    return (
      <p className="text-xs text-muted-foreground p-4 text-center">
        Awaiting first frame…
      </p>
    );
  }

  const aspect = frame.height > 0 ? `${frame.width} / ${frame.height}` : '16 / 9';

  // Sprint 14-18 — collapse incidents per track so we don't double-draw
  // when two rules fire simultaneously. Highest-severity wins the ring;
  // labels stack vertically below the badge.
  const SEV_ORDER: IncidentSeverity[] = ['low', 'medium', 'high', 'critical'];
  const incidentsByTrack = new Map<number, ServerIncident[]>();
  for (const inc of activeIncidents) {
    if (inc.camera_ids?.length && !inc.camera_ids.includes(frame.camera_id)) continue;
    if (inc.track_id == null) continue;
    const list = incidentsByTrack.get(inc.track_id) ?? [];
    list.push(inc);
    incidentsByTrack.set(inc.track_id, list);
  }

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
          // Sprint 14-18 — if this detection is a person AND has an
          // active incident on its track, wrap the bbox in a pulsing
          // ring whose color matches the highest-severity firing rule.
          const trackIncidents = det.track_id != null
            ? incidentsByTrack.get(det.track_id) ?? []
            : [];
          const topSeverity = trackIncidents.reduce<IncidentSeverity | null>(
            (acc, inc) => (acc == null || SEV_ORDER.indexOf(inc.severity) > SEV_ORDER.indexOf(acc)) ? inc.severity : acc,
            null,
          );
          const ringColor = topSeverity ? SEVERITY_RING[topSeverity] : null;
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
                // Severity ring: 4px outer glow around the bbox.
                boxShadow: ringColor
                  ? `0 0 0 1px rgba(0,0,0,0.4), 0 0 0 4px ${ringColor}, 0 0 12px 4px ${ringColor}66`
                  : `0 0 0 1px rgba(0,0,0,0.4)`,
              }}
            />
          );
        })}

        {showBbox && frame.detections.map((det, i) => {
          const [x1, y1] = det.bbox;
          const color = CLASS_COLORS[det.detection_class] ?? DEFAULT_COLOR;
          const trackIncidents = det.track_id != null
            ? incidentsByTrack.get(det.track_id) ?? []
            : [];
          return (
            <div key={`lbl-${i}`} className="absolute pointer-events-none"
                 style={{ left: `${x1 * 100}%`, top: `${y1 * 100}%`, transform: 'translateY(-100%)' }}>
              <div
                className="text-[10px] font-mono font-semibold text-white px-1 py-0.5 rounded-sm whitespace-nowrap"
                style={{ background: color }}
              >
                {det.detection_class} {(det.confidence * 100).toFixed(0)}%
              </div>
              {/* Active-incident chips: one per firing rule, severity-coded. */}
              {trackIncidents.length > 0 && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {trackIncidents.slice(0, 3).map((inc, j) => (
                    <span
                      key={j}
                      className="self-start text-[9px] font-mono font-semibold text-white px-1 py-0.5 rounded-sm whitespace-nowrap"
                      style={{ background: SEVERITY_RING[inc.severity] }}
                      title={`${inc.incident_type} (${inc.severity}, conf ${(inc.confidence * 100).toFixed(0)}%)`}
                    >
                      {INCIDENT_LABELS[inc.incident_type] ?? inc.incident_type}
                    </span>
                  ))}
                </div>
              )}
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
  a.stale === b.stale &&
  // Compare incident array shape — incident_id + severity tuple is
  // cheap enough that we don't memoize harder. Anything else means
  // a new fire and we want the overlay to refresh.
  (a.activeIncidents?.length ?? 0) === (b.activeIncidents?.length ?? 0) &&
  (a.activeIncidents ?? []).every((inc, i) => {
    const other = (b.activeIncidents ?? [])[i];
    return other?.incident_id === inc.incident_id && other?.severity === inc.severity;
  })
);
