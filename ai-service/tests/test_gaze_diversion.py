"""gaze_diversion rule tests — BL-196 (PRD-013 §7.2 TIER-2, §7.3 Phase A)."""

from __future__ import annotations

import pytest

from src.detection.face_mesh import FaceMeshSignal
from src.scoring.rules.gaze_diversion import (
    GazeDiversionConfig,
    _seconds_above_threshold,
    evaluate,
    update_signal,
)
from src.scoring.track_state import TrackState

PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)


def _signal(yaw: float, pitch: float = 0.0, roll: float = 0.0) -> FaceMeshSignal:
    return FaceMeshSignal(
        yaw_deg=yaw, pitch_deg=pitch, roll_deg=roll,
        eye_closed=False, confidence=0.9,
    )


# ───────── helper math ─────────

def test_seconds_above_threshold_empty() -> None:
    assert _seconds_above_threshold([], 30.0) == 0.0


def test_seconds_above_threshold_below_returns_zero() -> None:
    trace = [(0.0, 10.0), (1.0, 12.0)]
    assert _seconds_above_threshold(trace, 30.0) == 0.0


def test_seconds_above_threshold_continuous() -> None:
    trace = [(0.0, 35.0), (1.0, 36.0), (2.0, 32.0), (3.0, 40.0)]
    assert _seconds_above_threshold(trace, 30.0) == pytest.approx(3.0)


def test_seconds_above_threshold_breaks_at_below_sample() -> None:
    # Latest 4 samples: 35, 36, 5, 32, 40 → only the last 2 are above contiguous
    trace = [(0.0, 35.0), (1.0, 36.0), (2.0, 5.0), (3.0, 32.0), (4.0, 40.0)]
    assert _seconds_above_threshold(trace, 30.0) == pytest.approx(1.0)


# ───────── glance event ─────────

def test_no_glance_below_threshold() -> None:
    """Yaw never crosses 30° → no glance, no incident."""
    state = TrackState(track_id=1)
    cfg = GazeDiversionConfig()
    for ts in (0.0, 1.0, 2.0, 3.0):
        sig = _signal(yaw=20.0)
        update_signal(state, ts, sig)
        cand = evaluate(state, ts, PERSON_BBOX, sig, cfg)
        assert cand is None
    assert state.fires_in_window("gaze_glance", 300.0, now=3.0) == 0


def test_glance_recorded_after_sustained_yaw() -> None:
    """Single 3.5-second yaw sustained → 1 glance event recorded, no incident yet."""
    state = TrackState(track_id=1)
    cfg = GazeDiversionConfig()
    for ts in (0.0, 1.0, 2.0, 3.0, 4.0):
        sig = _signal(yaw=35.0)
        update_signal(state, ts, sig)
        cand = evaluate(state, ts, PERSON_BBOX, sig, cfg)
        assert cand is None
    assert state.fires_in_window("gaze_glance", 300.0, now=4.0) == 1


def _drive_glance_episode(
    state: TrackState, cfg: GazeDiversionConfig, base_ts: float,
):
    """Simulate one ~4s glance starting at base_ts followed by ~36s of
    idle (low-yaw) frames so the next glance's _seconds_above_threshold
    walk doesn't bridge across the idle interval."""
    last = None
    # 4 seconds of sustained yaw
    for offset in (0.0, 1.0, 2.0, 3.0):
        ts = base_ts + offset
        sig = _signal(yaw=35.0)
        update_signal(state, ts, sig)
        last = evaluate(state, ts, PERSON_BBOX, sig, cfg) or last
    # 36 seconds of forward-looking idle so the trace doesn't appear continuous
    for ts in range(int(base_ts + 4), int(base_ts + 40), 2):
        sig = _signal(yaw=5.0)
        update_signal(state, float(ts), sig)
        last = evaluate(state, float(ts), PERSON_BBOX, sig, cfg) or last
    return last


def test_three_glances_promote_to_medium_incident() -> None:
    """Three glance episodes within 5 min → MEDIUM incident on the 3rd."""
    state = TrackState(track_id=42)
    cfg = GazeDiversionConfig()

    cand = None
    for base in (0.0, 40.0, 80.0):
        cand = _drive_glance_episode(state, cfg, base) or cand

    assert cand is not None
    assert cand.incident_type == "gaze_diversion"
    assert cand.severity == "medium"
    assert cand.track_id == 42
    assert cand.raw_signals["fires_in_5min"] == 3


def test_six_glances_promote_to_high_incident() -> None:
    """Six glance episodes within 5 min → HIGH severity."""
    state = TrackState(track_id=1)
    cfg = GazeDiversionConfig(incident_cooldown_s=0.0)  # allow rapid re-emits

    last = None
    for k in range(6):
        last = _drive_glance_episode(state, cfg, float(k * 40)) or last

    assert last is not None
    assert last.severity == "high"
    assert last.raw_signals["fires_in_5min"] >= 6


def test_glance_cooldown_blocks_back_to_back_events() -> None:
    """Continuous yaw shouldn't produce 2 glance events within glance_cooldown_s."""
    state = TrackState(track_id=1)
    cfg = GazeDiversionConfig(glance_cooldown_s=30.0)

    # 10 seconds of continuous yaw — should produce only 1 glance event
    for ts in [t / 2 for t in range(20)]:
        sig = _signal(yaw=35.0)
        update_signal(state, ts, sig)
        evaluate(state, ts, PERSON_BBOX, sig, cfg)

    fires = state.fires_in_window("gaze_glance", 300.0, now=10.0)
    assert fires == 1


def test_incident_cooldown_blocks_repeat_emission() -> None:
    """After firing once, repeat fires_in_5min ≥ 3 within cooldown should be silent."""
    state = TrackState(track_id=1)
    cfg = GazeDiversionConfig(incident_cooldown_s=300.0)

    cand_1 = None
    for base in (0.0, 40.0, 80.0):
        cand_1 = _drive_glance_episode(state, cfg, base) or cand_1

    assert cand_1 is not None

    # 4th glance episode → fires_in_5min becomes 4, but incident cooldown should block
    cand_2 = _drive_glance_episode(state, cfg, 120.0)
    assert cand_2 is None


def test_raw_signals_contains_yaw_trace_and_thresholds() -> None:
    state = TrackState(track_id=1)
    cfg = GazeDiversionConfig()

    last = None
    for base in (0.0, 40.0, 80.0):
        last = _drive_glance_episode(state, cfg, base) or last

    assert last is not None
    assert last.raw_signals["yaw_threshold"] == 30.0
    assert last.raw_signals["fires_in_5min"] == 3
    assert isinstance(last.raw_signals["yaw_trace"], list)
