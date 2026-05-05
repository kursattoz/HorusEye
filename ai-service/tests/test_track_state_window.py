"""TrackState window aggregation tests — BL-198.

Covers fire history + signal traces added in Sprint 8.
"""

from __future__ import annotations

from src.scoring.track_state import TrackState


def test_fires_in_window_counts_only_named_rule() -> None:
    st = TrackState(track_id=1, window_seconds=300.0)
    st.mark_fired("gaze_diversion", now=10.0)
    st.mark_fired("phone_in_hand",  now=12.0)
    st.mark_fired("gaze_diversion", now=20.0)
    assert st.fires_in_window("gaze_diversion", 60.0, now=25.0) == 2
    assert st.fires_in_window("phone_in_hand",  60.0, now=25.0) == 1


def test_fires_in_window_respects_lookback_horizon() -> None:
    st = TrackState(track_id=1, window_seconds=300.0)
    st.mark_fired("gaze_diversion", now=10.0)
    st.mark_fired("gaze_diversion", now=200.0)
    # Lookback 30s only sees the t=200 fire
    assert st.fires_in_window("gaze_diversion", 30.0, now=210.0) == 1
    # Lookback 300s catches both
    assert st.fires_in_window("gaze_diversion", 300.0, now=210.0) == 2


def test_fired_history_evicts_when_oldest_falls_out_of_window() -> None:
    st = TrackState(track_id=1, window_seconds=10.0)
    st.mark_fired("gaze_diversion", now=0.0)
    st.mark_fired("gaze_diversion", now=5.0)
    # Push a sample at t=15 → evicts t=0 fire (cutoff = 15 - 10 = 5; t=0 < 5)
    st.add(ts=15.0, person_bbox=(0, 0, 1, 1), overlapping_classes=[])
    # Now only the t=5 fire remains (t=5 >= cutoff 5 is OK)
    assert len(st.fired_history) == 1
    assert st.fired_history[0] == ("gaze_diversion", 5.0)


def test_signal_trace_records_and_evicts() -> None:
    st = TrackState(track_id=1, window_seconds=10.0)
    for ts in (0.0, 2.0, 4.0, 6.0):
        st.record_signal("yaw_deg", ts=ts, value=ts * 5)

    trace = st.signal_trace("yaw_deg")
    assert trace == [(0.0, 0.0), (2.0, 10.0), (4.0, 20.0), (6.0, 30.0)]

    # Push a trace sample at t=15 → cutoff 5 → 0,2,4 evicted
    st.record_signal("yaw_deg", ts=15.0, value=75.0)
    trace2 = st.signal_trace("yaw_deg")
    assert trace2 == [(6.0, 30.0), (15.0, 75.0)]


def test_signal_trace_unknown_rule_returns_empty() -> None:
    st = TrackState(track_id=1)
    assert st.signal_trace("nonexistent") == []


def test_cooldown_unaffected_by_history_truncation() -> None:
    """fired_at is the cooldown source of truth; fired_history can drop
    older entries without breaking cooldown checks."""
    st = TrackState(track_id=1, window_seconds=10.0)
    st.mark_fired("gaze_diversion", now=0.0)
    # Push samples to drive cutoff past t=0, evicting the history entry
    st.add(ts=20.0, person_bbox=(0, 0, 1, 1), overlapping_classes=[])
    assert len(st.fired_history) == 0
    # Cooldown still tracked via fired_at
    assert st.fired_at["gaze_diversion"] == 0.0
    assert st.cooldown_ok("gaze_diversion", 30.0, now=10.0) is False
    assert st.cooldown_ok("gaze_diversion", 30.0, now=31.0) is True
