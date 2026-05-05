"""End-to-end Sprint 7 pipeline integration test — BL-192.

Wires the SessionTracker → TrackState → phone_in_hand → IncidentWriter
chain together with mocked YOLO and a stub Supabase client and asserts
that 3 sustained frames of phone overlap produce exactly one persisted
incident with the right shape.
"""

from __future__ import annotations

from typing import Any

import pytest

from src.api.protocol import incident_message
from src.detection.yolo_detector import Detection
from src.persistence import incident_writer, supabase_client
from src.scoring.rules.phone_in_hand import (
    PhoneInHandConfig,
    evaluate as phone_in_hand_eval,
    update_overlap as phone_in_hand_update,
)
from src.scoring.session_tracker import (
    SessionTracker,
    _reset_registry_for_tests,
)
from src.scoring.track_state import TrackStore


# Stubs reused from individual unit tests but copy-pasted here so the
# integration test stands alone; cross-test imports get fragile.

class _StubResult:
    def __init__(self, data: list[dict] | None = None) -> None:
        self.data = data or []


class _StubInsert:
    def __init__(self, table: "_StubTable", row: dict) -> None:
        self._table = table
        self._row = row

    def execute(self) -> _StubResult:
        echoed = dict(self._row)
        self._table.inserted_rows.append(echoed)
        return _StubResult(data=[echoed])


class _StubTable:
    def __init__(self) -> None:
        self.inserted_rows: list[dict] = []

    def insert(self, row: dict) -> _StubInsert:
        return _StubInsert(self, row)


class _StubBucket:
    def __init__(self) -> None:
        self.uploads: list[tuple[str, bytes, dict]] = []

    def upload(self, path: str, data: bytes, file_options: dict) -> Any:
        self.uploads.append((path, data, file_options))
        return {"Key": path}


class _StubStorage:
    def __init__(self) -> None:
        self.bucket = _StubBucket()

    def from_(self, name: str) -> _StubBucket:
        assert name == "incident-evidence"
        return self.bucket


class _StubClient:
    def __init__(self) -> None:
        self.incidents = _StubTable()
        self.storage = _StubStorage()

    def table(self, name: str) -> _StubTable:
        assert name == "incidents"
        return self.incidents


@pytest.fixture(autouse=True)
def _isolate_globals(monkeypatch):
    monkeypatch.setenv("DISABLE_BOXMOT", "1")
    import src.scoring.session_tracker as st_mod
    monkeypatch.setattr(st_mod, "_BOTSORT_CLS", None)
    _reset_registry_for_tests()
    supabase_client.reset_for_tests()
    yield
    _reset_registry_for_tests()
    supabase_client.reset_for_tests()


# ───────── helpers ─────────

PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)
PHONE_BBOX  = (0.40, 0.40, 0.50, 0.50)


def _frame_dets() -> list[Detection]:
    return [
        Detection(class_id=0,  class_name="person",     confidence=0.9, bbox=PERSON_BBOX),
        Detection(class_id=67, class_name="cell phone", confidence=0.78, bbox=PHONE_BBOX),
    ]


# ───────── test ─────────

def test_three_sustained_frames_persist_one_incident_and_broadcastable() -> None:
    """End-to-end: tracker → window → rule → writer → broadcast envelope."""
    stub = _StubClient()
    supabase_client.set_client_for_tests(stub)

    tracker = SessionTracker()
    track_store = TrackStore()  # local store keeps test isolated

    # Drive 4 frames at 1-second intervals; phone present every frame.
    rule_cfg = PhoneInHandConfig()
    fired_candidates = []
    for ts in (0.0, 1.0, 2.0, 3.0):
        tracks, others = tracker.step(_frame_dets())
        assert len(tracks) == 1, "person track must be stable across frames"
        person_track = tracks[0]
        state = track_store.get_or_create("sess-1", "cam-1", person_track.track_id)
        overlap = phone_in_hand_update(
            state,
            ts=ts,
            person_bbox=person_track.detection.bbox,
            other_detections=others,
            overlap_threshold=rule_cfg.overlap_threshold,
        )
        cand = phone_in_hand_eval(
            state,
            ts=ts,
            person_bbox=person_track.detection.bbox,
            overlapping_phone=overlap.get("cell phone"),
            cfg=rule_cfg,
        )
        if cand is not None:
            fired_candidates.append(cand)

    # Exactly one incident across 4 frames thanks to the cooldown.
    assert len(fired_candidates) == 1
    cand = fired_candidates[0]
    assert cand.incident_type == "phone_detected"
    assert cand.severity == "high"          # conf 0.78 ≥ 0.65 threshold
    assert cand.track_id == 1               # IoU fallback hands out IDs from 1

    # Persist via real writer + stub Supabase
    row = incident_writer.write_incident(
        cand,
        session_id="sess-1",
        camera_id="cam-1",
        frame_jpeg=b"\xff\xd8\xff\xe0FAKEJPEG",
    )
    assert row is not None
    assert len(stub.storage.bucket.uploads) == 1
    upload_path = stub.storage.bucket.uploads[0][0]
    assert upload_path.startswith("sess-1/")
    assert upload_path.endswith(".jpg")
    assert row["evidence_paths"] == [upload_path]
    assert len(stub.incidents.inserted_rows) == 1

    # Broadcast envelope shape
    msg = incident_message(row, session_id="sess-1")
    assert msg["type"] == "incident"
    assert msg["incident_type"] == "phone_detected"
    assert msg["severity"] == "high"
    assert msg["track_id"] == 1
    assert msg["evidence_paths"] == [upload_path]
    assert msg["camera_ids"] == ["cam-1"]
    assert msg["session_id"] == "sess-1"


def test_phone_disappears_mid_window_no_incident() -> None:
    """If phone disappears between sustained samples, rule must NOT fire."""
    stub = _StubClient()
    supabase_client.set_client_for_tests(stub)

    tracker = SessionTracker()
    track_store = TrackStore()
    rule_cfg = PhoneInHandConfig()
    candidates = []
    sequences = [
        (_frame_dets(),       0.0),  # phone present
        ([Detection(class_id=0, class_name="person", confidence=0.9, bbox=PERSON_BBOX)], 1.0),  # phone gone
        (_frame_dets(),       2.0),
        (_frame_dets(),       3.0),
    ]
    for dets, ts in sequences:
        tracks, others = tracker.step(dets)
        if not tracks:
            continue
        state = track_store.get_or_create("sess-1", "cam-1", tracks[0].track_id)
        overlap = phone_in_hand_update(
            state,
            ts=ts,
            person_bbox=tracks[0].detection.bbox,
            other_detections=others,
        )
        cand = phone_in_hand_eval(
            state,
            ts=ts,
            person_bbox=tracks[0].detection.bbox,
            overlapping_phone=overlap.get("cell phone"),
            cfg=rule_cfg,
        )
        if cand is not None:
            candidates.append(cand)

    assert candidates == []
    assert stub.incidents.inserted_rows == []
