"""head_turn rule — BL-197 (PRD-013 §7.2, §7.3 Phase A scoring).

A head turn (|yaw| ≥ 45°) sustained for ≥2 seconds emits a LOW
``head_turn`` incident on its own. Three or more turns in a 5-minute
window combined with at least one ``gaze_diversion`` fire in the same
window promote the incident to HIGH per the §7.3 combo line:

    head_turn ≥3 kez / 5 dakika VE gaze ile birlikte → HIGH
    head_turn tek başına → LOW

Reads the same ``yaw_deg`` signal trace populated by
:func:`gaze_diversion.update_signal` — call that once per frame BEFORE
evaluating either rule. This avoids double-recording the yaw value.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.detection.face_mesh import FaceMeshSignal
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.gaze_diversion import (
    INCIDENT_RULE as GAZE_INCIDENT_RULE,
    YAW_TRACE,
    _seconds_above_threshold,
)
from src.scoring.track_state import TrackState

RULE_NAME = "head_turn"


@dataclass(frozen=True)
class HeadTurnConfig:
    yaw_threshold:        float = 45.0
    sustained_seconds:    float = 2.0
    cooldown_seconds:     float = 30.0
    fires_window_s:       float = 300.0
    fires_for_combo:      int = 3       # ≥ this many head_turns + gaze fire → HIGH


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    signal: FaceMeshSignal,
    cfg: Optional[HeadTurnConfig] = None,
) -> Optional[IncidentCandidate]:
    """Emit a head_turn incident when sustained-turn condition holds.

    Severity:
    - HIGH if (head_turn fires_in_5min + 1) ≥ fires_for_combo AND
      gaze_diversion fired at least once in the same window.
    - LOW otherwise.
    """
    cfg = cfg or HeadTurnConfig()

    trace = track_state.signal_trace(YAW_TRACE)
    sustained_for = _seconds_above_threshold(trace, cfg.yaw_threshold)
    if sustained_for < cfg.sustained_seconds:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    head_fires_inc_self = track_state.fires_in_window(
        RULE_NAME, cfg.fires_window_s, ts,
    ) + 1
    gaze_fires = track_state.fires_in_window(
        GAZE_INCIDENT_RULE, cfg.fires_window_s, ts,
    )
    is_combo = head_fires_inc_self >= cfg.fires_for_combo and gaze_fires >= 1
    severity = "high" if is_combo else "low"
    confidence = 0.85 if is_combo else 0.65

    track_state.mark_fired(RULE_NAME, ts)

    triggered = [
        f"{RULE_NAME}:|yaw|≥{cfg.yaw_threshold:.0f}",
        f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.1f}s",
    ]
    if is_combo:
        triggered.append(
            f"{RULE_NAME}:combo gaze_fires={gaze_fires} head_fires={head_fires_inc_self}",
        )

    return IncidentCandidate(
        incident_type="head_turn",
        severity=severity,
        confidence=confidence,
        track_id=track_state.track_id,
        triggered_rules=tuple(triggered),
        bbox=person_bbox,
        person_bbox=person_bbox,
        raw_signals={
            "rule":              RULE_NAME,
            "yaw_deg_now":       signal.yaw_deg,
            "pitch_deg_now":     signal.pitch_deg,
            "roll_deg_now":      signal.roll_deg,
            "sustained_seconds": sustained_for,
            "head_fires_5min":   head_fires_inc_self,
            "gaze_fires_5min":   gaze_fires,
            "is_combo":          is_combo,
            "yaw_trace":         trace[-30:],
            "yaw_threshold":     cfg.yaw_threshold,
        },
        occurred_at=ts,
    )
