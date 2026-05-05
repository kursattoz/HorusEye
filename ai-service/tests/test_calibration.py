"""Severity calibration tests — BL-207."""

from __future__ import annotations

import pytest

from src.scoring.calibration import (
    SEVERITY_RANK,
    SEVERITY_RISK_SCORE,
    aggregate_risk_score,
    severity_rank,
    severity_to_risk_score,
)


def test_severity_risk_score_table_matches_prd() -> None:
    assert SEVERITY_RISK_SCORE == {
        "low":      0.25,
        "medium":   0.50,
        "high":     0.75,
        "critical": 0.90,
    }


def test_severity_to_risk_score_known_values() -> None:
    assert severity_to_risk_score("low")      == 0.25
    assert severity_to_risk_score("medium")   == 0.50
    assert severity_to_risk_score("high")     == 0.75
    assert severity_to_risk_score("critical") == 0.90


def test_severity_to_risk_score_unknown_returns_zero() -> None:
    assert severity_to_risk_score("dismissed") == 0.0
    assert severity_to_risk_score("") == 0.0


def test_aggregate_risk_score_takes_max() -> None:
    assert aggregate_risk_score(["low", "medium", "high"]) == pytest.approx(0.75)


def test_aggregate_risk_score_empty_iterable_is_zero() -> None:
    assert aggregate_risk_score([]) == 0.0


def test_aggregate_risk_score_ignores_unknowns() -> None:
    assert aggregate_risk_score(["medium", "wat", "low"]) == pytest.approx(0.50)


def test_severity_rank_ordering() -> None:
    assert SEVERITY_RANK["critical"] > SEVERITY_RANK["high"]
    assert SEVERITY_RANK["high"]     > SEVERITY_RANK["medium"]
    assert SEVERITY_RANK["medium"]   > SEVERITY_RANK["low"]
    assert severity_rank("nonsense") == 0


def test_sort_by_severity_rank() -> None:
    incidents = ["medium", "critical", "low", "high"]
    sorted_inc = sorted(incidents, key=severity_rank, reverse=True)
    assert sorted_inc == ["critical", "high", "medium", "low"]
