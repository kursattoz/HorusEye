"""Severity calibration table — BL-207 (PRD-013 §7.3 Phase A scoring).

Sprint 7 + 8 rules each carried their own confidence proxy. This
module centralizes the **severity → risk_score** mapping that the
incidents row needs (``incidents.risk_score``) and provides an
``aggregate_risk_score`` helper for callers (e.g. session-level
dashboards, post-exam reports) that need to compose multiple
incidents into a single number.

PRD-013 §7.3 (Phase A) defines the canonical mapping:

    LOW=0.25, MEDIUM=0.50, HIGH=0.75, CRITICAL=0.90

Phase B replaces this with multi-signal fusion (PRD-013 §7.3 Phase B
formula); this module is the seam where that future formula lives.
"""

from __future__ import annotations

from typing import Iterable

SEVERITY_RISK_SCORE: dict[str, float] = {
    "low":      0.25,
    "medium":   0.50,
    "high":     0.75,
    "critical": 0.90,
}

# Severity escalation order — used by post-exam aggregators that pick
# "the worst incident in this session".
SEVERITY_RANK: dict[str, int] = {
    "low":      1,
    "medium":   2,
    "high":     3,
    "critical": 4,
}


def severity_to_risk_score(severity: str) -> float:
    """Map an incident severity label to its Phase A risk score."""
    return SEVERITY_RISK_SCORE.get(severity, 0.0)


def aggregate_risk_score(severities: Iterable[str]) -> float:
    """Phase A: composite risk score is the max single-incident value.

    PRD-013 §7.3 Phase B will replace this with the weighted-sum
    formula; until then ``max()`` is the documented behavior.
    """
    return max((severity_to_risk_score(s) for s in severities), default=0.0)


def severity_rank(severity: str) -> int:
    """Integer priority for ``severity``, suitable for ``sorted(key=)``.

    Returns 0 for unknown labels so they sort below known ones.
    """
    return SEVERITY_RANK.get(severity, 0)
