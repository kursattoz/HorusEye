"""BL-296 PoseExtractor — graceful-degrade + derived-signal math.

The real MediaPipe Pose pull needs binary deps too heavy for CI; we
unit-test the wrapper's contract (load() must not raise, extractor
returns None when MediaPipe is unavailable, the singleton is sticky)
and the pure math in _signal_from_landmarks.
"""

from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest

from src.detection import pose as pose_mod
from src.detection.pose import (
    PoseExtractor,
    _signal_from_landmarks,
    get_pose_extractor,
    reset_for_tests,
)


# ───────── load() degrade ─────────

def test_extractor_returns_none_when_mediapipe_missing(monkeypatch) -> None:
    """If MediaPipe import fails, extract_for_track returns None — never raises."""
    # Force the import failure path by clobbering the module entry
    import sys
    saved = sys.modules.pop("mediapipe", None)
    try:
        ext = PoseExtractor()
        ext.load()
        assert ext._loaded is True
        assert ext._pose is None
        # Even a "valid" call should yield None gracefully
        result = ext.extract_for_track(
            frame_bgr=SimpleNamespace(shape=(720, 1280, 3)),
            person_bbox=(0.1, 0.1, 0.5, 0.9),
        )
        assert result is None
    finally:
        if saved is not None:
            sys.modules["mediapipe"] = saved


def test_extractor_returns_none_for_degenerate_bbox() -> None:
    """ROI smaller than the 32×64 minimum should short-circuit to None."""
    import numpy as np
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    ext = PoseExtractor()
    # 1-pixel bbox — definitely below the floor
    assert ext.extract_for_track(frame, (0.0, 0.0, 0.001, 0.001)) is None
    # Frameless input
    assert ext.extract_for_track(None, (0.1, 0.1, 0.5, 0.5)) is None
    # Missing bbox
    assert ext.extract_for_track(frame, None) is None  # type: ignore[arg-type]


# ───────── singleton ─────────

def test_singleton_is_sticky() -> None:
    reset_for_tests()
    a = get_pose_extractor()
    b = get_pose_extractor()
    assert a is b


def test_reset_for_tests_yields_new_instance() -> None:
    a = get_pose_extractor()
    reset_for_tests()
    b = get_pose_extractor()
    assert a is not b


# ───────── derived signals ─────────

def _fake_landmark(x: float, y: float, z: float = 0.0, vis: float = 1.0) -> SimpleNamespace:
    return SimpleNamespace(x=x, y=y, z=z, visibility=vis)


def _make_fake_landmarks(values: dict[int, tuple[float, float]]) -> SimpleNamespace:
    """Build a 33-landmark fake list filling the requested indices."""
    arr = [_fake_landmark(0.5, 0.5) for _ in range(33)]
    for idx, (x, y) in values.items():
        arr[idx] = _fake_landmark(x, y)
    return SimpleNamespace(landmark=arr)


def test_signal_from_landmarks_computes_shoulder_hip_lean() -> None:
    landmarks = _make_fake_landmarks({
        # Shoulders at y=0.4, slightly left of center
        pose_mod.LEFT_SHOULDER_IDX:  (0.40, 0.40),
        pose_mod.RIGHT_SHOULDER_IDX: (0.30, 0.40),  # avg shoulder_mid_x = 0.35
        # Hips at y=0.7, centered
        pose_mod.LEFT_HIP_IDX:  (0.55, 0.70),
        pose_mod.RIGHT_HIP_IDX: (0.45, 0.70),       # avg hip_mid_x = 0.50
    })
    sig = _signal_from_landmarks(landmarks)
    assert sig.shoulder_y_avg == pytest.approx(0.40)
    assert sig.hip_y_avg      == pytest.approx(0.70)
    # shoulder_mid (0.35) − hip_mid (0.50) = −0.15 → leaning to image left
    assert sig.torso_lean_x   == pytest.approx(-0.15)


def test_signal_mouth_xy_averages_corners() -> None:
    landmarks = _make_fake_landmarks({
        pose_mod.MOUTH_LEFT_IDX:  (0.40, 0.55),
        pose_mod.MOUTH_RIGHT_IDX: (0.60, 0.55),
    })
    sig = _signal_from_landmarks(landmarks)
    assert sig.mouth_xy == pytest.approx((0.50, 0.55))


def test_signal_confidence_is_mean_visibility() -> None:
    arr = [_fake_landmark(0.5, 0.5, vis=v) for v in [0.5] * 33]
    landmarks = SimpleNamespace(landmark=arr)
    sig = _signal_from_landmarks(landmarks)
    assert sig.confidence == pytest.approx(0.5)
