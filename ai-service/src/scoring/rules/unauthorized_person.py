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
from src.scoring.track_state import TrackState

RULE_NAME = "unauthorized_person"
PHASE_B_RULE = "unauthorized_person_phase_b"


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
            "phase":              "a",
            "expected_count":     expected_count,
            "observed_count":     observed_count,
            "excess_for_seconds": excess_for,
        },
        occurred_at=ts,
    )


# ───────── Phase B (face-match) — BL-221 ─────────

@dataclass(frozen=True)
class UnauthorizedPersonPhaseBConfig:
    """Phase B: a track that hasn't matched any enrolled student for
    ``sustained_seconds`` of frames, with at least one match attempt made,
    is treated as an intruder.

    Co-exists with Phase A (above): Phase A catches "too many people in
    the room", Phase B catches "this specific person isn't on the
    enrolled list". Both can fire on the same intruder; the
    incident_cooldown keeps the volume sane.
    """
    sustained_seconds: float = 30.0
    cooldown_seconds:  float = 300.0


def evaluate_phase_b(
    track_state: TrackState,
    ts: float,
    person_bbox: tuple[float, float, float, float],
    cfg: Optional[UnauthorizedPersonPhaseBConfig] = None,
) -> Optional[IncidentCandidate]:
    """Fire CRITICAL when a track has been around long enough without
    matching any enrolled student.

    Returns ``None`` when:
    - the track already matched a student,
    - it isn't old enough yet,
    - no match attempt has been made (matcher hasn't run — could be a
      brand-new track, give it the benefit of the doubt),
    - the per-rule cooldown is still active.
    """
    cfg = cfg or UnauthorizedPersonPhaseBConfig()

    if track_state.matched_student_id is not None:
        return None
    if not track_state.samples:
        return None

    track_age = track_state.samples[-1].ts - track_state.samples[0].ts
    if track_age < cfg.sustained_seconds:
        return None

    # Don't accuse on the very first frame after spawn — wait for at
    # least one match attempt so the matcher can't have just been busy.
    if track_state.last_match_attempt_at is None:
        return None

    if not track_state.cooldown_ok(PHASE_B_RULE, cfg.cooldown_seconds, ts):
        return None

    track_state.mark_fired(PHASE_B_RULE, ts)

    best_sim = track_state.best_match_similarity
    return IncidentCandidate(
        incident_type="unauthorized_person",
        severity="critical",
        confidence=0.85,
        track_id=track_state.track_id,
        triggered_rules=(
            f"{PHASE_B_RULE}:no_face_match",
            f"{PHASE_B_RULE}:track_age≥{cfg.sustained_seconds:.0f}s",
        ),
        bbox=person_bbox,
        person_bbox=person_bbox,
        raw_signals={
            "rule":                  RULE_NAME,
            "phase":                 "b",
            "track_age_seconds":     track_age,
            "best_match_similarity": best_sim,
            "match_attempt_at":      track_state.last_match_attempt_at,
        },
        occurred_at=ts,
    )
