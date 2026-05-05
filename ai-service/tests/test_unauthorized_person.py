"""unauthorized_person rule tests — BL-205."""

from __future__ import annotations

from src.scoring.rules.unauthorized_person import (
    UnauthorizedPersonConfig,
    evaluate,
)
from src.scoring.session_state import SessionRuleState


def _state() -> SessionRuleState:
    return SessionRuleState(session_id="s1", camera_id="c1")


def test_no_fire_when_observed_equals_expected() -> None:
    cand = evaluate(_state(), ts=0.0, expected_count=5, observed_count=5)
    assert cand is None


def test_no_fire_when_observed_below_expected() -> None:
    cand = evaluate(_state(), ts=0.0, expected_count=5, observed_count=3)
    assert cand is None


def test_first_frame_of_excess_records_timestamp_no_fire() -> None:
    state = _state()
    cand = evaluate(state, ts=10.0, expected_count=5, observed_count=6)
    assert cand is None
    assert state.excess_started_at == 10.0


def test_excess_below_sustained_seconds_no_fire() -> None:
    state = _state()
    evaluate(state, ts=10.0, expected_count=5, observed_count=6)
    cand = evaluate(state, ts=15.0, expected_count=5, observed_count=6)  # 5s
    assert cand is None
    assert state.excess_started_at == 10.0


def test_excess_sustained_fires_critical() -> None:
    state = _state()
    evaluate(state, ts=10.0, expected_count=5, observed_count=6)   # start
    cand = evaluate(state, ts=22.0, expected_count=5, observed_count=6)  # 12s sustained
    assert cand is not None
    assert cand.incident_type == "unauthorized_person"
    assert cand.severity == "critical"
    assert cand.track_id is None
    assert cand.raw_signals["expected_count"] == 5
    assert cand.raw_signals["observed_count"] == 6
    assert cand.raw_signals["excess_for_seconds"] == 12.0


def test_excess_resolved_resets_clock() -> None:
    state = _state()
    evaluate(state, ts=10.0, expected_count=5, observed_count=6)
    # observed drops back to expected
    evaluate(state, ts=15.0, expected_count=5, observed_count=5)
    assert state.excess_started_at is None
    # New excess starts at t=20; 12s sustained should NOT fire because
    # the clock restarted from t=20
    evaluate(state, ts=20.0, expected_count=5, observed_count=6)
    cand = evaluate(state, ts=25.0, expected_count=5, observed_count=6)
    assert cand is None


def test_cooldown_blocks_immediate_refire() -> None:
    state = _state()
    cfg = UnauthorizedPersonConfig(cooldown_seconds=120.0)
    evaluate(state, ts=10.0, expected_count=5, observed_count=6, cfg=cfg)
    first = evaluate(state, ts=22.0, expected_count=5, observed_count=6, cfg=cfg)
    assert first is not None

    # 30s later, still over → cooldown blocks
    second = evaluate(state, ts=52.0, expected_count=5, observed_count=6, cfg=cfg)
    assert second is None

    # 130s after first fire → cooldown cleared, refires
    third = evaluate(state, ts=152.0, expected_count=5, observed_count=6, cfg=cfg)
    assert third is not None


def test_custom_sustained_seconds_via_config() -> None:
    state = _state()
    cfg = UnauthorizedPersonConfig(sustained_seconds=5.0)
    evaluate(state, ts=10.0, expected_count=5, observed_count=6, cfg=cfg)
    cand = evaluate(state, ts=16.0, expected_count=5, observed_count=6, cfg=cfg)  # 6s
    assert cand is not None
