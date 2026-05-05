"""Per-stream BoT-SORT tracker — BL-182 (PRD-013 §3.2, §4.2).

Each ``(session_id, camera_id)`` pair gets its own tracker instance so
``track_id`` namespaces don't collide across cameras in the same session
(PRD-019 multi-camera scenario). Falls back to the IoU-greedy
:class:`~src.detection.tracker.IoUTracker` when ``boxmot`` is unavailable
— this keeps the unit-test environment lean (no C++ build of ``lapx``)
while production Docker ships the full BoT-SORT.

Phase A only tracks ``person`` boxes; object classes (cell phone, book,
laptop, …) are passed through unchanged. The downstream ``phone_in_hand``
rule needs both — the person track gives identity, the phone bbox gives
the trigger geometry.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Any

from src.detection.tracker import IoUTracker, Track
from src.detection.yolo_detector import Detection

log = logging.getLogger(__name__)

try:
    import numpy as np  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover - opencv stack always ships numpy
    np = None  # type: ignore[assignment]


def _load_botsort_class() -> Any | None:
    """Import boxmot's BotSort lazily so missing C++ deps don't crash startup."""
    if os.getenv("DISABLE_BOXMOT") == "1":
        log.info("DISABLE_BOXMOT=1 → SessionTracker uses IoU fallback")
        return None
    try:
        from boxmot import BotSort  # type: ignore[import-untyped]
        return BotSort
    except ImportError:
        log.info("boxmot not installed; SessionTracker uses IoU fallback")
        return None
    except Exception as e:  # noqa: BLE001 — defensive: native deps may segfault on import
        log.warning("boxmot import failed (%s); using IoU fallback", e)
        return None


_BOTSORT_CLS = _load_botsort_class()


class SessionTracker:
    """Wraps BoT-SORT with a clean ``Detection``-in / ``Track``-out API.

    Tracks ``person`` detections only. Non-person detections are returned
    untouched in a separate list so the caller (phone_in_hand rule) can
    correlate them with person tracks via bbox overlap.
    """

    def __init__(self) -> None:
        self._fallback: IoUTracker | None = None
        self._botsort: Any | None = None
        self._init_backend()

    def _init_backend(self) -> None:
        if _BOTSORT_CLS is None or np is None:
            self._fallback = IoUTracker()
            return
        try:
            self._botsort = _BOTSORT_CLS(
                reid_weights=Path(""),
                device="cpu",
                half=False,
                with_reid=False,
            )
        except Exception as e:  # noqa: BLE001 — boxmot ctor surfaces many exotic errors
            log.warning("BoT-SORT init failed (%s); using IoU fallback", e)
            self._fallback = IoUTracker()

    def step(
        self,
        detections: list[Detection],
        frame_bgr: Any | None = None,
    ) -> tuple[list[Track], list[Detection]]:
        """Advance the tracker one frame.

        Returns ``(person_tracks, non_person_detections)``. Person tracks
        carry stable ``track_id`` values across frames; the non-person list
        preserves the input order for downstream rules.
        """
        person_dets = [d for d in detections if d.class_name == "person"]
        other_dets = [d for d in detections if d.class_name != "person"]

        if self._botsort is None or np is None or frame_bgr is None:
            tracks = (self._fallback or IoUTracker()).step(person_dets)
            return tracks, other_dets

        try:
            tracks = self._step_botsort(person_dets, frame_bgr)
            return tracks, other_dets
        except Exception as e:  # noqa: BLE001 — keep streaming even if tracker bombs
            log.warning("BoT-SORT step failed (%s); falling back to IoU once", e)
            self._fallback = self._fallback or IoUTracker()
            return self._fallback.step(person_dets), other_dets

    def _step_botsort(self, person_dets: list[Detection], frame_bgr: Any) -> list[Track]:
        h, w = frame_bgr.shape[:2]

        if not person_dets:
            empty = np.zeros((0, 6), dtype=np.float32)
            self._botsort.update(empty, frame_bgr)
            return []

        rows = np.array(
            [
                [
                    d.bbox[0] * w,
                    d.bbox[1] * h,
                    d.bbox[2] * w,
                    d.bbox[3] * h,
                    d.confidence,
                    d.class_id,
                ]
                for d in person_dets
            ],
            dtype=np.float32,
        )
        result = self._botsort.update(rows, frame_bgr)
        # boxmot >= 11 returns ndarray with cols [x1, y1, x2, y2, id, conf, cls, det_idx]
        tracks: list[Track] = []
        for row in result:
            x1, y1, x2, y2 = float(row[0]), float(row[1]), float(row[2]), float(row[3])
            tid = int(row[4])
            conf = float(row[5])
            cls_id = int(row[6])
            det_idx = int(row[7]) if len(row) > 7 else -1
            class_name = (
                person_dets[det_idx].class_name
                if 0 <= det_idx < len(person_dets)
                else "person"
            )
            d = Detection(
                class_id=cls_id,
                class_name=class_name,
                confidence=conf,
                bbox=(
                    max(0.0, min(1.0, x1 / max(1.0, w))),
                    max(0.0, min(1.0, y1 / max(1.0, h))),
                    max(0.0, min(1.0, x2 / max(1.0, w))),
                    max(0.0, min(1.0, y2 / max(1.0, h))),
                ),
            )
            tracks.append(Track(track_id=tid, detection=d, age_frames=1))
        return tracks


# ─────────────── per-(session, camera) registry ───────────────

_REGISTRY: dict[tuple[str, str], SessionTracker] = {}
_REGISTRY_LOCK = threading.Lock()


def get_tracker(session_id: str, camera_id: str) -> SessionTracker:
    """Return the tracker for a (session, camera) pair, creating it if needed."""
    key = (session_id, camera_id)
    with _REGISTRY_LOCK:
        tr = _REGISTRY.get(key)
        if tr is None:
            tr = SessionTracker()
            _REGISTRY[key] = tr
        return tr


def drop_tracker(session_id: str, camera_id: str) -> None:
    """Forget the tracker for a (session, camera) pair — call on WS close."""
    with _REGISTRY_LOCK:
        _REGISTRY.pop((session_id, camera_id), None)


def _reset_registry_for_tests() -> None:
    """Test hook — wipe the global registry between unit tests."""
    with _REGISTRY_LOCK:
        _REGISTRY.clear()
