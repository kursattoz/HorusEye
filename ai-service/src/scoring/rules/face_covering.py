"""face_covering rule — PRD-021 §3 Sprint 18 (BL-320).

Fires when the face_covering class (id 7 in the v3.0 model) detects an
occluded face on the same person bbox sustained over ``sustained_seconds``.
This is the model-driven sibling of the geometric Sprint 17 rules — we
rely on the v3.0 fine-tune that includes MaskedFace-Net + WIDER FACE
in its training set.

Severity:
  - MEDIUM by default (mask / scarf might be legitimate cold-weather wear)
  - HIGH if the same student also has a recent gaze / pose anomaly
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.scoring.rules import IncidentCandidate
from src.scoring.track_state import TrackState

RULE_NAME            = "face_covering"
COVER_TRACE_NAME     = "face_covered"


@dataclass(frozen=True)
class FaceCoveringConfig:
    sustained_seconds: float = 3.0
    cooldown_seconds:  float = 60.0
    combo_window_s:    float = 60.0
    min_confidence:    float = 0.55


def update_signal(track_state: TrackState, ts: float, *, covered: bool) -> None:
    track_state.record_signal(COVER_TRACE_NAME, ts, 1.0 if covered else 0.0)


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    *,
    face_covering_detected: bool,
    detection_confidence:   float,
    cfg: Optional[FaceCoveringConfig] = None,
) -> Optional[IncidentCandidate]:
    cfg = cfg or FaceCoveringConfig()
    update_signal(track_state, ts, covered=face_covering_detected)

    if not face_covering_detected:
        return None
    if detection_confidence < cfg.min_confidence:
        return None

    trace = track_state.signal_trace(COVER_TRACE_NAME)
    sustained = _consecutive_seconds_truthy(trace)
    if sustained < cfg.sustained_seconds:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    gaze_fires = track_state.fires_in_window("gaze_diversion", cfg.combo_window_s, ts)
    head_fires = track_state.fires_in_window("head_turn", cfg.combo_window_s, ts)
    posture_fires = track_state.fires_in_window("body_lean_neighbor", cfg.combo_window_s, ts)
    is_combo = (gaze_fires + head_fires + posture_fires) > 0
    severity   = "high" if is_combo else "medium"
    confidence = max(detection_confidence, 0.80 if is_combo else 0.65)

    track_state.mark_fired(RULE_NAME, ts)

    triggered = [
        f"{RULE_NAME}:detected",
        f"{RULE_NAME}:conf≥{cfg.min_confidence:.2f}",
        f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
    ]
    if is_combo:
        triggered.append(
            f"{RULE_NAME}:combo gaze={gaze_fires} head={head_fires} posture={posture_fires}",
        )

    return IncidentCandidate(
        incident_type=RULE_NAME,
        severity=severity,
        confidence=float(confidence),
        track_id=track_state.track_id,
        triggered_rules=tuple(triggered),
        bbox=person_bbox,
        person_bbox=person_bbox,
        raw_signals={
            "rule":                  RULE_NAME,
            "detection_confidence":  detection_confidence,
            "sustained_seconds":     sustained,
            "gaze_fires_60s":        gaze_fires,
            "head_fires_60s":        head_fires,
            "posture_fires_60s":     posture_fires,
            "is_combo":              is_combo,
        },
        occurred_at=ts,
    )


def _consecutive_seconds_truthy(trace: list[tuple[float, float]]) -> float:
    if not trace:
        return 0.0
    last_ts = trace[-1][0]
    earliest = last_ts
    for ts, value in reversed(trace):
        if value <= 0:
            break
        earliest = ts
    return last_ts - earliest
