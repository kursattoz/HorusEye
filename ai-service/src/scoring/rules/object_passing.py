"""object_passing rule — BL-304 (PRD-021 §3 Sprint 17).

Two adjacent tracks with wrists close enough to overlap in the global
frame for ≥ ``sustained_seconds``. Strong signal of a note / pen / phone
handoff between desks.

Symmetric: when track A fires, the rule also marks track B's window so
we don't double-emit on the very next frame.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.detection.pose import PoseSignal
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.pose_helpers import (
    euclid_xy,
    lateral_neighbors,
)
from src.scoring.track_state import TrackState

RULE_NAME       = "object_passing"
DIST_TRACE_NAME = "wrist_gap_to_nearest_neighbor"


@dataclass(frozen=True)
class ObjectPassingConfig:
    proximity_threshold: float = 0.10    # global-frame distance between nearest wrists
    sustained_seconds:   float = 0.8
    cooldown_seconds:    float = 30.0
    max_x_gap:           float = 0.40


def _project_wrists(sig: PoseSignal) -> tuple[tuple[float, float], tuple[float, float]]:
    """Map ROI-local wrist coords into the global frame using bbox_xyxy."""
    x1, y1, x2, y2 = sig.bbox_xyxy
    w = x2 - x1
    h = y2 - y1
    lw = (x1 + sig.left_wrist_xy[0]  * w, y1 + sig.left_wrist_xy[1]  * h)
    rw = (x1 + sig.right_wrist_xy[0] * w, y1 + sig.right_wrist_xy[1] * h)
    return lw, rw


def _nearest_wrist_gap(me: PoseSignal, other: PoseSignal) -> float:
    me_l, me_r = _project_wrists(me)
    other_l, other_r = _project_wrists(other)
    return min(
        euclid_xy(me_l, other_l), euclid_xy(me_l, other_r),
        euclid_xy(me_r, other_l), euclid_xy(me_r, other_r),
    )


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    pose: PoseSignal,
    neighbors: list[PoseSignal],
    cfg: Optional[ObjectPassingConfig] = None,
) -> Optional[IncidentCandidate]:
    cfg = cfg or ObjectPassingConfig()

    lateral = lateral_neighbors(pose, neighbors, max_x_gap=cfg.max_x_gap)
    if not lateral:
        return None

    gaps = [(n, _nearest_wrist_gap(pose, n)) for n in lateral]
    nearest, nearest_gap = min(gaps, key=lambda pair: pair[1])
    track_state.record_signal(DIST_TRACE_NAME, ts, nearest_gap)

    trace = track_state.signal_trace(DIST_TRACE_NAME)
    sustained = _seconds_below_threshold(trace, cfg.proximity_threshold)
    if sustained < cfg.sustained_seconds:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    track_state.mark_fired(RULE_NAME, ts)

    triggered = [
        f"{RULE_NAME}:wrist_gap<{cfg.proximity_threshold:.2f}",
        f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
    ]

    return IncidentCandidate(
        incident_type=RULE_NAME,
        severity="high",
        confidence=0.85,
        track_id=track_state.track_id,
        triggered_rules=tuple(triggered),
        bbox=person_bbox,
        person_bbox=person_bbox,
        raw_signals={
            "rule":               RULE_NAME,
            "nearest_wrist_gap":  nearest_gap,
            "sustained_seconds":  sustained,
            "neighbor_bbox":      nearest.bbox_xyxy,
        },
        occurred_at=ts,
    )


def _seconds_below_threshold(
    trace: list[tuple[float, float]],
    threshold: float,
) -> float:
    if not trace:
        return 0.0
    last_ts = trace[-1][0]
    earliest = last_ts
    for ts, value in reversed(trace):
        if value >= threshold:
            break
        earliest = ts
    return last_ts - earliest
