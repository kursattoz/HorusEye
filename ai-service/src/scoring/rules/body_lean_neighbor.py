"""body_lean_neighbor rule — BL-297 (PRD-021 §3 Sprint 17).

Fires when a tracked student leans toward an adjacent student for
≥ ``sustained_seconds``. Severity:

  - LOW  if lean is sustained but no other rules co-fire.
  - HIGH if the same window also carries a paper_detected or
    object_passing incident — combo = likely passing notes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.detection.pose import PoseSignal
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.pose_helpers import (
    lateral_neighbors,
    neighbor_side,
    torso_lean_magnitude,
)
from src.scoring.track_state import TrackState

RULE_NAME       = "body_lean_neighbor"
LEAN_TRACE_NAME = "torso_lean_mag"


@dataclass(frozen=True)
class BodyLeanConfig:
    lean_threshold:      float = 0.12      # |shoulder − hip| midpoint offset
    sustained_seconds:   float = 2.5
    cooldown_seconds:    float = 30.0
    combo_window_s:      float = 60.0
    max_x_gap:           float = 0.35       # max horizontal distance to a "neighbor"


def update_signal(
    track_state: TrackState,
    ts: float,
    pose: PoseSignal,
) -> None:
    """Push torso-lean magnitude into the rolling trace."""
    track_state.record_signal(LEAN_TRACE_NAME, ts, torso_lean_magnitude(pose))


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    pose: PoseSignal,
    neighbors: list[PoseSignal],
    cfg: Optional[BodyLeanConfig] = None,
) -> Optional[IncidentCandidate]:
    cfg = cfg or BodyLeanConfig()

    update_signal(track_state, ts, pose)
    trace = track_state.signal_trace(LEAN_TRACE_NAME)
    sustained = _seconds_above_threshold(trace, cfg.lean_threshold)
    if sustained < cfg.sustained_seconds:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    lateral = lateral_neighbors(pose, neighbors, max_x_gap=cfg.max_x_gap)
    if not lateral:
        return None

    # The "lean direction" — sign of torso_lean_x indicates left/right.
    lean_side = "left" if pose.torso_lean_x < 0 else "right"
    # Only fire if there's a neighbor on the lean side.
    leaning_at = [n for n in lateral if neighbor_side(pose, n) == lean_side]
    if not leaning_at:
        return None

    paper_fires = track_state.fires_in_window("paper_detected", cfg.combo_window_s, ts)
    passing_fires = track_state.fires_in_window("object_passing", cfg.combo_window_s, ts)
    is_combo = paper_fires + passing_fires > 0
    severity   = "high" if is_combo else "low"
    confidence = 0.85 if is_combo else 0.60

    track_state.mark_fired(RULE_NAME, ts)

    triggered = [
        f"{RULE_NAME}:|lean|≥{cfg.lean_threshold:.2f}",
        f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
        f"{RULE_NAME}:neighbor_side={lean_side}",
    ]
    if is_combo:
        triggered.append(
            f"{RULE_NAME}:combo paper={paper_fires} passing={passing_fires}",
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
            "torso_lean_x":       pose.torso_lean_x,
            "sustained_seconds":  sustained,
            "neighbor_count":     len(leaning_at),
            "neighbor_side":      lean_side,
            "paper_fires_60s":    paper_fires,
            "passing_fires_60s":  passing_fires,
            "is_combo":           is_combo,
        },
        occurred_at=ts,
    )


def _seconds_above_threshold(
    trace: list[tuple[float, float]],
    threshold: float,
) -> float:
    """Return the length of the longest tail where value ≥ threshold."""
    if not trace:
        return 0.0
    last_ts = trace[-1][0]
    earliest = last_ts
    for ts, value in reversed(trace):
        if value < threshold:
            break
        earliest = ts
    return last_ts - earliest
