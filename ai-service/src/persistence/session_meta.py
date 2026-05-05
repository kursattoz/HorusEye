"""Session metadata fetch + cache — BL-205.

unauthorized_person needs ``session_students_count + assigned_proctors_count``
to know the *expected* number of people in the room. This module pulls
those numbers via the service-role client once per session and caches
the sum until :func:`reset_cache_for_tests` is called or the process
restarts.
"""

from __future__ import annotations

import logging
import threading
from typing import Optional

from src.persistence.supabase_client import get_supabase_admin

log = logging.getLogger(__name__)

_cache: dict[str, int] = {}
_lock = threading.Lock()


def get_expected_person_count(session_id: str) -> Optional[int]:
    """Return ``session_students + session_proctors`` for the session.

    Returns ``None`` when Supabase isn't reachable or the underlying
    queries fail. The publish handler treats ``None`` as "skip
    unauthorized_person evaluation for this session" so a misconfigured
    deploy doesn't bombard proctors with false alarms.
    """
    cached = _cache.get(session_id)
    if cached is not None:
        return cached

    try:
        client = get_supabase_admin()
    except RuntimeError as e:
        log.warning("expected_count: supabase unavailable (%s)", e)
        return None

    try:
        students = (
            client.table("session_students")
            .select("id", count="exact")
            .eq("session_id", session_id)
            .execute()
        )
        proctors = (
            client.table("session_proctors")
            .select("id", count="exact")
            .eq("session_id", session_id)
            .execute()
        )
    except Exception as e:  # noqa: BLE001 — defensive: session may not exist yet
        log.warning("expected_count fetch failed for session=%s: %s", session_id, e)
        return None

    student_count = getattr(students, "count", None) or 0
    proctor_count = getattr(proctors, "count", None) or 0
    expected = int(student_count) + int(proctor_count)

    with _lock:
        _cache[session_id] = expected
    log.info(
        "expected_count cached for session=%s: students=%d proctors=%d total=%d",
        session_id, student_count, proctor_count, expected,
    )
    return expected


def reset_cache_for_tests() -> None:
    with _lock:
        _cache.clear()


def set_cache_for_tests(session_id: str, value: int) -> None:
    with _lock:
        _cache[session_id] = value
