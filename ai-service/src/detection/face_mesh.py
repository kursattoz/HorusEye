"""MediaPipe Face Mesh head-pose / gaze signals — BL-195 (PRD-013 §4.3).

Sprint 8 evolution of the BL-149 placeholder. The extractor now:

* Crops the person bbox from the frame before running MediaPipe so we
  get one face per tracked student instead of one face per camera.
* Derives yaw / pitch / roll from a small landmark proxy
  (nose tip + eye corners) — same idea as BL-149 but applied per-ROI.
* Falls back to ``None`` when MediaPipe isn't installed so unit tests
  don't pull in the heavy native deps.
* Holds an internal lock around ``FaceMesh.process()``: MediaPipe is
  not thread-safe, and ``asyncio.to_thread`` may dispatch concurrent
  frame work onto separate workers.

A second method, :func:`get_face_mesh_extractor`, returns a process-wide
singleton so the publish handler doesn't pay the graph init cost on
every frame.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from typing import Any, Optional

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class FaceMeshSignal:
    yaw_deg:    float       # head rotation around vertical axis; >0 = looking right
    pitch_deg:  float       # >0 = looking down
    roll_deg:   float
    eye_closed: bool        # blink filter — set False until BL-149-followup wires it
    confidence: float       # 0-1


# Landmark indices used by the proxy geometry — MediaPipe FaceMesh canonical IDs.
NOSE_TIP_IDX  = 1
LEFT_EYE_IDX  = 33
RIGHT_EYE_IDX = 263


class FaceMeshExtractor:
    """Lazy MediaPipe Face Mesh wrapper with per-track ROI extraction."""

    def __init__(self) -> None:
        self._mp: Any = None
        self._face_mesh: Any = None
        self._loaded = False
        self._lock = threading.Lock()

    # ───────── lifecycle ─────────

    def load(self) -> None:
        if self._loaded:
            return
        try:
            import mediapipe as mp  # type: ignore[import-untyped]
        except ImportError:
            log.info("mediapipe not installed; FaceMeshExtractor will return None signals")
            self._loaded = True
            return
        self._mp = mp
        self._face_mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=1,             # one face per ROI by construction
            refine_landmarks=True,       # adds iris landmarks (improves yaw)
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._loaded = True

    # ───────── extraction ─────────

    def extract(self, frame_bgr: Any) -> Optional[FaceMeshSignal]:
        """Whole-frame extraction — kept for backward compat (BL-149)."""
        return self._process(frame_bgr)

    def extract_for_track(
        self,
        frame_bgr: Any,
        person_bbox: tuple[float, float, float, float],
    ) -> Optional[FaceMeshSignal]:
        """Crop the person bbox from the frame and run FaceMesh on the ROI.

        ``person_bbox`` is normalized (0..1) in (x1, y1, x2, y2) order, the
        same shape :class:`~src.detection.yolo_detector.Detection` carries.
        Returns ``None`` when no face is detected in the crop or the bbox
        is degenerate.
        """
        if frame_bgr is None or person_bbox is None:
            return None
        if not self._loaded:
            self.load()
        # Bail early if MediaPipe is unavailable so we don't pay the crop cost.
        if self._face_mesh is None:
            return None
        try:
            h, w = frame_bgr.shape[:2]
        except AttributeError:
            return None

        x1 = max(0, int(person_bbox[0] * w))
        y1 = max(0, int(person_bbox[1] * h))
        x2 = min(int(w), int(person_bbox[2] * w))
        y2 = min(int(h), int(person_bbox[3] * h))
        if x2 - x1 < 16 or y2 - y1 < 16:
            return None

        roi = frame_bgr[y1:y2, x1:x2]
        return self._process(roi)

    # ───────── internal ─────────

    def _process(self, image_bgr: Any) -> Optional[FaceMeshSignal]:
        if not self._loaded:
            self.load()
        if self._face_mesh is None or image_bgr is None:
            return None
        try:
            import cv2  # type: ignore[import-untyped]
        except ImportError:
            return None
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        with self._lock:
            try:
                result = self._face_mesh.process(rgb)
            except Exception as e:  # noqa: BLE001 — native crash protection
                log.warning("FaceMesh.process failed: %s", e)
                return None
        if not getattr(result, "multi_face_landmarks", None):
            return None
        return _signal_from_landmarks(result.multi_face_landmarks[0].landmark)


def _signal_from_landmarks(landmarks: Any) -> FaceMeshSignal:
    """Compute yaw/pitch/roll from a small set of MediaPipe landmarks.

    Approximate but stable for sustained-glance detection — the production
    grade solve (cv2.solvePnP with a canonical face model) is a Sprint 8
    follow-up. Landmark coordinates are normalized in (0..1) over the ROI
    whose aspect ratio MediaPipe was given, so the proxy angles are in
    degrees relative to ROI center.
    """
    nose_tip  = landmarks[NOSE_TIP_IDX]
    left_eye  = landmarks[LEFT_EYE_IDX]
    right_eye = landmarks[RIGHT_EYE_IDX]

    eye_mid_x = (left_eye.x + right_eye.x) / 2.0
    yaw_deg   = (nose_tip.x - eye_mid_x) * 180.0  # signed: positive = looking right
    pitch_deg = (nose_tip.y - 0.5) * 60.0
    roll_deg  = (left_eye.y - right_eye.y) * 90.0
    return FaceMeshSignal(
        yaw_deg=float(yaw_deg),
        pitch_deg=float(pitch_deg),
        roll_deg=float(roll_deg),
        eye_closed=False,
        confidence=0.85,
    )


# ───────── process-global singleton ─────────

_GLOBAL_EXTRACTOR: FaceMeshExtractor | None = None
_GLOBAL_LOCK = threading.Lock()


def get_face_mesh_extractor() -> FaceMeshExtractor:
    """Return the process-wide extractor, instantiating on first use."""
    global _GLOBAL_EXTRACTOR
    if _GLOBAL_EXTRACTOR is not None:
        return _GLOBAL_EXTRACTOR
    with _GLOBAL_LOCK:
        if _GLOBAL_EXTRACTOR is None:
            _GLOBAL_EXTRACTOR = FaceMeshExtractor()
        return _GLOBAL_EXTRACTOR


def _reset_extractor_for_tests() -> None:
    global _GLOBAL_EXTRACTOR
    with _GLOBAL_LOCK:
        _GLOBAL_EXTRACTOR = None


# ───────── helper kept for BL-149 callers ─────────

def update_window_with_signal(
    window_yaw_deg: float,
    window_seconds: float,
    signal: FaceMeshSignal,
    frame_dt: float,
) -> tuple[float, float]:
    """Advance the gaze-diversion window with one frame's signal.

    BL-149 helper — superseded by :class:`~src.scoring.track_state.TrackState`
    in Sprint 8 BL-198 but kept here so older imports keep compiling.
    """
    abs_yaw = abs(signal.yaw_deg)
    if abs_yaw < 15.0:
        return 0.0, 0.0
    new_yaw = max(window_yaw_deg, abs_yaw)
    new_sec = window_seconds + frame_dt
    return new_yaw, new_sec
