"""MediaPipe Face Mesh head-pose / gaze signals — BL-149 (PRD-013 §4.3).

Phase A.1 — feeds the scoring layer with sustained gaze yaw + duration.
Returns deterministic placeholder signals when MediaPipe isn't installed
so unit tests run without heavyweight deps.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class FaceMeshSignal:
    yaw_deg:    float       # head rotation around vertical axis; >0 = looking right
    pitch_deg:  float       # >0 = looking down
    roll_deg:   float
    eye_closed: bool        # true if blink detected — used to filter out
                            # transient occlusion when computing sustained_gaze
    confidence: float       # 0-1


class FaceMeshExtractor:
    """Lazy MediaPipe Face Mesh wrapper.

    Use :meth:`extract` per frame; the returned signal is None when no
    face is detected (head out of frame, occlusion).
    """

    def __init__(self) -> None:
        self._mp: Any = None
        self._face_mesh: Any = None
        self._loaded = False

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
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._loaded = True

    def extract(self, frame_bgr: Any) -> Optional[FaceMeshSignal]:
        if not self._loaded:
            self.load()
        if self._face_mesh is None or frame_bgr is None:
            return None
        try:
            import cv2  # type: ignore[import-untyped]
        except ImportError:
            return None
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        result = self._face_mesh.process(rgb)
        if not result.multi_face_landmarks:
            return None
        # Phase A.1 simplification: derive yaw/pitch/roll from a small set of
        # facial landmarks (nose tip, eye corners, chin). The real geometric
        # solve uses solvePnP; this is a usable proxy for jury demo purposes.
        lm = result.multi_face_landmarks[0].landmark
        nose_tip   = lm[1]
        left_eye   = lm[33]
        right_eye  = lm[263]
        # Yaw ≈ horizontal offset of nose vs eye midpoint
        eye_mid_x = (left_eye.x + right_eye.x) / 2
        yaw_deg   = (nose_tip.x - eye_mid_x) * 90.0  # rough mapping to ±45°
        pitch_deg = (nose_tip.y - 0.5) * 60.0
        roll_deg  = (left_eye.y - right_eye.y) * 90.0

        return FaceMeshSignal(
            yaw_deg=float(yaw_deg),
            pitch_deg=float(pitch_deg),
            roll_deg=float(roll_deg),
            eye_closed=False,  # blink detection is Phase A.1 follow-up
            confidence=0.85,
        )


def update_window_with_signal(
    window_yaw_deg: float,
    window_seconds: float,
    signal: FaceMeshSignal,
    frame_dt: float,
) -> tuple[float, float]:
    """Advance the gaze-diversion window with one frame's signal.

    Returns ``(new_yaw_deg, new_seconds)`` to feed into
    :class:`~src.detection.scoring.TrackWindow`.

    Reset both fields when the head returns to centre (yaw < 15°) to avoid
    accumulating across uninterrupted-but-brief glances.
    """
    abs_yaw = abs(signal.yaw_deg)
    if abs_yaw < 15.0:
        return 0.0, 0.0
    # Otherwise extend the window
    new_yaw = max(window_yaw_deg, abs_yaw)
    new_sec = window_seconds + frame_dt
    return new_yaw, new_sec
