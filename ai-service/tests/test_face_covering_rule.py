"""BL-320 face_covering rule — incident emission tests."""

from __future__ import annotations

import pytest

from src.scoring.rules.face_covering import (
    evaluate as eval_face, FaceCoveringConfig,
)
from src.scoring.track_state import TrackState


def _track() -> TrackState:
    return TrackState(track_id=1, window_seconds=600.0)


def test_face_covering_fires_on_sustained_detection() -> None:
    track = _track()
    cfg = FaceCoveringConfig(sustained_seconds=2.0, min_confidence=0.50)
    bbox = (0.10, 0.20, 0.30, 0.80)
    incident = None
    for ts in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5]:
        incident = eval_face(
            track, ts, bbox,
            face_covering_detected=True,
            detection_confidence=0.85,
            cfg=cfg,
        )
        if incident is not None:
            break
    assert incident is not None
    assert incident.incident_type == "face_covering"
    assert incident.confidence >= 0.65


def test_face_covering_silent_below_min_confidence() -> None:
    track = _track()
    cfg = FaceCoveringConfig(sustained_seconds=1.0, min_confidence=0.80)
    bbox = (0.10, 0.20, 0.30, 0.80)
    for ts in [0.0, 0.5, 1.0, 1.5]:
        incident = eval_face(
            track, ts, bbox,
            face_covering_detected=True,
            detection_confidence=0.50,    # below min
            cfg=cfg,
        )
        assert incident is None


def test_face_covering_promotes_severity_on_gaze_combo() -> None:
    track = _track()
    # Seed a recent gaze_diversion fire so the combo path is taken.
    track.mark_fired("gaze_diversion", 5.0)

    cfg = FaceCoveringConfig(sustained_seconds=1.0, min_confidence=0.50)
    bbox = (0.10, 0.20, 0.30, 0.80)
    incident = None
    for ts in [6.0, 6.5, 7.0, 7.5]:
        incident = eval_face(
            track, ts, bbox,
            face_covering_detected=True,
            detection_confidence=0.85,
            cfg=cfg,
        )
        if incident is not None:
            break
    assert incident is not None
    assert incident.severity == "high"
    assert incident.raw_signals["is_combo"] is True
