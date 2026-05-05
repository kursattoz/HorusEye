"""Per-(session, camera) rule state — BL-205.

Rules whose subject is the whole frame, not a single tracked person,
need their own little state container alongside the per-track
:class:`~src.scoring.track_state.TrackState`. Today only
``unauthorized_person`` needs this; future Sprint 9 rules
(``paper_detected`` is per-track) won't grow this further.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SessionRuleState:
    session_id: str
    camera_id: str
    # unauthorized_person bookkeeping
    excess_started_at: Optional[float] = None
    fired_at: dict[str, float] = field(default_factory=dict)


_states: dict[tuple[str, str], SessionRuleState] = {}
_lock = threading.Lock()


def get_session_state(session_id: str, camera_id: str) -> SessionRuleState:
    key = (session_id, camera_id)
    with _lock:
        st = _states.get(key)
        if st is None:
            st = SessionRuleState(session_id=session_id, camera_id=camera_id)
            _states[key] = st
        return st


def drop_session_state(session_id: str, camera_id: str) -> None:
    """Forget a (session, camera) state — call on WS close."""
    with _lock:
        _states.pop((session_id, camera_id), None)


def reset_for_tests() -> None:
    with _lock:
        _states.clear()
