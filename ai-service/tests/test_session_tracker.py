"""SessionTracker unit tests — BL-182 (PRD-013 §3.2, §4.2).

Tests run against the IoU fallback so they don't require the boxmot C++
dependency stack. Production Docker image ships boxmot; the fallback path
is itself a tested code path because integration environments without
``lapx`` (e.g. local arm64 dev machines) rely on it.
"""

from __future__ import annotations

import os

import pytest

from src.detection.yolo_detector import Detection
from src.scoring.session_tracker import (
    SessionTracker,
    drop_tracker,
    get_tracker,
    _reset_registry_for_tests,
)


@pytest.fixture(autouse=True)
def _force_iou_fallback(monkeypatch):
    """Disable boxmot for the duration of these tests so behavior is
    deterministic regardless of host C++ deps."""
    monkeypatch.setenv("DISABLE_BOXMOT", "1")
    # Patch the module-level class so already-imported tracker also falls back
    import src.scoring.session_tracker as st_mod
    monkeypatch.setattr(st_mod, "_BOTSORT_CLS", None)
    _reset_registry_for_tests()
    yield
    _reset_registry_for_tests()


def _person(x1: float, y1: float, x2: float, y2: float, conf: float = 0.9) -> Detection:
    return Detection(class_id=0, class_name="person", confidence=conf, bbox=(x1, y1, x2, y2))


def _phone(x1: float, y1: float, x2: float, y2: float, conf: float = 0.7) -> Detection:
    return Detection(class_id=67, class_name="cell phone", confidence=conf, bbox=(x1, y1, x2, y2))


def test_step_separates_persons_and_objects() -> None:
    tracker = SessionTracker()
    dets = [_person(0.1, 0.1, 0.3, 0.4), _phone(0.15, 0.25, 0.18, 0.30)]
    tracks, others = tracker.step(dets, frame_bgr=None)

    assert len(tracks) == 1
    assert tracks[0].detection.class_name == "person"
    assert len(others) == 1
    assert others[0].class_name == "cell phone"


def test_track_id_stable_across_frames() -> None:
    tracker = SessionTracker()
    bbox = (0.1, 0.1, 0.3, 0.4)

    tracks_f1, _ = tracker.step([_person(*bbox)])
    tracks_f2, _ = tracker.step([_person(*bbox)])
    tracks_f3, _ = tracker.step([_person(*bbox)])

    assert tracks_f1[0].track_id == tracks_f2[0].track_id == tracks_f3[0].track_id


def test_two_persons_get_distinct_track_ids() -> None:
    tracker = SessionTracker()
    a = _person(0.05, 0.10, 0.20, 0.40)
    b = _person(0.60, 0.10, 0.80, 0.40)

    tracks, _ = tracker.step([a, b])
    ids = {t.track_id for t in tracks}
    assert len(ids) == 2


def test_registry_namespaces_per_session_and_camera() -> None:
    t1 = get_tracker("session-1", "cam-A")
    t2 = get_tracker("session-1", "cam-B")
    t3 = get_tracker("session-2", "cam-A")

    assert t1 is not t2
    assert t1 is not t3
    # Same key → same instance
    assert get_tracker("session-1", "cam-A") is t1


def test_drop_tracker_removes_instance() -> None:
    t1 = get_tracker("s", "c")
    drop_tracker("s", "c")
    t2 = get_tracker("s", "c")
    assert t1 is not t2


def test_empty_detections_returns_empty_lists() -> None:
    tracker = SessionTracker()
    tracks, others = tracker.step([], frame_bgr=None)
    assert tracks == []
    assert others == []


def test_non_person_only_passes_through_without_tracking() -> None:
    tracker = SessionTracker()
    tracks, others = tracker.step([_phone(0.1, 0.1, 0.2, 0.2)], frame_bgr=None)
    assert tracks == []
    assert len(others) == 1
    assert others[0].class_name == "cell phone"
