"""gaze_diversion rule — BL-196 (PRD-013 §7.2 TIER-2, §7.3 Phase A).

Two-stage detection:

* **Glance event** — a single sustained head-turn beyond the yaw
  threshold for ≥3 seconds. Counted via :meth:`TrackState.mark_fired`
  with rule name ``gaze_glance`` so it doesn't pollute the
  ``gaze_diversion`` cooldown table.
* **Incident** — ≥3 glance events in the past 5 minutes promote to
  MEDIUM severity, ≥6 promote to HIGH (PRD-013 §7.3 Phase A scoring).

The rule consumes :class:`~src.detection.face_mesh.FaceMeshSignal`
and writes a yaw trace into the track state for raw_signals
enrichment (BL-199).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.detection.face_mesh import FaceMeshSignal
from src.scoring.rules import IncidentCandidate
from src.scoring.track_state import TrackState

GLANCE_RULE = "gaze_glance"
INCIDENT_RULE = "gaze_diversion"
YAW_TRACE = "yaw_deg"


@dataclass(frozen=True)
class GazeDiversionConfig:
    yaw_threshold:        float = 30.0   # |yaw_deg| ≥ this counts as off-axis
    sustained_seconds:    float = 3.0    # how long off-axis to count as a glance
    glance_cooldown_s:    float = 30.0   # minimum gap between two glance events
    incident_cooldown_s:  float = 60.0   # cooldown between repeat incident emits
    fires_window_s:       float = 300.0  # 5-minute frequency window
    fires_for_medium:     int = 3
    fires_for_high:       int = 6


def update_signal(track_state: TrackState, ts: float, signal: FaceMeshSignal) -> None:
    """Push the yaw value onto the track's signal trace.

    Called every frame regardless of whether the rule fires; the trace
    is used by :func:`evaluate` to detect sustained diversion and by the
    raw_signals enrichment in BL-199.
    """
    track_state.record_signal(YAW_TRACE, ts, signal.yaw_deg)


def _seconds_above_threshold(
    trace: list[tuple[float, float]],
    yaw_threshold: float,
) -> float:
    """Walking back from the most recent sample, return the number of
    consecutive seconds for which |yaw_deg| ≥ ``yaw_threshold``.

    Returns 0.0 on an empty trace, or when the most recent sample is
    below threshold.
    """
    if not trace:
        return 0.0
    end_ts, end_val = trace[-1]
    if abs(end_val) < yaw_threshold:
        return 0.0

    # Find the earliest contiguous sample (from the end) still above threshold.
    earliest_ts = end_ts
    for ts, val in reversed(trace):
        if abs(val) < yaw_threshold:
            break
        earliest_ts = ts
    return end_ts - earliest_ts


def evaluate(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    signal: FaceMeshSignal,
    cfg: Optional[GazeDiversionConfig] = None,
) -> Optional[IncidentCandidate]:
    """Combine signal sample + window check + frequency count.

    Caller must invoke :func:`update_signal` exactly once per frame
    *before* calling this — that keeps the trace authoritative when a
    rule chain is composed (head_turn also reads the same trace).
    """
    cfg = cfg or GazeDiversionConfig()

    # Stage 1: glance event detection
    trace = track_state.signal_trace(YAW_TRACE)
    sustained_for = _seconds_above_threshold(trace, cfg.yaw_threshold)
    if (
        sustained_for >= cfg.sustained_seconds
        and track_state.cooldown_ok(GLANCE_RULE, cfg.glance_cooldown_s, ts)
    ):
        track_state.mark_fired(GLANCE_RULE, ts)

    # Stage 2: incident (frequency)
    fires = track_state.fires_in_window(GLANCE_RULE, cfg.fires_window_s, ts)
    if fires < cfg.fires_for_medium:
        return None
    if not track_state.cooldown_ok(INCIDENT_RULE, cfg.incident_cooldown_s, ts):
        return None

    severity = "high" if fires >= cfg.fires_for_high else "medium"
    confidence = min(0.99, 0.55 + 0.05 * fires)

    track_state.mark_fired(INCIDENT_RULE, ts)

    return IncidentCandidate(
        incident_type="gaze_diversion",
        severity=severity,
        confidence=confidence,
        track_id=track_state.track_id,
        triggered_rules=(
            f"{INCIDENT_RULE}:|yaw|≥{cfg.yaw_threshold:.0f}",
            f"{INCIDENT_RULE}:sustained≥{cfg.sustained_seconds:.1f}s",
            f"{INCIDENT_RULE}:fires_in_5min={fires}",
        ),
        bbox=person_bbox,
        person_bbox=person_bbox,
        raw_signals={
            "rule":              INCIDENT_RULE,
            "yaw_deg_now":       signal.yaw_deg,
            "pitch_deg_now":     signal.pitch_deg,
            "roll_deg_now":      signal.roll_deg,
            "sustained_seconds": sustained_for,
            "fires_in_5min":     fires,
            "yaw_trace":         trace[-30:],   # last ~30 samples for raw_signals viewer
            "yaw_threshold":     cfg.yaw_threshold,
        },
        occurred_at=ts,
    )
