"""hand_to_ear_mouth rule — BL-300 (PRD-021 §3 Sprint 17).

Hand near the ear or mouth ≥ ``sustained_seconds`` is the classic
"whispering / hidden earpiece" pose. Combo with earbuds_detected
bumps to CRITICAL.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.detection.pose import PoseSignal
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.pose_helpers import hand_near_ear_or_mouth
from src.scoring.track_state import TrackState

RULE_NAME           = "hand_to_ear_mouth"
HAND_NEAR_TRACE_NAME = "hand_near_target"


@dataclass(frozen=True)
class HandToEarMouthConfig:
    distance_threshold: float = 0.08
    sustained_seconds:  float = 2.0
    cooldown_seconds:   float = 30.0
    combo_window_s:     float = 60.0


def update_signal(track_state: TrackState, ts: float, pose: PoseSignal) -> None:
    detection = hand_near_ear_or_mouth(pose)
    track_state.record_signal(HAND_NEAR_TRACE_NAME, ts, 1.0 if detection else 0.0)


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    pose: PoseSignal,
    cfg: Optional[HandToEarMouthConfig] = None,
) -> Optional[IncidentCandidate]:
    cfg = cfg or HandToEarMouthConfig()
    update_signal(track_state, ts, pose)

    target = hand_near_ear_or_mouth(pose, distance_threshold=cfg.distance_threshold)
    if target is None:
        return None

    trace = track_state.signal_trace(HAND_NEAR_TRACE_NAME)
    sustained = _consecutive_seconds_truthy(trace)
    if sustained < cfg.sustained_seconds:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    earbud_fires = track_state.fires_in_window("earbuds_detected", cfg.combo_window_s, ts)
    is_critical  = earbud_fires > 0
    severity     = "critical" if is_critical else "medium"
    confidence   = 0.90 if is_critical else 0.70

    track_state.mark_fired(RULE_NAME, ts)

    triggered = [
        f"{RULE_NAME}:target={target}",
        f"{RULE_NAME}:dist<{cfg.distance_threshold:.2f}",
        f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
    ]
    if is_critical:
        triggered.append(f"{RULE_NAME}:critical earbud_fires={earbud_fires}")

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
            "target":             target,
            "sustained_seconds":  sustained,
            "earbud_fires_60s":   earbud_fires,
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
