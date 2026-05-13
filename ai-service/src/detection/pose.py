"""MediaPipe Pose extractor — PRD-021 §3 Sprint 17 (BL-296), PRD-013 §4.4.

Per-track 33-keypoint extractor that feeds the Sprint 17 behavior rules
(body_lean_neighbor, standing_up, hand_under_desk, hand_to_ear_mouth,
object_passing, gaze_at_lap, synchronized_behavior).

Sprint 17 BL-296 deliverable. Pattern mirrors :mod:`src.detection.face_mesh`:

  - Lazy load — no MediaPipe dep at import time.
  - Per-ROI extraction so one person = one PoseSignal, not one camera = one pose.
  - Process-wide singleton via :func:`get_pose_extractor`.
  - Thread-safe single-process inference (asyncio.to_thread guard).

PoseSignal is the union of:

  - 33-landmark vector (x, y, z, visibility) — normalized to the ROI.
  - A handful of derived booleans / scalars the rules look at on every
    frame (e.g. shoulder_y / hip_y / hand-to-ear distance). The full
    landmark array is also exposed so future rules can compute their own
    geometry without re-extracting.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Any, Optional

log = logging.getLogger(__name__)


# ───────── PoseSignal ─────────

@dataclass(frozen=True)
class PoseLandmark:
    x: float       # 0..1 normalized to ROI width
    y: float       # 0..1 normalized to ROI height
    z: float       # depth, smaller = closer
    visibility: float  # 0..1


@dataclass(frozen=True)
class PoseSignal:
    landmarks: tuple[PoseLandmark, ...]   # 33 entries
    confidence: float                      # mean visibility across landmarks
    # Derived signals — cheap to compute once, hot for the rule engine.
    shoulder_y_avg:   float      # average y of left+right shoulders (0..1, ROI)
    hip_y_avg:        float      # average y of left+right hips
    torso_lean_x:     float      # signed horizontal shoulder midpoint − hip midpoint
    left_wrist_xy:    tuple[float, float]
    right_wrist_xy:   tuple[float, float]
    left_ear_xy:      tuple[float, float]
    right_ear_xy:     tuple[float, float]
    mouth_xy:         tuple[float, float]
    nose_xy:          tuple[float, float]
    # Same coords carried through to the global frame so rules that need
    # neighbor relations can compare across tracks without re-projecting.
    bbox_xyxy:        tuple[float, float, float, float] = field(default=(0.0, 0.0, 1.0, 1.0))


# MediaPipe Pose canonical landmark indices.
NOSE_IDX            = 0
MOUTH_LEFT_IDX      = 9
MOUTH_RIGHT_IDX     = 10
LEFT_EAR_IDX        = 7
RIGHT_EAR_IDX       = 8
LEFT_SHOULDER_IDX   = 11
RIGHT_SHOULDER_IDX  = 12
LEFT_WRIST_IDX      = 15
RIGHT_WRIST_IDX     = 16
LEFT_HIP_IDX        = 23
RIGHT_HIP_IDX       = 24


# ───────── extractor ─────────

class PoseExtractor:
    """Lazy MediaPipe Pose wrapper with per-track ROI extraction."""

    def __init__(self) -> None:
        self._mp: Any = None
        self._pose: Any = None
        self._loaded = False
        self._lock = threading.Lock()

    def load(self) -> None:
        if self._loaded:
            return
        try:
            import mediapipe as mp  # type: ignore[import-untyped]
        except ImportError:
            log.info("mediapipe not installed; PoseExtractor will return None signals")
            self._loaded = True
            return
        self._mp = mp
        self._pose = mp.solutions.pose.Pose(
            static_image_mode=False,       # tracks across frames inside one ROI stream
            model_complexity=1,            # 0=fast, 1=balanced, 2=most accurate
            smooth_landmarks=True,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._loaded = True

    def extract_for_track(
        self,
        frame_bgr: Any,
        person_bbox: tuple[float, float, float, float],
    ) -> Optional[PoseSignal]:
        """Crop person_bbox from frame_bgr and run Pose on the ROI."""
        if frame_bgr is None or person_bbox is None:
            return None
        if not self._loaded:
            self.load()
        if self._pose is None:
            return None
        try:
            h, w = frame_bgr.shape[:2]
        except AttributeError:
            return None

        x1 = max(0, int(person_bbox[0] * w))
        y1 = max(0, int(person_bbox[1] * h))
        x2 = min(int(w), int(person_bbox[2] * w))
        y2 = min(int(h), int(person_bbox[3] * h))
        if x2 - x1 < 32 or y2 - y1 < 64:
            return None  # too small for Pose to do anything useful

        roi = frame_bgr[y1:y2, x1:x2]
        signal = self._process(roi)
        if signal is None:
            return None
        # Replace bbox_xyxy with the global-frame coords so rules can
        # do neighbor geometry.
        return _with_bbox(signal, person_bbox)

    # ───────── internal ─────────

    def _process(self, image_bgr: Any) -> Optional[PoseSignal]:
        try:
            import cv2  # type: ignore[import-untyped]
        except ImportError:
            return None
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        with self._lock:
            results = self._pose.process(rgb)
        landmarks = getattr(results, "pose_landmarks", None)
        if landmarks is None:
            return None
        return _signal_from_landmarks(landmarks)


# ───────── helpers ─────────

def _signal_from_landmarks(mp_landmarks: Any) -> PoseSignal:
    pts = mp_landmarks.landmark  # MediaPipe NormalizedLandmarkList
    arr = tuple(
        PoseLandmark(
            x=float(p.x), y=float(p.y), z=float(p.z), visibility=float(p.visibility),
        )
        for p in pts
    )

    def xy(idx: int) -> tuple[float, float]:
        return (arr[idx].x, arr[idx].y)

    mouth_x = (arr[MOUTH_LEFT_IDX].x + arr[MOUTH_RIGHT_IDX].x) / 2.0
    mouth_y = (arr[MOUTH_LEFT_IDX].y + arr[MOUTH_RIGHT_IDX].y) / 2.0
    shoulder_y_avg = (arr[LEFT_SHOULDER_IDX].y + arr[RIGHT_SHOULDER_IDX].y) / 2.0
    hip_y_avg      = (arr[LEFT_HIP_IDX].y      + arr[RIGHT_HIP_IDX].y)      / 2.0
    shoulder_mid_x = (arr[LEFT_SHOULDER_IDX].x + arr[RIGHT_SHOULDER_IDX].x) / 2.0
    hip_mid_x      = (arr[LEFT_HIP_IDX].x      + arr[RIGHT_HIP_IDX].x)      / 2.0
    torso_lean_x   = shoulder_mid_x - hip_mid_x

    confidence = sum(p.visibility for p in arr) / len(arr)

    return PoseSignal(
        landmarks=arr,
        confidence=confidence,
        shoulder_y_avg=shoulder_y_avg,
        hip_y_avg=hip_y_avg,
        torso_lean_x=torso_lean_x,
        left_wrist_xy=xy(LEFT_WRIST_IDX),
        right_wrist_xy=xy(RIGHT_WRIST_IDX),
        left_ear_xy=xy(LEFT_EAR_IDX),
        right_ear_xy=xy(RIGHT_EAR_IDX),
        mouth_xy=(mouth_x, mouth_y),
        nose_xy=xy(NOSE_IDX),
    )


def _with_bbox(
    sig: PoseSignal,
    bbox: tuple[float, float, float, float],
) -> PoseSignal:
    """Return a new PoseSignal carrying the global-frame bbox."""
    return PoseSignal(
        landmarks=sig.landmarks,
        confidence=sig.confidence,
        shoulder_y_avg=sig.shoulder_y_avg,
        hip_y_avg=sig.hip_y_avg,
        torso_lean_x=sig.torso_lean_x,
        left_wrist_xy=sig.left_wrist_xy,
        right_wrist_xy=sig.right_wrist_xy,
        left_ear_xy=sig.left_ear_xy,
        right_ear_xy=sig.right_ear_xy,
        mouth_xy=sig.mouth_xy,
        nose_xy=sig.nose_xy,
        bbox_xyxy=bbox,
    )


# ───────── singleton ─────────

_singleton: PoseExtractor | None = None


def get_pose_extractor() -> PoseExtractor:
    """Process-wide singleton so the graph init cost only runs once."""
    global _singleton
    if _singleton is None:
        _singleton = PoseExtractor()
    return _singleton


def reset_for_tests() -> None:
    """Wipe the singleton — used by tests that need a fresh extractor."""
    global _singleton
    _singleton = None
