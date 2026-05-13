"""Rule-based incident scoring — BL-41 (PRD-013 §7.2).

Phase A.1 evolution of the basic stub. Each detection becomes a candidate
incident with severity assigned by a small set of explicit rules. Tier-3
detections (per PRD-013 §7.2) can never fire on their own — they only
boost severity when combined with a Tier-1 / Tier-2 signal.

Compose with :class:`~src.detection.tracker.Track` (BL-48) and
:class:`~src.detection.face_mesh.FaceMeshSignal` (BL-149) to obtain
context-aware scores. The composition layer lives in
:func:`score_track_window` below.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Optional

from src.detection.yolo_detector import Detection


# ───────── data classes ─────────

@dataclass(frozen=True)
class IncidentCandidate:
    incident_type:   str
    severity:        str               # 'low' | 'medium' | 'high' | 'critical'
    confidence:      float
    triggered_rules: tuple[str, ...]
    detection:       Detection


@dataclass
class TrackWindow:
    """Aggregated signals for a single track over the last N seconds."""
    track_id:           int
    detections:         list[Detection] = field(default_factory=list)
    sustained_gaze_yaw_deg: float = 0.0    # max abs yaw seen in window
    sustained_gaze_seconds: float = 0.0
    head_lost_seconds:      float = 0.0
    neighbour_synchrony:    float = 0.0    # 0..1, multi-track signal


# ───────── default class → incident mapping ─────────

_DEFAULT_CLASS_MAP: dict[str, str] = {
    # BL-265: laptop / keyboard mappings removed — they conflated
    # off-desk objects with cheat-paper. Sprint 16 introduces the
    # paper_notes custom class for the real signal.
    "cell phone":  "phone_detected",
    "book":        "paper_detected",
    "headphones":  "earbuds_detected",   # COCO doesn't include this; future custom class
}


# ───────── per-detection scoring (Tier-1) ─────────

def score_detection(
    detection: Detection,
    class_map: Optional[dict[str, str]] = None,
) -> Optional[IncidentCandidate]:
    """Tier-1 detections produce an immediate candidate.

    Returns ``None`` for plain ``person`` boxes — those feed the tracker.
    """
    mapping = class_map or _DEFAULT_CLASS_MAP
    incident_type = mapping.get(detection.class_name)
    if not incident_type:
        return None

    # Phone in hand is the strongest signal (PRD-013 §7.2 Tier-1).
    if detection.class_name == "cell phone":
        severity = "critical" if detection.confidence >= 0.85 else "high"
    else:
        severity = "high" if detection.confidence >= 0.70 else "medium"

    return IncidentCandidate(
        incident_type=incident_type,
        severity=severity,
        confidence=detection.confidence,
        triggered_rules=(f"yolo:{detection.class_name}",),
        detection=detection,
    )


# ───────── window-aware scoring (Tier-2 + Tier-3 boosting) ─────────

GAZE_YAW_DEG_THRESHOLD       = 30.0
GAZE_SUSTAINED_SEC_THRESHOLD = 3.0


def score_track_window(window: TrackWindow) -> list[IncidentCandidate]:
    """Apply Tier-2 / Tier-3 rules over a track's recent signal window.

    BL-149 (MediaPipe) feeds ``sustained_gaze_yaw_deg`` and
    ``sustained_gaze_seconds``; BL-48 BoT-SORT feeds ``head_lost_seconds``
    via track-level missed-detection counters.
    """
    out: list[IncidentCandidate] = []

    # Tier-2: sustained gaze diversion (PRD-013 §7.2)
    if (
        window.sustained_gaze_yaw_deg >= GAZE_YAW_DEG_THRESHOLD
        and window.sustained_gaze_seconds >= GAZE_SUSTAINED_SEC_THRESHOLD
    ):
        # Severity scales with how much the threshold was exceeded.
        excess_yaw = window.sustained_gaze_yaw_deg - GAZE_YAW_DEG_THRESHOLD
        excess_sec = window.sustained_gaze_seconds - GAZE_SUSTAINED_SEC_THRESHOLD
        severity = "high" if excess_yaw + excess_sec > 10.0 else "medium"
        confidence = min(0.99, 0.7 + 0.05 * (excess_yaw + excess_sec))

        # Use the most recent detection as the bbox anchor if any
        anchor = window.detections[-1] if window.detections else _ANCHOR_PLACEHOLDER
        out.append(IncidentCandidate(
            incident_type="gaze_diversion",
            severity=severity,
            confidence=confidence,
            triggered_rules=(
                "mediapipe:yaw>30",
                "mediapipe:sustained>3s",
            ),
            detection=anchor,
        ))

    # Tier-1: empty seat (track lost for too long)
    if window.head_lost_seconds >= 5.0:
        out.append(IncidentCandidate(
            incident_type="empty_seat",
            severity="medium" if window.head_lost_seconds < 30.0 else "high",
            confidence=0.95,
            triggered_rules=("tracker:head_lost>5s",),
            detection=window.detections[-1] if window.detections else _ANCHOR_PLACEHOLDER,
        ))

    return out


# ───────── helpers ─────────

def to_event_metadata(candidate: IncidentCandidate) -> dict:
    """Render a candidate as the JSON payload sent over the WS protocol."""
    d = candidate.detection
    return {
        "incident_type":   candidate.incident_type,
        "severity":        candidate.severity,
        "confidence":      candidate.confidence,
        "triggered_rules": list(candidate.triggered_rules),
        "bbox":            list(d.bbox),
        "detection_class": d.class_name,
    }


# Placeholder anchor used only when window-level rules fire without a fresh detection
_ANCHOR_PLACEHOLDER = Detection(
    class_id=0,
    class_name="person",
    confidence=0.0,
    bbox=(0.0, 0.0, 0.0, 0.0),
)


def aggregate_candidates(candidates: Iterable[IncidentCandidate]) -> list[IncidentCandidate]:
    """Deduplicate same-track / same-type candidates, keeping the strongest."""
    by_key: dict[tuple[str, int], IncidentCandidate] = {}
    for c in candidates:
        key = (c.incident_type, id(c.detection))
        existing = by_key.get(key)
        if existing is None or _severity_rank(c.severity) > _severity_rank(existing.severity):
            by_key[key] = c
    return list(by_key.values())


def _severity_rank(s: str) -> int:
    return {"low": 1, "medium": 2, "high": 3, "critical": 4}.get(s, 0)
