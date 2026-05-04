"""RTSP / file → frame reader.

Thin synchronous wrapper around OpenCV VideoCapture.
The async orchestration (reconnect, FPS throttling, queueing) lives in
``rtsp_capture.py``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

log = logging.getLogger(__name__)

try:
    import cv2  # type: ignore[import-untyped]
except ImportError:
    cv2 = None  # type: ignore[misc, assignment]


@dataclass
class RTSPFrameReader:
    """Minimal RTSP / file reader wrapper around OpenCV VideoCapture."""

    url: str
    _cap: Any = field(default=None, repr=False)

    def connect(self) -> bool:
        if cv2 is None:
            log.warning("OpenCV not available; install opencv-python-headless")
            return False
        self.release()
        # Use FFMPEG backend explicitly for RTSP — gstreamer fallback differs across distros
        self._cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
        if not self._cap.isOpened():
            log.error("Could not open stream: %s", self.url)
            self._cap = None
            return False
        # Reduce internal buffering so we always get the freshest frame
        try:
            self._cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:  # property may be unsupported by some backends
            pass
        return True

    def is_open(self) -> bool:
        return self._cap is not None and bool(self._cap.isOpened())

    def read_frame(self) -> Optional[Any]:
        """Return one BGR frame (numpy ndarray) or None on EOF / error."""
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
