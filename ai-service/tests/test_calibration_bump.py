"""Per-student calibration severity bump tests — BL-232 (Sprint 11)."""

from __future__ import annotations

import pytest

from src.scoring.calibration import apply_severity_bump


@pytest.mark.parametrize(
    "severity,bump,expected",
    [
        ("low",      1,  "medium"),
        ("low",      2,  "high"),
        ("medium",   1,  "high"),
        ("medium",   2,  "critical"),
        ("medium",  -1,  "low"),
        ("high",    -1,  "medium"),
        ("high",    -2,  "low"),
        ("critical", 0,  "critical"),
    ],
)
def test_apply_severity_bump_known(severity: str, bump: int, expected: str) -> None:
    assert apply_severity_bump(severity, bump) == expected


def test_apply_severity_bump_clamps_top() -> None:
    assert apply_severity_bump("critical", 1) == "critical"
    assert apply_severity_bump("critical", 2) == "critical"


def test_apply_severity_bump_clamps_bottom() -> None:
    assert apply_severity_bump("low", -1) == "low"
    assert apply_severity_bump("low", -2) == "low"


def test_apply_severity_bump_unknown_severity_defaults_to_medium() -> None:
    # Unknown severities anchor at 'medium' so a bump still produces a
    # sane label rather than crashing.
    assert apply_severity_bump("dismissed", 1) == "high"
    assert apply_severity_bump("dismissed", -1) == "low"
