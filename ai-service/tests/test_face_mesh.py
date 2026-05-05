"""FaceMeshExtractor tests — BL-195.

Mocks the MediaPipe graph + cv2 so tests don't need the native deps.
The geometry helpers are exercised directly with synthetic landmarks.
"""

from __future__ import annotations

import sys
import types
from dataclasses import dataclass

import pytest

import src.detection.face_mesh as fm_mod
from src.detection.face_mesh import (
    FaceMeshExtractor,
    FaceMeshSignal,
    _reset_extractor_for_tests,
    _signal_from_landmarks,
    get_face_mesh_extractor,
)


# ───────── synthetic landmarks ─────────

@dataclass
class _LM:
    x: float
    y: float
    z: float = 0.0


def _landmarks_centered() -> list[_LM]:
    """Build 480 landmarks with the proxy points dead-centred."""
    base = [_LM(0.5, 0.5) for _ in range(480)]
    base[1]   = _LM(0.50, 0.50)  # nose tip
    base[33]  = _LM(0.40, 0.50)  # left eye
    base[263] = _LM(0.60, 0.50)  # right eye
    return base


def _landmarks_looking_right() -> list[_LM]:
    base = _landmarks_centered()
    base[1] = _LM(0.65, 0.50)    # nose tip pushed right
    return base


# ───────── geometry tests ─────────

def test_signal_from_landmarks_centered_yields_zero_yaw() -> None:
    sig = _signal_from_landmarks(_landmarks_centered())
    assert abs(sig.yaw_deg)   < 1.0
    assert abs(sig.pitch_deg) < 1.0


def test_signal_from_landmarks_right_yaw_positive() -> None:
    sig = _signal_from_landmarks(_landmarks_looking_right())
    assert sig.yaw_deg > 20.0   # nose 0.15 right of eye mid → ~27°


# ───────── extractor lifecycle ─────────

def test_extract_for_track_returns_none_when_mediapipe_missing(monkeypatch) -> None:
    # Force the import to fail
    monkeypatch.setitem(sys.modules, "mediapipe", None)
    extractor = FaceMeshExtractor()
    extractor.load()  # exercises ImportError path
    fake_frame = type("F", (), {"shape": (480, 640, 3)})()
    sig = extractor.extract_for_track(fake_frame, (0.1, 0.1, 0.4, 0.6))
    assert sig is None


def test_extract_for_track_skips_degenerate_bbox() -> None:
    extractor = FaceMeshExtractor()
    fake_frame = type("F", (), {"shape": (480, 640, 3)})()
    # 1px wide bbox — below 16 px minimum → None
    assert extractor.extract_for_track(fake_frame, (0.50, 0.50, 0.501, 0.502)) is None


def test_extract_for_track_uses_cropped_roi(monkeypatch) -> None:
    """Verify FaceMesh.process is called on a cropped ROI, not the full frame."""
    captured: dict[str, object] = {}

    class _FakeMesh:
        def process(self, rgb):
            captured["rgb_shape"] = rgb.shape
            class _R:
                multi_face_landmarks = [type("F", (), {"landmark": _landmarks_looking_right()})]
            return _R()

    class _FakeNumpy:
        @staticmethod
        def array(*a, **k): pass

    class _FakeCv2:
        COLOR_BGR2RGB = 4

        @staticmethod
        def cvtColor(img, _code):
            return img  # passthrough

    # Inject fake cv2 before _process imports it
    monkeypatch.setitem(sys.modules, "cv2", _FakeCv2)

    # Build a fake frame supporting numpy-style slicing + .shape
    class _FakeFrame:
        def __init__(self, shape):
            self.shape = shape
        def __getitem__(self, slc):
            # Return a smaller fake frame describing the cropped ROI dims
            ys, xs = slc[0], slc[1]
            h = ys.stop - ys.start
            w = xs.stop - xs.start
            return _FakeFrame((h, w, 3))
    frame = _FakeFrame((1000, 2000, 3))

    extractor = FaceMeshExtractor()
    # Skip the real load(); inject the fake mesh + mark loaded
    extractor._loaded = True
    extractor._face_mesh = _FakeMesh()
    extractor._mp = types.SimpleNamespace()

    sig = extractor.extract_for_track(frame, (0.10, 0.10, 0.30, 0.40))
    assert sig is not None
    assert sig.yaw_deg > 20.0
    # ROI shape: x ∈ [0.10, 0.30] of 2000 → 400 wide; y ∈ [0.10, 0.40] of 1000 → 300 tall
    assert captured["rgb_shape"] == (300, 400, 3)


def test_extract_for_track_returns_none_when_no_landmarks(monkeypatch) -> None:
    class _FakeMesh:
        def process(self, _rgb):
            class _R:
                multi_face_landmarks = []
            return _R()

    class _FakeCv2:
        COLOR_BGR2RGB = 4

        @staticmethod
        def cvtColor(img, _code):
            return img

    monkeypatch.setitem(sys.modules, "cv2", _FakeCv2)

    class _F:
        shape = (480, 640, 3)
        def __getitem__(self, _slc):
            return _F()
    frame = _F()

    extractor = FaceMeshExtractor()
    extractor._loaded = True
    extractor._face_mesh = _FakeMesh()

    assert extractor.extract_for_track(frame, (0.1, 0.1, 0.5, 0.5)) is None


# ───────── singleton ─────────

def test_get_face_mesh_extractor_returns_singleton() -> None:
    _reset_extractor_for_tests()
    a = get_face_mesh_extractor()
    b = get_face_mesh_extractor()
    assert a is b
