"""gaze_at_neighbor rule — BL-307 (PRD-021 §3 Sprint 17).

The student's head-yaw points toward a known lateral neighbor's bbox
for ≥ ``sustained_seconds``. Uses the same yaw signal as
:mod:`src.scoring.rules.gaze_diversion` (no double extraction) but
extends it with a per-seat direction calibration:

  - For seat S we store ``neighbor_left_yaw_sign``  and
    ``neighbor_right_yaw_sign``: +1 when "look right" maps to "look at
    the right-hand neighbor". For a flipped camera the sign is -1.
  - Calibration is per ``(session_id, camera_id, seat)`` and resolves
    from a small in-memory cache that the publish handler seeds at
    session start.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from src.detection.face_mesh import FaceMeshSignal
from src.detection.pose import PoseSignal
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.gaze_diversion import YAW_TRACE, _seconds_above_threshold
from src.scoring.rules.pose_helpers import lateral_neighbors, neighbor_side
from src.scoring.track_state import TrackState

RULE_NAME = "gaze_at_neighbor"


@dataclass(frozen=True)
class GazeAtNeighborConfig:
    yaw_threshold:     float = 30.0     # softer than gaze_diversion's 45° to catch lateral peeks
    sustained_seconds: float = 2.0
    cooldown_seconds:  float = 45.0
    max_x_gap:         float = 0.45
    # Per-seat direction calibration (+1 means yaw>0 looks toward right neighbor)
    seat_yaw_sign:     int   = 1


@dataclass
class GazeCalibration:
    """Per-seat calibration loaded once per session.

    Production wiring populates this from the proctor calibration UI
    (PRD-013 §4.3). For unit tests we use the default of +1.
    """
    sign_by_seat: dict[str, int] = field(default_factory=dict)

    def sign_for(self, seat_id: str | None) -> int:
        if seat_id is None:
            return 1
        return self.sign_by_seat.get(seat_id, 1)


_calibration = GazeCalibration()


def set_calibration(sign_by_seat: dict[str, int]) -> None:
    """Replace the in-process calibration cache."""
    global _calibration
    _calibration = GazeCalibration(sign_by_seat=dict(sign_by_seat))


def get_calibration() -> GazeCalibration:
    return _calibration


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    pose: PoseSignal,
    face_signal: FaceMeshSignal | None,
    neighbors: list[PoseSignal],
    *,
    seat_id: str | None = None,
    cfg: Optional[GazeAtNeighborConfig] = None,
) -> Optional[IncidentCandidate]:
    cfg = cfg or GazeAtNeighborConfig()
    yaw_sign = cfg.seat_yaw_sign if cfg.seat_yaw_sign != 1 else _calibration.sign_for(seat_id)

    trace = track_state.signal_trace(YAW_TRACE)
    sustained = _seconds_above_threshold(trace, cfg.yaw_threshold)
    if sustained < cfg.sustained_seconds:
        return None
    if face_signal is None:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    # Which side does the head turn point at, in image coords?
    yaw_dir = "right" if (face_signal.yaw_deg * yaw_sign) > 0 else "left"
    lateral = lateral_neighbors(pose, neighbors, max_x_gap=cfg.max_x_gap)
    if not lateral:
        return None
    aligned = [n for n in lateral if neighbor_side(pose, n) == yaw_dir]
    if not aligned:
        return None

    track_state.mark_fired(RULE_NAME, ts)

    triggered = [
        f"{RULE_NAME}:|yaw|≥{cfg.yaw_threshold:.0f}",
        f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
        f"{RULE_NAME}:dir={yaw_dir}",
        f"{RULE_NAME}:neighbor_seen=1",
    ]

    return IncidentCandidate(
        incident_type=RULE_NAME,
        severity="high",
        confidence=0.80,
        track_id=track_state.track_id,
        triggered_rules=tuple(triggered),
        bbox=person_bbox,
        person_bbox=person_bbox,
        raw_signals={
            "rule":               RULE_NAME,
            "yaw_deg_now":        face_signal.yaw_deg,
            "yaw_sign":           yaw_sign,
            "yaw_dir":            yaw_dir,
            "sustained_seconds":  sustained,
            "seat_id":            seat_id,
            "neighbor_count":     len(aligned),
        },
        occurred_at=ts,
    )
