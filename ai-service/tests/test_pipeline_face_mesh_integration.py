"""Face-mesh pipeline integration test — BL-203.

Drives the publish handler's _detect_track_score_sync with mocked YOLO,
mocked SessionTracker fallback, and a stubbed face-mesh extractor. The
contract: gaze_diversion + head_turn evaluators are run only on
sampled frames (frame_seq % FACE_MESH_FRAME_SKIP == 0) and the rules'
inputs come from the same yaw signal we provide here.
"""

from __future__ import annotations

from typing import Any

import pytest

import src.api.publish_handler as ph
from src.detection.face_mesh import FaceMeshSignal
from src.detection.yolo_detector import Detection
from src.scoring.session_tracker import _reset_registry_for_tests
from src.scoring.track_state import TrackStore


PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)


# ───────── stubs ─────────

class _StubYolo:
    def detect(self, _bgr: Any) -> list[Detection]:
        return [
            Detection(class_id=0, class_name="person", confidence=0.9, bbox=PERSON_BBOX),
        ]


class _StubMeshExtractor:
    def __init__(self, signal: FaceMeshSignal | None) -> None:
        self.signal = signal
        self.calls: list[tuple[float, float, float, float]] = []

    def extract_for_track(self, _frame, person_bbox):
        self.calls.append(person_bbox)
        return self.signal


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    monkeypatch.setenv("DISABLE_BOXMOT", "1")
    import src.scoring.session_tracker as st_mod
    monkeypatch.setattr(st_mod, "_BOTSORT_CLS", None)
    _reset_registry_for_tests()
    # Use a fresh local TrackStore so other tests' state can't leak in
    fresh_store = TrackStore()
    monkeypatch.setattr(ph, "track_store", fresh_store)

    # Replace YOLO + face mesh extractor with stubs
    monkeypatch.setattr(ph, "_get_yolo", lambda: _StubYolo())
    yield


def _bgr_frame() -> Any:
    """Minimal numpy ndarray-like — only .shape needed by tracker fallback."""
    class _F:
        shape = (480, 640, 3)
    return _F()


def test_face_mesh_skipped_on_non_sampled_frames(monkeypatch) -> None:
    extractor = _StubMeshExtractor(signal=FaceMeshSignal(
        yaw_deg=35.0, pitch_deg=0.0, roll_deg=0.0, eye_closed=False, confidence=0.9,
    ))
    monkeypatch.setattr(ph, "get_face_mesh_extractor", lambda: extractor)

    # FACE_MESH_FRAME_SKIP default is 2 → frame_seq=1 should NOT call extractor
    detections, candidates = ph._detect_track_score_sync(
        _bgr_frame(), "s1", "c1", ts=0.0, frame_seq=1,
    )
    assert detections  # YOLO ran → person detection present
    assert extractor.calls == []
    assert candidates == []


def test_face_mesh_runs_on_sampled_frames_and_records_signal(monkeypatch) -> None:
    extractor = _StubMeshExtractor(signal=FaceMeshSignal(
        yaw_deg=35.0, pitch_deg=0.0, roll_deg=0.0, eye_closed=False, confidence=0.9,
    ))
    monkeypatch.setattr(ph, "get_face_mesh_extractor", lambda: extractor)

    ph._detect_track_score_sync(_bgr_frame(), "s1", "c1", ts=0.0, frame_seq=0)
    assert len(extractor.calls) == 1
    # Yaw recorded into the same person track's TrackState
    states = ph.track_store
    track_state = states.get_or_create("s1", "c1", track_id=1)
    trace = track_state.signal_trace("yaw_deg")
    assert trace and trace[-1][1] == 35.0


def test_full_pipeline_emits_gaze_diversion_after_three_glances(monkeypatch) -> None:
    """End-to-end: 3 glance episodes through _detect_track_score_sync produce
    a gaze_diversion candidate on the third episode."""
    high_yaw_signal = FaceMeshSignal(
        yaw_deg=35.0, pitch_deg=0.0, roll_deg=0.0, eye_closed=False, confidence=0.9,
    )
    low_yaw_signal = FaceMeshSignal(
        yaw_deg=5.0, pitch_deg=0.0, roll_deg=0.0, eye_closed=False, confidence=0.9,
    )
    extractor = _StubMeshExtractor(signal=None)
    monkeypatch.setattr(ph, "get_face_mesh_extractor", lambda: extractor)

    saw_gaze: list[str] = []
    frame_seq = 0
    for base in (0.0, 40.0, 80.0):
        for offset in (0.0, 1.0, 2.0, 3.0):
            extractor.signal = high_yaw_signal
            _, candidates = ph._detect_track_score_sync(
                _bgr_frame(), "s2", "cX", ts=base + offset, frame_seq=frame_seq,
            )
            for c in candidates:
                if c.incident_type == "gaze_diversion":
                    saw_gaze.append(c.severity)
            frame_seq += 2  # ensure sampling cap (every 2nd frame) hits each call
        for ts in range(int(base + 4), int(base + 40), 2):
            extractor.signal = low_yaw_signal
            _, candidates = ph._detect_track_score_sync(
                _bgr_frame(), "s2", "cX", ts=float(ts), frame_seq=frame_seq,
            )
            for c in candidates:
                if c.incident_type == "gaze_diversion":
                    saw_gaze.append(c.severity)
            frame_seq += 2

    # On the third episode the cumulative count should hit fires_for_medium
    assert saw_gaze, "expected at least one gaze_diversion candidate"
    assert "medium" in saw_gaze or "high" in saw_gaze
