"""Per-student behavior pattern detection — BL-228 (Sprint 11, PRD-020).

Tracks chronic patterns that span MULTIPLE tracks of the SAME student in
one session. Whereas ``track_state`` keeps a per-track 5-minute window,
this module keeps a per-(session, student_id) ledger of incident type +
timestamp so we can flag:

* ``chronic_phone_use``     — phone_in_hand fired ≥3 times in 10 minutes
* ``sustained_interaction`` — gaze_diversion + head_turn co-occurring
                              ≥4 times in 10 minutes (talking pattern)

Patterns are detected at incident persistence time. When a pattern fires,
an *additional* synthetic ``IncidentCandidate`` is returned so the caller
can persist it alongside the trigger.

Design notes
------------
* Keyed by (session_id, student_id) — pre-match incidents (student_id
  ``track:N``) are intentionally **not** tracked here.
* In-memory; resets on AI service restart. Long-term aggregation is the
  portal's job via ``calculate_student_risk`` RPC.
* Thread-safe via a process-wide lock.
"""

from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass, field

from src.scoring.rules import IncidentCandidate

# ── Severity strings (matches incidents.severity check constraint) ──
SEVERITY_HIGH = "high"

# Placeholder bbox for pattern-derived incidents — they aren't tied to a
# specific object, so we re-use the triggering incident's person bbox.
_NULL_BBOX = (0.0, 0.0, 0.0, 0.0)

# ── Pattern thresholds (tunable; if these grow we move them to YAML) ──
CHRONIC_PHONE_MIN_FIRES   = 3
CHRONIC_PHONE_WINDOW_SECS = 10 * 60   # 10 minutes

SUSTAINED_INTER_MIN_FIRES   = 4
SUSTAINED_INTER_WINDOW_SECS = 10 * 60

PATTERN_COOLDOWN_SECS = 5 * 60  # don't re-fire same pattern within 5min


@dataclass
class StudentBehaviorWindow:
    """Rolling deque of (incident_type, ts) for one student in one session."""
    session_id: str
    student_id: str
    events: deque[tuple[str, float]] = field(default_factory=deque)
    pattern_fired_at: dict[str, float] = field(default_factory=dict)

    def add(self, incident_type: str, ts: float, window_secs: float) -> None:
        self.events.append((incident_type, ts))
        self._evict(ts - window_secs)

    def _evict(self, cutoff_ts: float) -> None:
        while self.events and self.events[0][1] < cutoff_ts:
            self.events.popleft()

    def count(self, incident_types: set[str], window_secs: float, now: float) -> int:
        cutoff = now - window_secs
        return sum(1 for t, ts in self.events if t in incident_types and ts >= cutoff)

    def can_fire(self, pattern: str, now: float) -> bool:
        last = self.pattern_fired_at.get(pattern)
        return last is None or (now - last) >= PATTERN_COOLDOWN_SECS

    def mark_fired(self, pattern: str, now: float) -> None:
        self.pattern_fired_at[pattern] = now


@dataclass
class BehaviorStore:
    _states: dict[tuple[str, str], StudentBehaviorWindow] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def get_or_create(self, session_id: str, student_id: str) -> StudentBehaviorWindow:
        key = (session_id, student_id)
        with self._lock:
            st = self._states.get(key)
            if st is None:
                st = StudentBehaviorWindow(session_id=session_id, student_id=student_id)
                self._states[key] = st
            return st

    def drop_session(self, session_id: str) -> int:
        """Forget all windows for a session — call on session end."""
        with self._lock:
            stale = [k for k in self._states if k[0] == session_id]
            for k in stale:
                del self._states[k]
            return len(stale)


# Process-global store; shared with publish_handler.
behavior_store = BehaviorStore()


def evaluate_after_incident(
    candidate: IncidentCandidate,
    session_id: str,
) -> list[IncidentCandidate]:
    """Update the per-student window with the just-fired incident and
    return any *pattern* candidates that should be persisted as a result.

    Pre-match incidents (``student_id`` starting with ``"track:"`` or
    ``None``) are intentionally ignored — patterns only make sense once
    a track is bound to a real student.
    """
    sid = candidate.student_id
    if not sid or sid.startswith("track:"):
        return []

    state = behavior_store.get_or_create(session_id, sid)
    state.add(candidate.incident_type, candidate.occurred_at, CHRONIC_PHONE_WINDOW_SECS)

    fired: list[IncidentCandidate] = []

    # ── chronic_phone_use ──
    phone_count = state.count(
        {"phone_detected"}, CHRONIC_PHONE_WINDOW_SECS, candidate.occurred_at,
    )
    if (
        phone_count >= CHRONIC_PHONE_MIN_FIRES
        and state.can_fire("chronic_phone_use", candidate.occurred_at)
    ):
        state.mark_fired("chronic_phone_use", candidate.occurred_at)
        fired.append(
            IncidentCandidate(
                incident_type="phone_detected",  # reuse type; triggered_rules distinguishes
                severity=SEVERITY_HIGH,
                confidence=min(0.95, 0.6 + 0.1 * phone_count),
                track_id=candidate.track_id,
                triggered_rules=("chronic_phone_use",),
                bbox=candidate.bbox or _NULL_BBOX,
                person_bbox=candidate.person_bbox or _NULL_BBOX,
                raw_signals={
                    "pattern": "chronic_phone_use",
                    "fires_in_window": phone_count,
                    "window_seconds": CHRONIC_PHONE_WINDOW_SECS,
                },
                occurred_at=candidate.occurred_at,
                student_id=sid,
            )
        )

    # ── sustained_interaction ──
    interact_count = state.count(
        {"gaze_diversion", "head_turn"}, SUSTAINED_INTER_WINDOW_SECS, candidate.occurred_at,
    )
    if (
        interact_count >= SUSTAINED_INTER_MIN_FIRES
        and state.can_fire("sustained_interaction", candidate.occurred_at)
    ):
        state.mark_fired("sustained_interaction", candidate.occurred_at)
        fired.append(
            IncidentCandidate(
                incident_type="unauthorized_communication",
                severity=SEVERITY_HIGH,
                confidence=min(0.95, 0.55 + 0.08 * interact_count),
                track_id=candidate.track_id,
                triggered_rules=("sustained_interaction",),
                bbox=candidate.bbox or _NULL_BBOX,
                person_bbox=candidate.person_bbox or _NULL_BBOX,
                raw_signals={
                    "pattern": "sustained_interaction",
                    "fires_in_window": interact_count,
                    "window_seconds": SUSTAINED_INTER_WINDOW_SECS,
                },
                occurred_at=candidate.occurred_at,
                student_id=sid,
            )
        )

    return fired


def _reset_for_tests() -> None:
    """Test hook."""
    behavior_store._states.clear()  # noqa: SLF001 — test-only
