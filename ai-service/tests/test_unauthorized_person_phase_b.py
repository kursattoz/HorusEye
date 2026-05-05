"""unauthorized_person Phase B (face-match) tests — BL-221."""

from __future__ import annotations

import pytest

from src.scoring.rules.unauthorized_person import (
    UnauthorizedPersonPhaseBConfig,
    evaluate_phase_b,
)
from src.scoring.track_state import TrackState

PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)


def _track_with_age(track_id: int, age_seconds: float, *, attempts_made: bool = True) -> TrackState:
    state = TrackState(track_id=track_id)
    state.add(ts=0.0, person_bbox=PERSON_BBOX, overlapping_classes=[])
    state.add(ts=age_seconds, person_bbox=PERSON_BBOX, overlapping_classes=[])
    if attempts_made:
        state.last_match_attempt_at = age_seconds
    return state


def test_no_fire_when_track_matched() -> None:
    state = _track_with_age(1, age_seconds=60.0)
    state.matched_student_id = "S1"
    cand = evaluate_phase_b(state, ts=60.0, person_bbox=PERSON_BBOX)
    assert cand is None


def test_no_fire_when_track_too_young() -> None:
    state = _track_with_age(1, age_seconds=10.0)   # < 30s
    cand = evaluate_phase_b(state, ts=10.0, person_bbox=PERSON_BBOX)
    assert cand is None


def test_no_fire_before_first_match_attempt() -> None:
    state = _track_with_age(1, age_seconds=60.0, attempts_made=False)
    cand = evaluate_phase_b(state, ts=60.0, person_bbox=PERSON_BBOX)
    assert cand is None


def test_fires_critical_when_unmatched_after_30s() -> None:
    state = _track_with_age(42, age_seconds=35.0)
    state.best_match_similarity = 0.42  # was attempted, was below threshold
    cand = evaluate_phase_b(state, ts=35.0, person_bbox=PERSON_BBOX)
    assert cand is not None
    assert cand.incident_type == "unauthorized_person"
    assert cand.severity == "critical"
    assert cand.track_id == 42
    assert cand.raw_signals["phase"] == "b"
    assert cand.raw_signals["best_match_similarity"] == 0.42
    assert cand.raw_signals["track_age_seconds"] == 35.0


def test_cooldown_blocks_back_to_back() -> None:
    state = _track_with_age(1, age_seconds=35.0)
    cfg = UnauthorizedPersonPhaseBConfig(cooldown_seconds=300.0)

    cand_1 = evaluate_phase_b(state, ts=35.0, person_bbox=PERSON_BBOX, cfg=cfg)
    assert cand_1 is not None

    state.add(ts=60.0, person_bbox=PERSON_BBOX, overlapping_classes=[])
    state.last_match_attempt_at = 60.0
    cand_2 = evaluate_phase_b(state, ts=60.0, person_bbox=PERSON_BBOX, cfg=cfg)
    assert cand_2 is None  # cooldown still active

    # Build a fresh observation history so the track is still old enough
    # under the 300s rolling window (samples older than now-300 evict).
    state.add(ts=350.0, person_bbox=PERSON_BBOX, overlapping_classes=[])
    state.add(ts=400.0, person_bbox=PERSON_BBOX, overlapping_classes=[])
    state.last_match_attempt_at = 400.0
    cand_3 = evaluate_phase_b(state, ts=400.0, person_bbox=PERSON_BBOX, cfg=cfg)
    assert cand_3 is not None  # cooldown cleared


def test_custom_sustained_seconds() -> None:
    state = _track_with_age(1, age_seconds=15.0)
    cfg = UnauthorizedPersonPhaseBConfig(sustained_seconds=10.0)
    cand = evaluate_phase_b(state, ts=15.0, person_bbox=PERSON_BBOX, cfg=cfg)
    assert cand is not None


def test_phase_b_coexists_with_phase_a() -> None:
    """A track can match neither — Phase B fires; the SessionRuleState
    Phase A path is unrelated and not exercised here."""
    state = _track_with_age(1, age_seconds=60.0)
    cand = evaluate_phase_b(state, ts=60.0, person_bbox=PERSON_BBOX)
    assert cand is not None
    assert cand.raw_signals["phase"] == "b"
