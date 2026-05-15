"""gaze_at_lap rule — BL-306 (PRD-021 §3 Sprint 17).

Sustained downward head tilt (nose well below shoulder line) is a
strong proxy for phone-on-lap activity. Combo with phone_detected
or hand_under_desk is CRITICAL.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.detection.pose import PoseSignal
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.pose_helpers import gaze_is_downward
from src.scoring.track_state import TrackState

RULE_NAME           = "gaze_at_lap"
GAZE_DOWN_TRACE     = "nose_below_shoulder_dy"


@dataclass(frozen=True)
class GazeAtLapConfig:
    nose_below_min_dy: float = 0.20      # nose_y − shoulder_y_avg
    sustained_seconds: float = 3.0
    cooldown_seconds:  float = 45.0
    combo_window_s:    float = 60.0


def update_signal(track_state: TrackState, ts: float, pose: PoseSignal) -> None:
    dy = pose.nose_xy[1] - pose.shoulder_y_avg
    track_state.record_signal(GAZE_DOWN_TRACE, ts, dy)


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    pose: PoseSignal,
    cfg: Optional[GazeAtLapConfig] = None,
) -> Optional[IncidentCandidate]:
    cfg = cfg or GazeAtLapConfig()
    update_signal(track_state, ts, pose)

    if not gaze_is_downward(pose, nose_below_shoulder_min_dy=cfg.nose_below_min_dy):
        return None

    trace = track_state.signal_trace(GAZE_DOWN_TRACE)
    sustained = _seconds_above_threshold(trace, cfg.nose_below_min_dy)
    if sustained < cfg.sustained_seconds:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    phone_fires = track_state.fires_in_window("phone_detected", cfg.combo_window_s, ts)
    hand_fires  = track_state.fires_in_window("hand_under_desk", cfg.combo_window_s, ts)
    is_critical = (phone_fires + hand_fires) > 0
    severity    = "critical" if is_critical else "high"
    confidence  = 0.90 if is_critical else 0.75

    track_state.mark_fired(RULE_NAME, ts)

    triggered = [
        f"{RULE_NAME}:nose−shoulder_dy>{cfg.nose_below_min_dy:.2f}",
        f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
    ]
    if is_critical:
        triggered.append(
            f"{RULE_NAME}:critical phone_fires={phone_fires} hand_fires={hand_fires}",
        )

    return IncidentCandidate(
        incident_type=RULE_NAME,
        severity=severity,
        confidence=confidence,
        track_id=track_state.track_id,
        triggered_rules=tuple(triggered),
        bbox=person_bbox,
        person_bbox=person_bbox,
        raw_signals={
            "rule":               RULE_NAME,
            "nose_y":             pose.nose_xy[1],
            "shoulder_y":         pose.shoulder_y_avg,
            "dy":                 pose.nose_xy[1] - pose.shoulder_y_avg,
            "sustained_seconds":  sustained,
            "phone_fires_60s":    phone_fires,
            "hand_fires_60s":     hand_fires,
            "is_critical":        is_critical,
        },
        occurred_at=ts,
    )


def _seconds_above_threshold(
    trace: list[tuple[float, float]],
    threshold: float,
) -> float:
    if not trace:
        return 0.0
    last_ts = trace[-1][0]
    earliest = last_ts
    for ts, value in reversed(trace):
        if value < threshold:
            break
        earliest = ts
    return last_ts - earliest
