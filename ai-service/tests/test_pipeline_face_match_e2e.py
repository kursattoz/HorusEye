"""Sprint 10 face-match E2E scenario — BL-223.

Drives the per-track loop end-to-end:
  * 5 enrolled students with known face embeddings.
  * 6 simultaneous person tracks — 5 of them produce embeddings near a
    known student vector (cosine similarity > 0.65), 1 produces a
    completely orthogonal vector (no match).
  * After ~30s of streaming, all 5 known tracks land on the right
    student_id; the 6th fires unauthorized_person Phase B CRITICAL.

YOLO + tracker fallback mocked, FaceEmbedder + Supabase rpc stubbed.
The session-level Phase A rule is bypassed (expected_count cache pre-
seeded so it can't fire).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

import src.api.publish_handler as ph
import src.identity.face_embedder as fe_mod
import src.identity.student_matcher as sm_mod
from src.detection.yolo_detector import Detection
from src.identity.face_embedder import EMBEDDING_DIM
from src.persistence import incident_writer, session_meta, supabase_client
from src.scoring.session_state import reset_for_tests as reset_session_states
from src.scoring.session_tracker import _reset_registry_for_tests as reset_trackers
from src.scoring.track_state import TrackStore


# ───────── enrolled students ─────────

def _student_vectors(n: int) -> list[np.ndarray]:
    """Build n orthogonal-ish unit vectors so cosine similarity between
    distinct students stays low."""
    rng = np.random.default_rng(seed=1234)
    out: list[np.ndarray] = []
    for _ in range(n):
        v = rng.standard_normal(EMBEDDING_DIM).astype(np.float32)
        v /= float(np.linalg.norm(v))
        out.append(v)
    return out


_STUDENTS = [f"S{i:03d}" for i in range(1, 6)]
_VECTORS = _student_vectors(5)


# ───────── stubs ─────────

class _StubBucket:
    def upload(self, *_a, **_k) -> Any:
        return {}


class _StubStorage:
    def from_(self, _name: str) -> _StubBucket:
        return _StubBucket()


class _StubInsert:
    def __init__(self, sink: list[dict], row: dict) -> None:
        self._sink = sink
        self._row = row

    def execute(self) -> Any:
        self._sink.append(dict(self._row))
        return type("R", (), {"data": [self._row]})()


class _StubTable:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def insert(self, row: dict) -> _StubInsert:
        return _StubInsert(self.rows, row)


class _StubRpc:
    def __init__(self, params: dict[str, Any]) -> None:
        self._params = params

    def execute(self) -> Any:
        query = np.asarray(self._params["query_embedding"], dtype=np.float32)
        # Simulate the RPC: pick the closest enrolled student above
        # threshold; otherwise empty list.
        sims = [float(np.dot(query, v)) for v in _VECTORS]
        best_idx = int(np.argmax(sims))
        best_sim = sims[best_idx]
        threshold = float(self._params["match_threshold"])
        if best_sim < threshold:
            return type("R", (), {"data": []})()
        return type("R", (), {"data": [{
            "id":         f"uuid-{best_idx}",
            "student_id": _STUDENTS[best_idx],
            "full_name":  f"Student {best_idx + 1}",
            "similarity": best_sim,
        }]})()


class _StubClient:
    def __init__(self) -> None:
        self.incidents = _StubTable()
        self.storage = _StubStorage()

    def table(self, name: str) -> _StubTable:
        assert name == "incidents"
        return self.incidents

    def rpc(self, name: str, params: dict[str, Any]) -> _StubRpc:
        assert name == "match_face_embedding"
        return _StubRpc(params)


# ───────── stub embedder + yolo ─────────

# track_id → vector returned by FaceEmbedder.embed (set per scenario).
_VECTOR_FOR_TRACK: dict[int, np.ndarray] = {}


class _StubEmbedder:
    is_available = True
    def embed(self, _frame, person_bbox=None):
        # The publish handler doesn't pass track_id, so we infer from the
        # bbox x-center which person we're embedding.
        if person_bbox is None:
            return None
        x_center = (person_bbox[0] + person_bbox[2]) / 2.0
        idx = int(round(x_center * 10))  # bbox centers are 0.1, 0.2, …
        return _VECTOR_FOR_TRACK.get(idx)


class _StubYolo:
    def __init__(self, dets: list[Detection]):
        self.dets = dets

    def detect(self, _bgr):
        return list(self.dets)


# ───────── fixture ─────────

@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("DISABLE_BOXMOT", "1")
    import src.scoring.session_tracker as st_mod
    monkeypatch.setattr(st_mod, "_BOTSORT_CLS", None)
    reset_trackers()
    reset_session_states()
    session_meta.reset_cache_for_tests()
    fe_mod._reset_for_tests()
    supabase_client.reset_for_tests()

    fresh_store = TrackStore()
    monkeypatch.setattr(ph, "track_store", fresh_store)
    monkeypatch.setattr(ph, "_FACE_MESH_FRAME_SKIP", 999_999)

    embedder = _StubEmbedder()
    monkeypatch.setattr(sm_mod, "get_face_embedder", lambda: embedder)

    stub = _StubClient()
    supabase_client.set_client_for_tests(stub)
    # Pre-seed Phase A expected_count to disable that rule
    session_meta.set_cache_for_tests("s1", value=99)

    yield stub

    reset_trackers()
    reset_session_states()
    session_meta.reset_cache_for_tests()
    fe_mod._reset_for_tests()
    supabase_client.reset_for_tests()


def _bgr() -> Any:
    class _F:
        shape = (480, 640, 3)
    return _F()


def _person(idx: int) -> Detection:
    """Person tracks separated horizontally (x-center 0.1, 0.2, …)
    so the stub embedder can pick out which track is which from the bbox."""
    cx = idx / 10.0
    return Detection(
        class_id=0,
        class_name="person",
        confidence=0.9,
        bbox=(cx - 0.04, 0.20, cx + 0.04, 0.95),
    )


# ───────── scenario ─────────

def test_five_enrolled_match_one_intruder_fires_phase_b(env, monkeypatch) -> None:
    stub = env

    # 5 enrolled tracks (idx 1..5) get vectors close to the corresponding
    # student. The intruder (idx 6) gets a fully orthogonal vector.
    for i in range(5):
        # Slight noise so we don't accidentally clamp to exactly 1.0
        noisy = _VECTORS[i] + np.random.default_rng(seed=i).normal(0, 0.01, EMBEDDING_DIM).astype(np.float32)
        noisy /= float(np.linalg.norm(noisy))
        _VECTOR_FOR_TRACK[i + 1] = noisy
    rng = np.random.default_rng(seed=99)
    intruder = rng.standard_normal(EMBEDDING_DIM).astype(np.float32)
    intruder /= float(np.linalg.norm(intruder))
    _VECTOR_FOR_TRACK[6] = intruder

    yolo = _StubYolo([_person(i) for i in range(1, 7)])
    monkeypatch.setattr(ph, "_get_yolo", lambda: yolo)

    # Drive 35 seconds of streaming, 1 frame per second so the matcher
    # has a chance to attempt + clear its 30s cooldown.
    for sec, frame_seq in zip(range(0, 36), range(0, 360)):
        ph._detect_track_score_sync(_bgr(), "s1", "c1", ts=float(sec), frame_seq=frame_seq)
        for cand in []:  # no-op; matched/unauth are persisted via the writer below
            pass

    # Each track's matcher should have resolved a student except the intruder.
    states = ph.track_store.states_for_camera("s1", "c1")
    assert len(states) == 6

    matched = {st.matched_student_id for st in states if st.matched_student_id}
    assert matched == set(_STUDENTS), f"expected all 5 enrolled, got {matched}"

    intruder_state = next(st for st in states if st.matched_student_id is None)
    assert intruder_state.last_match_attempt_at is not None
    # And after 35s the Phase B rule should have fired exactly once (no
    # cooldown entries in the dispatched candidate path; we only check
    # state.fired_at here for determinism).
    assert "unauthorized_person_phase_b" in intruder_state.fired_at
