"""YOLO detector unit tests — BL-42 (PRD-013 §4.1).

We don't load the real ~6MB YOLOv8 weights in unit tests. Instead we patch
``ultralytics.YOLO`` with a fake that returns a canned detection result.
"""

from __future__ import annotations

from typing import Any

import pytest

from src.detection.yolo_detector import (
    Detection,
    DetectorConfig,
    YoloDetector,
    map_to_incident_type,
)
from src.detection.scoring import score_detection


class _FakeBoxes:
    def __init__(self) -> None:
        # one cell phone (cls=67) at (10,10)-(110,110) on a 200x200 frame
        self.xyxy = [[10, 10, 110, 110]]
        self.cls = [67]
        self.conf = [0.82]

    def __len__(self) -> int:
        return 1


class _FakeResult:
    def __init__(self) -> None:
        self.boxes = _FakeBoxes()


class _FakeYOLO:
    """Stand-in for ultralytics.YOLO."""

    def __init__(self, _path: str) -> None:
        self.names = {0: "person", 67: "cell phone", 63: "laptop"}

    def __call__(self, *_args: Any, **_kwargs: Any) -> list[_FakeResult]:
        return [_FakeResult()]


@pytest.fixture
def patched_yolo(monkeypatch):
    import src.detection.yolo_detector as mod

    def fake_import(*_a, **_kw):
        class _Stub:
            YOLO = _FakeYOLO
        return _Stub

    # Patch the local lazy import via sys.modules trick
    import sys
    sys.modules["ultralytics"] = type("M", (), {"YOLO": _FakeYOLO})  # type: ignore[arg-type]
    yield mod


def test_detect_returns_normalized_bbox(patched_yolo) -> None:
    det = YoloDetector(DetectorConfig(model_path="models/fake.pt"))

    # 200x200 BGR fake frame
    class _Frame:
        shape = (200, 200, 3)
    frame = _Frame()

    detections = det.detect(frame)
    assert len(detections) == 1
    d = detections[0]
    assert d.class_id == 67
    assert d.class_name == "cell phone"
    assert d.confidence == pytest.approx(0.82)
    # bbox is normalized 0..1
    x1, y1, x2, y2 = d.bbox
    assert 0.0 <= x1 < x2 <= 1.0
    assert 0.0 <= y1 < y2 <= 1.0
    assert x1 == pytest.approx(0.05)
    assert y2 == pytest.approx(0.55)


def test_score_detection_phone_incident() -> None:
    d = Detection(class_id=67, class_name="cell phone", confidence=0.82, bbox=(0, 0, 0.5, 0.5))
    cand = score_detection(d)
    assert cand is not None
    assert cand.incident_type == "phone_detected"
    assert cand.severity == "high"  # conf > 0.70
    assert cand.triggered_rules == ("yolo:cell phone",)


def test_score_detection_person_yields_no_candidate() -> None:
    d = Detection(class_id=0, class_name="person", confidence=0.95, bbox=(0, 0, 1, 1))
    assert score_detection(d) is None


def test_map_to_incident_type() -> None:
    mapping = {"cell phone": "phone_detected", "laptop": "paper_detected"}
    assert map_to_incident_type("cell phone", mapping) == "phone_detected"
    assert map_to_incident_type("dog", mapping) is None
