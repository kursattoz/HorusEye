"""RTSP → frame buffer skeleton (Phase A). Full pipeline in later PRD phases."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

log = logging.getLogger(__name__)

try:
    import cv2
except ImportError:
    cv2 = None  # type: ignore[misc, assignment]


@dataclass
class RTSPFrameReader:
    """Minimal RTSP reader wrapper around OpenCV VideoCapture (on-prem Docker)."""

    url: str
    _cap: Any = field(default=None, repr=False)

    def connect(self) -> bool:
        if cv2 is None:
            log.warning("OpenCV not available; install opencv-python-headless")
            return False
        self.release()
        self._cap = cv2.VideoCapture(self.url)
        if not self._cap.isOpened():
            log.error("Could not open RTSP stream: %s", self.url)
            self._cap = None
            return False
        return True

    def read_frame(self) -> Optional[Any]:
        """Return one BGR frame (numpy ndarray) or None if EOF / error."""
        if self._cap is None:
            return None
        ok, frame = self._cap.read()
        if not ok:
            return None
        return frame

    def release(self) -> None:
        if self._cap is not None and cv2 is not None:
            self._cap.release()
        self._cap = None
