"""empty_seat rule tests — BL-204."""

from __future__ import annotations

from src.scoring.rules.empty_seat import EmptySeatConfig, evaluate
from src.scoring.track_state import TrackState

PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)


def _seen(state: TrackState, ts: float) -> None:
    state.add(ts=ts, person_bbox=PERSON_BBOX, overlapping_classes=[])


def test_no_fire_when_track_never_seen() -> None:
    state = TrackState(track_id=1)
    cand = evaluate(state, ts=200.0)
    assert cand is None


def test_no_fire_during_grace_period() -> None:
    state = TrackState(track_id=1)
    _seen(state, ts=0.0)
    # 5s after last seen → below grace
    assert evaluate(state, ts=5.0) is None
    # 50s after last seen → still below medium threshold
    assert evaluate(state, ts=50.0) is None


def test_fires_medium_at_60_seconds_lost() -> None:
    state = TrackState(track_id=42)
    _seen(state, ts=0.0)
    cand = evaluate(state, ts=60.0)
    assert cand is not None
    assert cand.incident_type == "empty_seat"
    assert cand.severity == "medium"
    assert cand.track_id == 42
    assert cand.raw_signals["lost_seconds"] == 60.0
    assert cand.raw_signals["threshold_seconds"] == 60.0
    assert cand.triggered_rules == ("empty_seat:lost≥60s",)


def test_fires_high_at_120_seconds_lost() -> None:
    state = TrackState(track_id=1)
    _seen(state, ts=0.0)
    cand = evaluate(state, ts=130.0)
    assert cand is not None
    assert cand.severity == "high"
    assert cand.raw_signals["threshold_seconds"] == 120.0
    assert cand.triggered_rules == ("empty_seat:lost≥120s",)


def test_cooldown_blocks_immediate_refire() -> None:
    state = TrackState(track_id=1)
    _seen(state, ts=0.0)
    cand_1 = evaluate(state, ts=70.0)
    assert cand_1 is not None

    # Second eval inside cooldown window
    cand_2 = evaluate(state, ts=80.0)
    assert cand_2 is None

    # After cooldown clears the rule can re-emit (and severity bumps to HIGH)
    cand_3 = evaluate(state, ts=140.0)
    assert cand_3 is not None
    assert cand_3.severity == "high"


def test_track_returning_resets_lost_clock() -> None:
    """When the track is seen again, last_seen_at advances and the rule stays silent."""
    state = TrackState(track_id=1)
    _seen(state, ts=0.0)
    # Lost from t=0..t=50, then seen again at t=55
    _seen(state, ts=55.0)
    # 50s after the latest seen — still below medium threshold
    assert evaluate(state, ts=105.0) is None
    # 65s after the latest seen — fires MEDIUM
    cand = evaluate(state, ts=120.0)
    assert cand is not None
    assert cand.severity == "medium"


def test_bbox_anchors_to_last_known_position() -> None:
    state = TrackState(track_id=1)
    custom_bbox = (0.5, 0.5, 0.7, 0.9)
    state.add(ts=0.0, person_bbox=custom_bbox, overlapping_classes=[])
    cand = evaluate(state, ts=70.0)
    assert cand is not None
    assert cand.bbox == custom_bbox
    assert cand.person_bbox == custom_bbox


def test_custom_thresholds_via_config() -> None:
    state = TrackState(track_id=1)
    _seen(state, ts=0.0)
    cfg = EmptySeatConfig(medium_seconds=30.0, high_seconds=90.0)
    # 35s lost > custom medium threshold but < high
    cand = evaluate(state, ts=35.0, cfg=cfg)
    assert cand is not None
    assert cand.severity == "medium"
    assert cand.raw_signals["threshold_seconds"] == 30.0
