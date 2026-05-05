"""Sprint 9 TIER-1 end-to-end scenario — BL-213.

Drives _detect_track_score_sync through synthetic frame sequences that
cover every TIER-1 detection added in Sprints 7 and 9:

  * phone_in_hand (Sprint 7)
  * empty_seat (Sprint 9)
  * unauthorized_person (Sprint 9)
  * paper_detected (Sprint 9)

The publish handler's full rule loop runs against a mocked YOLO + IoU
fallback tracker. Each scenario asserts the expected incident type +
severity surfaces and write_incident persists a row through the stub
Supabase client. We don't drive face_mesh here — Sprint 8's
test_pipeline_face_mesh_integration.py already covers the gaze /
head_turn loop.
"""

from __future__ import annotations

from typing import Any

import pytest

import src.api.publish_handler as ph
from src.detection.yolo_detector import Detection
from src.persistence import incident_writer, session_meta, supabase_client
from src.scoring.session_state import reset_for_tests as reset_session_states
from src.scoring.session_tracker import _reset_registry_for_tests as reset_trackers
from src.scoring.track_state import TrackStore


PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)


# ───────── stub Supabase ─────────

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


class _StubBucket:
    def upload(self, *_a, **_k) -> Any:
        return {}


class _StubStorage:
    def from_(self, _name: str) -> _StubBucket:
        return _StubBucket()


class _StubClient:
    def __init__(self) -> None:
        self.incidents = _StubTable()
        self.storage = _StubStorage()

    def table(self, _name: str) -> _StubTable:
        return self.incidents


# ───────── fixtures ─────────

class _StubYolo:
    """Returns whatever detections the test sets via .next()."""
    def __init__(self) -> None:
        self.next_dets: list[Detection] = []

    def detect(self, _bgr: Any) -> list[Detection]:
        return list(self.next_dets)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("DISABLE_BOXMOT", "1")
    import src.scoring.session_tracker as st_mod
    monkeypatch.setattr(st_mod, "_BOTSORT_CLS", None)
    reset_trackers()
    reset_session_states()
    session_meta.reset_cache_for_tests()
    supabase_client.reset_for_tests()

    # Fresh TrackStore so empty_seat watchdog state doesn't bleed across tests
    fresh_store = TrackStore()
    monkeypatch.setattr(ph, "track_store", fresh_store)

    # Disable face mesh entirely — TIER-1 rules don't need it.
    monkeypatch.setattr(ph, "_FACE_MESH_FRAME_SKIP", 999_999)

    # Inject the stub YOLO via _get_yolo()
    yolo = _StubYolo()
    monkeypatch.setattr(ph, "_get_yolo", lambda: yolo)

    # Stub Supabase client for the writer + session_meta cache
    stub_client = _StubClient()
    supabase_client.set_client_for_tests(stub_client)
    # Pre-seed expected_count cache so unauthorized_person reads without query
    session_meta.set_cache_for_tests("s1", value=1)  # 1 student expected

    yield yolo, stub_client

    reset_trackers()
    reset_session_states()
    session_meta.reset_cache_for_tests()
    supabase_client.reset_for_tests()


def _bgr() -> Any:
    class _F:
        shape = (480, 640, 3)
    return _F()


def _person(bbox=PERSON_BBOX, conf: float = 0.9) -> Detection:
    return Detection(class_id=0, class_name="person", confidence=conf, bbox=bbox)


def _phone(bbox=(0.40, 0.40, 0.50, 0.50), conf: float = 0.78) -> Detection:
    return Detection(class_id=67, class_name="cell phone", confidence=conf, bbox=bbox)


def _book(bbox=(0.30, 0.40, 0.55, 0.60), conf: float = 0.55) -> Detection:
    return Detection(class_id=73, class_name="book", confidence=conf, bbox=bbox)


def _persist(candidates, stub_client, frame_jpeg=b"FAKE"):
    """Run write_incident over the candidate list (mirrors publish_handler)."""
    for cand in candidates:
        incident_writer.write_incident(
            cand, session_id="s1", camera_id="c1", frame_jpeg=frame_jpeg,
        )


# ───────── scenarios ─────────

def test_phone_in_hand_full_path(env) -> None:
    yolo, stub_client = env
    # 4 frames @ 1s with phone in hand sustained
    for ts, frame in enumerate([0.0, 1.0, 2.0, 3.0]):
        yolo.next_dets = [_person(), _phone()]
        _, candidates = ph._detect_track_score_sync(
            _bgr(), "s1", "c1", ts=frame, frame_seq=ts,
        )
        _persist(candidates, stub_client)

    rows = stub_client.incidents.rows
    phone_rows = [r for r in rows if r["incident_type"] == "phone_detected"]
    assert len(phone_rows) == 1
    assert phone_rows[0]["severity"] == "high"


def test_paper_detected_full_path(env) -> None:
    yolo, stub_client = env
    # 5 frames @ 0.5s spacing → 2.0s sustained
    for i, frame in enumerate([0.0, 0.5, 1.0, 1.5, 2.0]):
        yolo.next_dets = [_person(), _book()]
        _, candidates = ph._detect_track_score_sync(
            _bgr(), "s1", "c1", ts=frame, frame_seq=i,
        )
        _persist(candidates, stub_client)

    rows = stub_client.incidents.rows
    paper = [r for r in rows if r["incident_type"] == "paper_detected"]
    assert len(paper) == 1
    assert paper[0]["severity"] == "medium"


def test_empty_seat_full_path(env) -> None:
    yolo, stub_client = env
    # First frame: person seen
    yolo.next_dets = [_person()]
    ph._detect_track_score_sync(_bgr(), "s1", "c1", ts=0.0, frame_seq=0)

    # Person disappears for 70 seconds
    for i, frame in enumerate([5.0, 30.0, 60.0, 70.0], start=1):
        yolo.next_dets = []  # person gone
        _, candidates = ph._detect_track_score_sync(
            _bgr(), "s1", "c1", ts=frame, frame_seq=i,
        )
        _persist(candidates, stub_client)

    rows = stub_client.incidents.rows
    seat = [r for r in rows if r["incident_type"] == "empty_seat"]
    assert len(seat) == 1
    assert seat[0]["severity"] == "medium"


def test_unauthorized_person_full_path(env) -> None:
    yolo, stub_client = env
    # expected = 1 (set by fixture). Drive 2 persons sustained 12 seconds.
    person_a = _person(bbox=(0.10, 0.20, 0.30, 0.95))
    person_b = _person(bbox=(0.60, 0.20, 0.80, 0.95))

    for i, frame in enumerate([0.0, 5.0, 10.0, 12.0]):
        yolo.next_dets = [person_a, person_b]
        _, candidates = ph._detect_track_score_sync(
            _bgr(), "s1", "c1", ts=frame, frame_seq=i,
        )
        _persist(candidates, stub_client)

    rows = stub_client.incidents.rows
    excess = [r for r in rows if r["incident_type"] == "unauthorized_person"]
    assert len(excess) == 1
    assert excess[0]["severity"] == "critical"


def test_full_tier1_sweep_in_one_session(env) -> None:
    """Single session: phone_in_hand fires, then paper_detected fires, then
    student leaves (empty_seat fires)."""
    yolo, stub_client = env
    seq = 0

    # Phase 1: phone_in_hand (4 sustained frames)
    for ts in (0.0, 1.0, 2.0, 3.0):
        yolo.next_dets = [_person(), _phone()]
        _, c = ph._detect_track_score_sync(_bgr(), "s1", "c1", ts=ts, frame_seq=seq)
        _persist(c, stub_client); seq += 1

    # Phase 2: book overlap sustained (5 frames spanning 2 s)
    for ts in (35.0, 35.5, 36.0, 36.5, 37.0):
        yolo.next_dets = [_person(), _book()]
        _, c = ph._detect_track_score_sync(_bgr(), "s1", "c1", ts=ts, frame_seq=seq)
        _persist(c, stub_client); seq += 1

    # Phase 3: student leaves the seat → empty_seat should fire after 60 s
    for ts in (40.0, 60.0, 100.0):
        yolo.next_dets = []
        _, c = ph._detect_track_score_sync(_bgr(), "s1", "c1", ts=ts, frame_seq=seq)
        _persist(c, stub_client); seq += 1

    types = {r["incident_type"] for r in stub_client.incidents.rows}
    assert "phone_detected" in types
    assert "paper_detected" in types
    assert "empty_seat" in types
