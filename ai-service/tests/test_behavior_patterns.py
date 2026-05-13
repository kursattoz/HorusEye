"""Per-student behavior pattern detection tests — BL-228 (Sprint 11)."""

from __future__ import annotations

import pytest

from src.scoring.behavior_patterns import (
    CHRONIC_PHONE_MIN_FIRES,
    PATTERN_COOLDOWN_SECS,
    SUSTAINED_INTER_MIN_FIRES,
    _reset_for_tests,
    evaluate_after_incident,
)
from src.scoring.rules import IncidentCandidate


def _candidate(
    *, incident_type: str, occurred_at: float, student_id: str | None = "STU-1",
) -> IncidentCandidate:
    return IncidentCandidate(
        incident_type=incident_type,
        severity="medium",
        confidence=0.7,
        track_id=1,
        triggered_rules=(incident_type,),
        bbox=(0, 0, 1, 1),
        person_bbox=(0, 0, 2, 2),
        occurred_at=occurred_at,
        student_id=student_id,
    )


@pytest.fixture(autouse=True)
def _reset() -> None:
    _reset_for_tests()


def test_pre_match_track_ids_are_skipped() -> None:
    result = evaluate_after_incident(
        _candidate(incident_type="phone_detected", occurred_at=100.0, student_id="track:7"),
        "session-x",
    )
    assert result == []


def test_none_student_id_skipped() -> None:
    result = evaluate_after_incident(
        _candidate(incident_type="phone_detected", occurred_at=100.0, student_id=None),
        "session-x",
    )
    assert result == []


def test_chronic_phone_use_fires_on_third_within_window() -> None:
    for ts in (100.0, 200.0):
        assert evaluate_after_incident(
            _candidate(incident_type="phone_detected", occurred_at=ts),
            "session-x",
        ) == []

    fired = evaluate_after_incident(
        _candidate(incident_type="phone_detected", occurred_at=300.0),
        "session-x",
    )
    assert len(fired) == 1
    pattern = fired[0]
    assert pattern.triggered_rules == ("chronic_phone_use",)
    assert pattern.severity == "high"
    assert pattern.raw_signals["pattern"] == "chronic_phone_use"
    assert pattern.raw_signals["fires_in_window"] == CHRONIC_PHONE_MIN_FIRES


def test_pattern_does_not_refire_within_cooldown() -> None:
    for ts in (100.0, 200.0, 300.0):
        evaluate_after_incident(
            _candidate(incident_type="phone_detected", occurred_at=ts),
            "session-x",
        )
    # 4th, well inside cooldown
    fired = evaluate_after_incident(
        _candidate(incident_type="phone_detected", occurred_at=301.0),
        "session-x",
    )
    assert fired == []


def test_pattern_refires_after_cooldown() -> None:
    for ts in (100.0, 200.0, 300.0):
        evaluate_after_incident(
            _candidate(incident_type="phone_detected", occurred_at=ts),
            "session-x",
        )
    refire_ts = 300.0 + PATTERN_COOLDOWN_SECS + 1.0
    # need to drive a fresh count of 3 inside the new window
    for ts in (refire_ts - 200, refire_ts - 100):
        evaluate_after_incident(
            _candidate(incident_type="phone_detected", occurred_at=ts),
            "session-x",
        )
    fired = evaluate_after_incident(
        _candidate(incident_type="phone_detected", occurred_at=refire_ts),
        "session-x",
    )
    assert len(fired) == 1
    assert fired[0].triggered_rules == ("chronic_phone_use",)


def test_sustained_interaction_fires_on_mixed_gaze_head() -> None:
    types = ["gaze_diversion", "head_turn", "gaze_diversion", "head_turn"]
    fired_history: list[IncidentCandidate] = []
    for i, t in enumerate(types):
        result = evaluate_after_incident(
            _candidate(incident_type=t, occurred_at=100.0 + i * 30),
            "session-x",
        )
        fired_history.extend(result)
    assert any(p.triggered_rules == ("sustained_interaction",) for p in fired_history)
    assert SUSTAINED_INTER_MIN_FIRES == 4


def test_patterns_are_scoped_per_session() -> None:
    # 3 fires in session-A should not affect session-B
    for ts in (100.0, 200.0, 300.0):
        evaluate_after_incident(
            _candidate(incident_type="phone_detected", occurred_at=ts),
            "session-A",
        )
    # Now session-B with only one fire: must not flag the pattern
    fired = evaluate_after_incident(
        _candidate(incident_type="phone_detected", occurred_at=400.0),
        "session-B",
    )
    assert fired == []
