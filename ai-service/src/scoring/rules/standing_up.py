"""standing_up rule — BL-298 (PRD-021 §3 Sprint 17).

A student standing up during an exam is suspicious on its own. Combo
with empty_seat (PRD-013 §7.3) almost always means they're walking
toward another seat — promote to HIGH.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.detection.pose import PoseSignal
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.pose_helpers import is_standing
from src.scoring.track_state import TrackState

RULE_NAME           = "standing_up"
STANDING_TRACE_NAME = "is_standing"


@dataclass(frozen=True)
class StandingUpConfig:
    sustained_seconds: float = 1.5
    cooldown_seconds:  float = 45.0
    combo_window_s:    float = 60.0
    shoulder_y_max:    float = 0.35
    hip_y_max:         float = 0.55


def update_signal(track_state: TrackState, ts: float, pose: PoseSignal) -> None:
    track_state.record_signal(
        STANDING_TRACE_NAME, ts,
        1.0 if is_standing(pose) else 0.0,
    )


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    pose: PoseSignal,
    cfg: Optional[StandingUpConfig] = None,
) -> Optional[IncidentCandidate]:
    cfg = cfg or StandingUpConfig()
    update_signal(track_state, ts, pose)

    if not is_standing(pose, shoulder_y_max=cfg.shoulder_y_max, hip_y_max=cfg.hip_y_max):
        return None

    trace = track_state.signal_trace(STANDING_TRACE_NAME)
    sustained = _consecutive_seconds_truthy(trace)
    if sustained < cfg.sustained_seconds:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    empty_fires = track_state.fires_in_window("empty_seat", cfg.combo_window_s, ts)
    is_combo    = empty_fires > 0
    severity    = "high" if is_combo else "medium"
    confidence  = 0.85 if is_combo else 0.70

    track_state.mark_fired(RULE_NAME, ts)

    triggered = [
        f"{RULE_NAME}:shoulder_y<{cfg.shoulder_y_max:.2f}",
        f"{RULE_NAME}:hip_y<{cfg.hip_y_max:.2f}",
        f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
    ]
    if is_combo:
        triggered.append(f"{RULE_NAME}:combo empty_seat_fires={empty_fires}")

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
            "shoulder_y":         pose.shoulder_y_avg,
            "hip_y":              pose.hip_y_avg,
            "sustained_seconds":  sustained,
            "empty_seat_fires":   empty_fires,
            "is_combo":           is_combo,
        },
        occurred_at=ts,
    )


def _consecutive_seconds_truthy(trace: list[tuple[float, float]]) -> float:
    """Tail length where value > 0."""
    if not trace:
        return 0.0
    last_ts = trace[-1][0]
    earliest = last_ts
    for ts, value in reversed(trace):
        if value <= 0:
            break
        earliest = ts
    return last_ts - earliest
