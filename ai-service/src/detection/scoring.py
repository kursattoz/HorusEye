"""Rule-based scoring stub — full RiskScorer is BL-41 (Sprint 4).

Phase A first-pass: each TIER-1 detection (per PRD-013 §7.2) becomes a
candidate incident with a baseline severity. Tracking + temporal filtering
will be added by BL-48 / BL-147.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.detection.yolo_detector import Detection


@dataclass(frozen=True)
class IncidentCandidate:
    incident_type: str
    severity: str               # 'low' | 'medium' | 'high' | 'critical'
    confidence: float
    triggered_rules: tuple[str, ...]
    detection: Detection


# Default class → incident mapping. Override via config in production.
_DEFAULT_CLASS_MAP: dict[str, str] = {
    "cell phone": "phone_detected",
    "book":       "paper_detected",
    "laptop":     "paper_detected",
    "keyboard":   "paper_detected",
}


def score_detection(
    detection: Detection,
    class_map: dict[str, str] | None = None,
) -> Optional[IncidentCandidate]:
    """Apply Phase A rule: matching class above conf-threshold → 'medium' incident.

    Returns ``None`` for detections that aren't on the proctoring watchlist
    (e.g. plain ``person`` boxes, which feed the tracker, not incidents).
    """
    mapping = class_map or _DEFAULT_CLASS_MAP
    incident_type = mapping.get(detection.class_name)
    if not incident_type:
        return None

    # Baseline severity: confidence > 0.7 → 'high', else 'medium'
    severity = "high" if detection.confidence >= 0.70 else "medium"

    return IncidentCandidate(
        incident_type=incident_type,
        severity=severity,
        confidence=detection.confidence,
        triggered_rules=(f"yolo:{detection.class_name}",),
        detection=detection,
    )
