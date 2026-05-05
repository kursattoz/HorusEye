"""Track ↔ student matcher tests — BL-220."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

import src.identity.student_matcher as sm_mod
from src.identity import face_embedder as fe_mod
from src.identity.face_embedder import EMBEDDING_DIM
from src.identity.student_matcher import MatcherConfig, match_track
from src.persistence import supabase_client
from src.scoring.track_state import TrackState

PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)


# ───────── stubs ─────────

class _StubRpc:
    def __init__(self, table: "_Client", name: str, params: dict[str, Any]):
        self._table = table
        self._name = name
        self._params = params

    def execute(self):
        self._table.calls.append((self._name, self._params))
        return type("R", (), {"data": list(self._table.next_rows)})()


class _Client:
    def __init__(self, rows: list[dict] | None = None):
        self.calls: list[tuple[str, dict]] = []
        self.next_rows: list[dict] = rows or []

    def rpc(self, name: str, params: dict[str, Any]):
        return _StubRpc(self, name, params)


class _Embedder:
    is_available = True
    def __init__(self, ret) -> None:
        self.ret = ret
        self.calls = 0
    def embed(self, _frame, person_bbox=None):
        self.calls += 1
        return self.ret


@pytest.fixture
def env(monkeypatch):
    fe_mod._reset_for_tests()
    supabase_client.reset_for_tests()
    yield
    fe_mod._reset_for_tests()
    supabase_client.reset_for_tests()


def _seasoned_state(track_id: int = 1) -> TrackState:
    """Build a TrackState old enough to clear the matcher's age guard."""
    state = TrackState(track_id=track_id)
    state.add(ts=0.0, person_bbox=PERSON_BBOX, overlapping_classes=[])
    state.add(ts=2.0, person_bbox=PERSON_BBOX, overlapping_classes=[])
    return state


def test_match_returns_none_when_track_too_young(env, monkeypatch) -> None:
    state = TrackState(track_id=1)
    state.add(ts=0.0, person_bbox=PERSON_BBOX, overlapping_classes=[])  # age 0
    monkeypatch.setattr(sm_mod, "get_face_embedder", lambda: _Embedder(np.zeros(EMBEDDING_DIM, dtype=np.float32)))
    supabase_client.set_client_for_tests(_Client(rows=[
        {"id": "u1", "student_id": "S1", "full_name": "Ali", "similarity": 0.92},
    ]))

    assert match_track(state, frame_bgr=None, person_bbox=PERSON_BBOX, ts=0.0) is None
    assert state.matched_student_id is None


def test_match_returns_cached_id_on_repeat(env, monkeypatch) -> None:
    state = _seasoned_state()
    state.matched_student_id = "S1"
    embedder = _Embedder(np.zeros(EMBEDDING_DIM, dtype=np.float32))
    monkeypatch.setattr(sm_mod, "get_face_embedder", lambda: embedder)
    supabase_client.set_client_for_tests(_Client())

    assert match_track(state, frame_bgr=None, person_bbox=PERSON_BBOX, ts=2.0) == "S1"
    # Embedder NOT called on cache hit
    assert embedder.calls == 0


def test_match_resolves_via_rpc_and_caches(env, monkeypatch) -> None:
    state = _seasoned_state(track_id=42)
    fake = np.linspace(0.0, 1.0, EMBEDDING_DIM, dtype=np.float32)
    monkeypatch.setattr(sm_mod, "get_face_embedder", lambda: _Embedder(fake))
    client = _Client(rows=[
        {"id": "user-uuid", "student_id": "S101", "full_name": "Veli", "similarity": 0.92},
    ])
    supabase_client.set_client_for_tests(client)

    sid = match_track(state, frame_bgr=object(), person_bbox=PERSON_BBOX, ts=2.0)
    assert sid == "S101"
    assert state.matched_student_id == "S101"
    assert state.best_match_similarity == 0.92
    # RPC called with the right name + params shape
    assert client.calls
    name, params = client.calls[0]
    assert name == "match_face_embedding"
    assert params["match_threshold"] == 0.65
    assert len(params["query_embedding"]) == EMBEDDING_DIM


def test_match_returns_none_when_no_rows(env, monkeypatch) -> None:
    state = _seasoned_state()
    monkeypatch.setattr(sm_mod, "get_face_embedder",
                        lambda: _Embedder(np.zeros(EMBEDDING_DIM, dtype=np.float32)))
    supabase_client.set_client_for_tests(_Client(rows=[]))

    assert match_track(state, frame_bgr=object(), person_bbox=PERSON_BBOX, ts=2.0) is None
    assert state.matched_student_id is None
    # last_match_attempt_at recorded for cooldown
    assert state.last_match_attempt_at == 2.0


def test_match_returns_none_when_embedder_missing(env, monkeypatch) -> None:
    state = _seasoned_state()
    monkeypatch.setattr(sm_mod, "get_face_embedder", lambda: _Embedder(None))
    supabase_client.set_client_for_tests(_Client(rows=[
        {"id": "u1", "student_id": "S1", "similarity": 0.92},
    ]))
    assert match_track(state, frame_bgr=object(), person_bbox=PERSON_BBOX, ts=2.0) is None


def test_match_below_threshold_is_skipped(env, monkeypatch) -> None:
    state = _seasoned_state()
    monkeypatch.setattr(sm_mod, "get_face_embedder",
                        lambda: _Embedder(np.zeros(EMBEDDING_DIM, dtype=np.float32)))
    # Server returned a row but similarity below threshold (shouldn't happen
    # given the RPC's WHERE clause, but be defensive).
    supabase_client.set_client_for_tests(_Client(rows=[
        {"id": "u1", "student_id": "S1", "similarity": 0.42},
    ]))
    assert match_track(state, frame_bgr=object(), person_bbox=PERSON_BBOX, ts=2.0) is None


def test_match_respects_retry_cooldown(env, monkeypatch) -> None:
    state = _seasoned_state()
    monkeypatch.setattr(sm_mod, "get_face_embedder",
                        lambda: _Embedder(np.zeros(EMBEDDING_DIM, dtype=np.float32)))
    client = _Client(rows=[])
    supabase_client.set_client_for_tests(client)

    # First miss
    match_track(state, frame_bgr=object(), person_bbox=PERSON_BBOX, ts=2.0)
    assert len(client.calls) == 1

    # 5s later — cooldown blocks
    match_track(state, frame_bgr=object(), person_bbox=PERSON_BBOX, ts=7.0)
    assert len(client.calls) == 1

    # 35s later — cooldown cleared
    match_track(state, frame_bgr=object(), person_bbox=PERSON_BBOX, ts=37.0)
    assert len(client.calls) == 2
