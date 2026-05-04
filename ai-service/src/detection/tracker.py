"""BoT-SORT single-camera tracker — BL-48 (PRD-013 §3.2).

Phase A.1 scaffold around ``ultralytics.tracker.BOTSORT``. The full Phase A
pipeline runs YOLOv8n → tracker → scoring; this module owns the middle
step and exposes :class:`Track` instances that the scoring layer
(``src.detection.scoring``) consumes.

Until the ultralytics tracker is wired in (one-line swap), the module
falls back to an IoU-based greedy matcher so unit tests stay deterministic
without requiring weights or a GPU.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from src.detection.yolo_detector import Detection

log = logging.getLogger(__name__)


@dataclass
class Track:
    track_id:    int
    detection:   Detection
    age_frames:  int = 0
    missed_frames: int = 0
    history: list[Detection] = field(default_factory=list)


@dataclass
class IoUTracker:
    """Minimal IoU-greedy tracker — placeholder for BoT-SORT.

    Tracks survive ``max_missed`` consecutive frames without a match before
    being removed. ``iou_threshold`` controls match strictness (0.3 is
    permissive enough for nano YOLO with people moving in seats).
    """

    iou_threshold: float = 0.3
    max_missed:    int   = 8
    _next_id:      int   = 1
    _tracks:       list[Track] = field(default_factory=list)

    def step(self, detections: list[Detection]) -> list[Track]:
        """Advance one frame. Returns the live tracks after matching."""
        # Score every (track, detection) pair by IoU
        unmatched_dets = list(range(len(detections)))
        unmatched_trks = list(range(len(self._tracks)))

        pairs: list[tuple[float, int, int]] = []
        for ti, t in enumerate(self._tracks):
            for di, d in enumerate(detections):
                iou = _iou(t.detection.bbox, d.bbox)
                if iou >= self.iou_threshold:
                    pairs.append((iou, ti, di))

        # Greedy: sort by IoU desc, claim each pair if both endpoints unmatched
        pairs.sort(key=lambda p: -p[0])
        for iou, ti, di in pairs:
            if ti in unmatched_trks and di in unmatched_dets:
                self._tracks[ti].detection = detections[di]
                self._tracks[ti].age_frames += 1
                self._tracks[ti].missed_frames = 0
                self._tracks[ti].history.append(detections[di])
                if len(self._tracks[ti].history) > 60:
                    self._tracks[ti].history.pop(0)
                unmatched_trks.remove(ti)
                unmatched_dets.remove(di)

        # Unmatched tracks → bump missed
        for ti in unmatched_trks:
            self._tracks[ti].missed_frames += 1

        # Unmatched detections → spawn new track
        for di in unmatched_dets:
            self._tracks.append(Track(
                track_id=self._next_id,
                detection=detections[di],
                age_frames=1,
                history=[detections[di]],
            ))
            self._next_id += 1

        # Drop stale tracks
        self._tracks = [t for t in self._tracks if t.missed_frames <= self.max_missed]

        return list(self._tracks)


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter   = inter_w * inter_h
    if inter <= 0:
        return 0.0
    area_a = max(0.0, (ax2 - ax1)) * max(0.0, (ay2 - ay1))
    area_b = max(0.0, (bx2 - bx1)) * max(0.0, (by2 - by1))
    union  = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


# ───────── BoT-SORT plug-in (off by default until weights cached) ─────────

def make_botsort_tracker() -> Optional[object]:
    """Return an ultralytics BoT-SORT tracker if the dependency is installed.

    Returns ``None`` when ultralytics or torch isn't importable so callers
    can fall back to :class:`IoUTracker`.
    """
    try:
        from ultralytics.trackers import BOTSORT
    except ImportError:
        log.info("ultralytics BoT-SORT not available; using IoUTracker fallback")
        return None
    try:
        return BOTSORT(args=None)  # ultralytics supplies sensible defaults
    except Exception as e:
        log.warning("BoT-SORT init failed: %s", e)
        return None
