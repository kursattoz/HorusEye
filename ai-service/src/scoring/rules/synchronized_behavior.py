"""synchronized_behavior rule — BL-308 (PRD-021 §3 Sprint 17).

Two adjacent students leaning the same direction at the same time,
sustained for ≥ ``sustained_seconds``. Heuristic for "coordinated
cheating" — far rarer than independent leans, so MEDIUM severity even
without combo.

Implementation: each evaluation looks at *me* and the closest lateral
neighbor; if both torsos lean the same way (same sign of
``torso_lean_x``) over a sustained window, fire.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.detection.pose import PoseSignal
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.pose_helpers import lateral_neighbors
from src.scoring.track_state import TrackState

RULE_NAME              = "synchronized_behavior"
SYNC_TRACE_NAME        = "synchronized_lean_score"


@dataclass(frozen=True)
class SynchronizedBehaviorConfig:
    lean_threshold:     float = 0.10
    sustained_seconds:  float = 3.0
    cooldown_seconds:   float = 60.0
    max_x_gap:          float = 0.35


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    pose: PoseSignal,
    neighbors: list[PoseSignal],
    cfg: Optional[SynchronizedBehaviorConfig] = None,
) -> Optional[IncidentCandidate]:
    cfg = cfg or SynchronizedBehaviorConfig()

    lateral = lateral_neighbors(pose, neighbors, max_x_gap=cfg.max_x_gap)
    if not lateral:
        return None

    # Pick the most-leaning neighbor.
    neighbor = max(lateral, key=lambda n: abs(n.torso_lean_x))

    same_sign = pose.torso_lean_x * neighbor.torso_lean_x > 0
    both_above = (
        abs(pose.torso_lean_x)     >= cfg.lean_threshold
        and abs(neighbor.torso_lean_x) >= cfg.lean_threshold
    )
    score = 1.0 if (same_sign and both_above) else 0.0
    track_state.record_signal(SYNC_TRACE_NAME, ts, score)

    trace = track_state.signal_trace(SYNC_TRACE_NAME)
    sustained = _consecutive_seconds_truthy(trace)
    if sustained < cfg.sustained_seconds:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    track_state.mark_fired(RULE_NAME, ts)

    triggered = [
        f"{RULE_NAME}:both_|lean|≥{cfg.lean_threshold:.2f}",
        f"{RULE_NAME}:same_sign=true",
        f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
    ]

    return IncidentCandidate(
        incident_type=RULE_NAME,
        severity="medium",
        confidence=0.70,
        track_id=track_state.track_id,
        triggered_rules=tuple(triggered),
        bbox=person_bbox,
        person_bbox=person_bbox,
        raw_signals={
            "rule":              RULE_NAME,
            "me_lean":           pose.torso_lean_x,
            "neighbor_lean":     neighbor.torso_lean_x,
            "neighbor_bbox":     neighbor.bbox_xyxy,
            "sustained_seconds": sustained,
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
