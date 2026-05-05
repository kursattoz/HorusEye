"""head_turn rule tests — BL-197 (PRD-013 §7.2, §7.3 Phase A)."""

from __future__ import annotations

from src.detection.face_mesh import FaceMeshSignal
from src.scoring.rules.gaze_diversion import update_signal
from src.scoring.rules.head_turn import HeadTurnConfig, evaluate
from src.scoring.track_state import TrackState

PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)


def _signal(yaw: float) -> FaceMeshSignal:
    return FaceMeshSignal(
        yaw_deg=yaw, pitch_deg=0.0, roll_deg=0.0,
        eye_closed=False, confidence=0.9,
    )


def _drive_turn_episode(
    state: TrackState, cfg: HeadTurnConfig, base_ts: float, yaw: float = 50.0,
):
    """One ~2-second head turn followed by ~30s of forward-looking idle."""
    last = None
    for offset in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5):
        ts = base_ts + offset
        sig = _signal(yaw=yaw)
        update_signal(state, ts, sig)
        last = evaluate(state, ts, PERSON_BBOX, sig, cfg) or last
    for ts in range(int(base_ts + 3), int(base_ts + 35), 2):
        sig = _signal(yaw=5.0)
        update_signal(state, float(ts), sig)
        last = evaluate(state, float(ts), PERSON_BBOX, sig, cfg) or last
    return last


def test_yaw_below_threshold_no_fire() -> None:
    state = TrackState(track_id=1)
    cfg = HeadTurnConfig()
    last = _drive_turn_episode(state, cfg, 0.0, yaw=30.0)  # below 45°
    assert last is None
    assert state.fires_in_window("head_turn", 300.0, now=2.5) == 0


def test_single_head_turn_emits_low_severity_alone() -> None:
    state = TrackState(track_id=42)
    cfg = HeadTurnConfig()
    last = _drive_turn_episode(state, cfg, 0.0, yaw=50.0)
    assert last is not None
    assert last.incident_type == "head_turn"
    assert last.severity == "low"
    assert last.track_id == 42
    assert last.raw_signals["is_combo"] is False
    assert last.raw_signals["head_fires_5min"] == 1
    assert last.raw_signals["gaze_fires_5min"] == 0


def test_three_head_turns_with_gaze_fire_promotes_to_high() -> None:
    """3 head_turn fires + 1 prior gaze_diversion fire in 5 min → HIGH."""
    state = TrackState(track_id=1)
    cfg = HeadTurnConfig()

    # Plant a gaze_diversion fire 30s ago
    state.mark_fired("gaze_diversion", now=-30.0)

    last = None
    for base in (0.0, 40.0, 80.0):
        last = _drive_turn_episode(state, cfg, base) or last
    assert last is not None
    assert last.severity == "high"
    assert last.raw_signals["is_combo"] is True
    assert last.raw_signals["head_fires_5min"] == 3
    assert last.raw_signals["gaze_fires_5min"] >= 1


def test_three_head_turns_no_gaze_stays_low() -> None:
    """No gaze_diversion fire → even with 3 head_turns, severity stays LOW."""
    state = TrackState(track_id=1)
    cfg = HeadTurnConfig()

    last = None
    for base in (0.0, 40.0, 80.0):
        last = _drive_turn_episode(state, cfg, base) or last
    assert last is not None
    assert last.severity == "low"
    assert last.raw_signals["is_combo"] is False


def test_head_turn_cooldown_blocks_back_to_back() -> None:
    """Two sustained turns within cooldown_seconds → only one fire."""
    state = TrackState(track_id=1)
    cfg = HeadTurnConfig(cooldown_seconds=30.0)

    # First episode at t=0
    _drive_turn_episode(state, cfg, 0.0)
    # Second episode at t=10 (within cooldown — drive yaw without idle gap)
    last_2 = None
    for offset in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5):
        ts = 10.0 + offset
        sig = _signal(yaw=50.0)
        update_signal(state, ts, sig)
        last_2 = evaluate(state, ts, PERSON_BBOX, sig, cfg)
    assert last_2 is None  # cooldown still active


def test_raw_signals_contains_yaw_threshold_and_trace() -> None:
    state = TrackState(track_id=1)
    cfg = HeadTurnConfig()
    last = _drive_turn_episode(state, cfg, 0.0)
    assert last is not None
    assert last.raw_signals["yaw_threshold"] == 45.0
    assert isinstance(last.raw_signals["yaw_trace"], list)
    assert last.raw_signals["yaw_trace"]
