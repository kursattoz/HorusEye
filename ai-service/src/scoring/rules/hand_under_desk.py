"""hand_under_desk rule — BL-299 (PRD-021 §3 Sprint 17).

A wrist landmark consistently below the "desk line" (default y > 0.80
in the person ROI) suggests the student is reaching for something
hidden — phone on lap, cheat sheet, etc. Combo with phone_detected
(BL-188) bumps severity to CRITICAL.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.detection.pose import PoseSignal
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.pose_helpers import hand_below_desk
from src.scoring.track_state import TrackState

RULE_NAME      = "hand_under_desk"
HAND_DOWN_TRACE = "hand_below_desk"


@dataclass(frozen=True)
class HandUnderDeskConfig:
    desk_y_threshold:  float = 0.80
    sustained_seconds: float = 2.5
    cooldown_seconds:  float = 30.0
    combo_window_s:    float = 60.0


def update_signal(track_state: TrackState, ts: float, pose: PoseSignal) -> None:
    track_state.record_signal(
        HAND_DOWN_TRACE, ts,
        1.0 if hand_below_desk(pose) else 0.0,
    )


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    pose: PoseSignal,
    cfg: Optional[HandUnderDeskConfig] = None,
) -> Optional[IncidentCandidate]:
    cfg = cfg or HandUnderDeskConfig()
    update_signal(track_state, ts, pose)

    if not hand_below_desk(pose, desk_y_threshold=cfg.desk_y_threshold):
        return None

    trace = track_state.signal_trace(HAND_DOWN_TRACE)
    sustained = _consecutive_seconds_truthy(trace)
    if sustained < cfg.sustained_seconds:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    phone_fires = track_state.fires_in_window("phone_detected", cfg.combo_window_s, ts)
    is_critical = phone_fires > 0
    severity   = "critical" if is_critical else "medium"
    confidence = 0.90 if is_critical else 0.65

    track_state.mark_fired(RULE_NAME, ts)

    triggered = [
        f"{RULE_NAME}:wrist_y>{cfg.desk_y_threshold:.2f}",
        f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
    ]
    if is_critical:
        triggered.append(f"{RULE_NAME}:critical phone_fires={phone_fires}")

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
            "left_wrist_y":       pose.left_wrist_xy[1],
            "right_wrist_y":      pose.right_wrist_xy[1],
            "sustained_seconds":  sustained,
            "phone_fires_60s":    phone_fires,
            "is_critical":        is_critical,
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
