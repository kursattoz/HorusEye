"""paper_detected rule — BL-206 (PRD-013 §7.2 TIER-1).

Phase A: a COCO ``book`` or ``keyboard`` bbox overlapping the tracked
student for ≥``sustained_seconds`` of continuous frames emits MEDIUM
``paper_detected``. Re-uses the same per-frame ``update_overlap``
trace populated by phone_in_hand (it records every overlapping class
on the same TrackState sample), so this rule needs no separate signal
recorder — only an evaluator.

PRD-013 §7.3 leaves laptop out of the Phase A trigger set: a laptop on
the desk in front of a student is far more often the student's own
keyboard than a forbidden device. ``unauthorized_material`` (Phase B,
Sprint 11+) extends the trigger to ``laptop`` once a custom-trained
class set is in production.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Optional

from src.detection.yolo_detector import Detection
from src.scoring.rules import IncidentCandidate
from src.scoring.track_state import TrackState

PAPER_CLASSES: tuple[str, ...] = ("book", "paper_notes")
# BL-265: keyboard removed (off-desk, FP-only signal).
# Sprint 19: paper_notes added — YOLO-World World mode emits this as a
# canonical class via class_mapping.yaml aliases. With COCO weights only
# "book" ever overlaps, so the rule degrades to the legacy single-class
# behavior automatically.
RULE_NAME = "paper_detected"


@dataclass(frozen=True)
class PaperDetectedConfig:
    sustained_seconds:    float = 2.0   # ~10 sustained frames at 5 FPS
    cooldown_seconds:     float = 60.0
    medium_severity_conf: float = 0.40


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    overlap_by_class: Mapping[str, Detection],
    cfg: Optional[PaperDetectedConfig] = None,
) -> Optional[IncidentCandidate]:
    """Fire MEDIUM when any PAPER_CLASS has been sustained on the track.

    ``overlap_by_class`` is the dict returned by
    :func:`src.scoring.rules.phone_in_hand.update_overlap`; the
    publish handler shares a single update_overlap call across all
    object-overlap rules to avoid double-counting samples.
    """
    cfg = cfg or PaperDetectedConfig()

    # Find the first sustained paper class
    fired_class: str | None = None
    for cls in PAPER_CLASSES:
        if track_state.sustained(cls, cfg.sustained_seconds):
            fired_class = cls
            break
    if fired_class is None:
        return None

    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    # Anchor the incident on the highest-confidence overlapping paper detection
    candidates_overlap = [
        d for cls, d in overlap_by_class.items() if cls in PAPER_CLASSES
    ]
    if not candidates_overlap:
        return None
    best = max(candidates_overlap, key=lambda d: d.confidence)
    if best.confidence < cfg.medium_severity_conf:
        return None

    track_state.mark_fired(RULE_NAME, ts)

    return IncidentCandidate(
        incident_type="paper_detected",
        severity="medium",
        confidence=best.confidence,
        track_id=track_state.track_id,
        triggered_rules=(
            f"{RULE_NAME}:{fired_class}_overlap",
            f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
        ),
        bbox=best.bbox,
        person_bbox=person_bbox,
        raw_signals={
            "rule":              RULE_NAME,
            "matched_class":     fired_class,
            "object_confidence": best.confidence,
            "object_bbox":       list(best.bbox),
            "person_bbox":       list(person_bbox),
            "sustained_seconds": cfg.sustained_seconds,
        },
        occurred_at=ts,
    )
