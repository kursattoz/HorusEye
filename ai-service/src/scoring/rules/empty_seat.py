"""empty_seat rule — BL-204 (PRD-013 §7.2 TIER-1, §7.3 Phase A scoring).

A previously-tracked student who hasn't been seen for ≥60s emits MEDIUM,
≥120s emits HIGH. Brief absences (<10s — pencil drop, leaning) are
ignored. Once a fire has happened, the per-rule cooldown blocks repeats
until the track returns or a long enough silence passes.

Unlike phone_in_hand / gaze_diversion which run inside the per-track
loop of the publish handler, empty_seat needs to evaluate tracks that
are *no longer* in the YOLO output. The publish handler iterates
``track_store.states_for_camera(session_id, camera_id)`` every frame
and feeds each state through :func:`evaluate`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.scoring.rules import IncidentCandidate
from src.scoring.track_state import TrackState

RULE_NAME = "empty_seat"


@dataclass(frozen=True)
class EmptySeatConfig:
    grace_seconds:   float = 10.0    # ignore brief absences below this
    medium_seconds:  float = 60.0    # ≥ this → MEDIUM
    high_seconds:    float = 120.0   # ≥ this → HIGH
    cooldown_seconds: float = 60.0   # don't refire within this window


def evaluate(
    track_state: TrackState,
    ts: float,
    cfg: Optional[EmptySeatConfig] = None,
) -> Optional[IncidentCandidate]:
    """Return an incident candidate if the track has been silent long
    enough to cross the medium threshold, otherwise ``None``."""
    cfg = cfg or EmptySeatConfig()

    # Track must have been observed at least once
    if not track_state.samples:
        return None

    lost_for = ts - track_state.last_seen_at
    if lost_for < cfg.medium_seconds:
        return None
    if not track_state.cooldown_ok(RULE_NAME, cfg.cooldown_seconds, ts):
        return None

    severity = "high" if lost_for >= cfg.high_seconds else "medium"
    threshold = cfg.high_seconds if severity == "high" else cfg.medium_seconds

    last_sample = track_state.latest_sample()
    last_bbox = last_sample.person_bbox if last_sample else (0.0, 0.0, 0.0, 0.0)

    track_state.mark_fired(RULE_NAME, ts)

    return IncidentCandidate(
        incident_type="empty_seat",
        severity=severity,
        confidence=0.95,
        track_id=track_state.track_id,
        triggered_rules=(
            f"{RULE_NAME}:lost≥{int(threshold)}s",
        ),
        bbox=last_bbox,
        person_bbox=last_bbox,
        raw_signals={
            "rule":         RULE_NAME,
            "lost_seconds": lost_for,
            "last_seen_at": track_state.last_seen_at,
            "threshold_seconds": threshold,
        },
        occurred_at=ts,
    )
