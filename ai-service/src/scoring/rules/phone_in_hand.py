"""phone_in_hand rule — BL-184 (PRD-013 §7.2 TIER-1, §7.3 Phase A).

Fires ``phone_detected`` HIGH/MEDIUM when a tracked person carries a
cell-phone bbox overlapping their body for ``sustained_seconds`` of
continuous frames. A 30-second cooldown prevents the same continuous
behaviour from generating a stream of duplicates.

The rule is split into two pure functions:

* :func:`update_overlap` — called every frame, builds the set of
  non-person classes overlapping the tracked person's bbox and pushes
  one sample into the :class:`~src.scoring.track_state.TrackState`.
  This part is reused by gaze/head-turn rules in Sprint 8.
* :func:`evaluate` — called every frame after ``update_overlap``,
  inspects the rolling window + cooldown table and returns an
  :class:`~src.scoring.rules.IncidentCandidate` when both conditions
  hold.

Severity mapping (PRD-013 §7.3 Phase A table):
- confidence ≥ 0.65 → ``high``
- confidence 0.50–0.65 → ``medium``
- below 0.50 — rule does not fire (phones aren't tracked at low conf;
  the gate is the YOLO-level confidence threshold which is already 0.30).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from src.detection.yolo_detector import Detection
from src.scoring.rules import IncidentCandidate
from src.scoring.track_state import TrackState, bbox_overlap_ratio

PHONE_CLASS_NAME = "cell phone"
RULE_NAME = "phone_in_hand"


@dataclass(frozen=True)
class PhoneInHandConfig:
    overlap_threshold: float = 0.30   # fraction of phone bbox inside person bbox
    sustained_seconds: float = 3.0
    cooldown_seconds: float = 30.0
    high_severity_conf: float = 0.65
    medium_severity_conf: float = 0.50


def update_overlap(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    other_detections: Iterable[Detection],
    overlap_threshold: float = 0.30,
) -> dict[str, Detection]:
    """Compute overlapping classes vs the person and add a sample.

    Returns the per-class ``Detection`` map (best-confidence pick) — useful
    when a rule needs the actual bbox/conf of the overlapping object,
    e.g. for evidence anchoring or raw_signals.
    """
    overlap_by_class: dict[str, Detection] = {}
    for d in other_detections:
        ratio = bbox_overlap_ratio(d.bbox, person_bbox)
        if ratio < overlap_threshold:
            continue
        existing = overlap_by_class.get(d.class_name)
        if existing is None or d.confidence > existing.confidence:
            overlap_by_class[d.class_name] = d

    track_state.add(
        ts=ts,
        person_bbox=person_bbox,
        overlapping_classes=overlap_by_class.keys(),
    )
    return overlap_by_class


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    overlapping_phone: Detection | None,
    cfg: PhoneInHandConfig | None = None,
) -> IncidentCandidate | None:
    """Return an IncidentCandidate when the phone has been sustained
    in the window and the cooldown has cleared, otherwise ``None``."""
    cfg = cfg or PhoneInHandConfig()
    if overlapping_phone is None:
        return None
    if not track_state.sustained(PHONE_CLASS_NAME, cfg.sustained_seconds):
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    conf = overlapping_phone.confidence
    if conf < cfg.medium_severity_conf:
        return None
    severity = "high" if conf >= cfg.high_severity_conf else "medium"

    track_state.mark_fired(RULE_NAME, ts)

    return IncidentCandidate(
        incident_type="phone_detected",
        severity=severity,
        confidence=conf,
        track_id=track_state.track_id,
        triggered_rules=(
            f"{RULE_NAME}:overlap≥{cfg.overlap_threshold:.2f}",
            f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
        ),
        bbox=overlapping_phone.bbox,
        person_bbox=person_bbox,
        raw_signals={
            "rule": RULE_NAME,
            "phone_bbox": list(overlapping_phone.bbox),
            "person_bbox": list(person_bbox),
            "phone_confidence": conf,
            "sustained_seconds": cfg.sustained_seconds,
            "samples_in_window": len(track_state.samples),
        },
        occurred_at=ts,
    )
