"""unauthorized_person Phase A rule — BL-205 (PRD-013 §7.2 TIER-1, §7.3).

Phase A heuristic: when the live person count in the room exceeds
``session_students + assigned_proctors`` for ≥``sustained_seconds``,
emit a CRITICAL incident. Phase B (Sprint 10+) replaces this with face
recognition against enrolled embeddings.

Tracking the *excess started* timestamp on the session_state lets us
distinguish a true intruder from a transient false-positive YOLO
double-count of the same person.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.scoring.rules import IncidentCandidate
from src.scoring.session_state import SessionRuleState

RULE_NAME = "unauthorized_person"


@dataclass(frozen=True)
class UnauthorizedPersonConfig:
    sustained_seconds: float = 10.0
    cooldown_seconds:  float = 120.0


def evaluate(
    session_state: SessionRuleState,
    ts: float,
    expected_count: int,
    observed_count: int,
    cfg: Optional[UnauthorizedPersonConfig] = None,
) -> Optional[IncidentCandidate]:
    """Emit CRITICAL when observed > expected sustained beyond cfg threshold."""
    cfg = cfg or UnauthorizedPersonConfig()

    # No excess → reset state, never fires
    if observed_count <= expected_count:
        session_state.excess_started_at = None
        return None

    # First frame of excess → just record the start time
    if session_state.excess_started_at is None:
        session_state.excess_started_at = ts
        return None

    excess_for = ts - session_state.excess_started_at
    if excess_for < cfg.sustained_seconds:
        return None

    last = session_state.fired_at.get(RULE_NAME)
    if last is not None and (ts - last) < cfg.cooldown_seconds:
        return None

    session_state.fired_at[RULE_NAME] = ts

    return IncidentCandidate(
        incident_type="unauthorized_person",
        severity="critical",
        confidence=0.95,
        track_id=None,                       # session-level, no specific track
        triggered_rules=(
            f"{RULE_NAME}:observed>expected",
            f"{RULE_NAME}:sustained≥{cfg.sustained_seconds:.0f}s",
        ),
        bbox=(0.0, 0.0, 1.0, 1.0),           # whole frame as anchor
        person_bbox=(0.0, 0.0, 1.0, 1.0),
        raw_signals={
            "rule":               RULE_NAME,
            "expected_count":     expected_count,
            "observed_count":     observed_count,
            "excess_for_seconds": excess_for,
        },
        occurred_at=ts,
    )
