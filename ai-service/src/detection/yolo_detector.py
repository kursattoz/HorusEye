"""YOLOv8n COCO pre-trained detector — BL-42 (PRD-013 §4.1, §7.2 TIER-1).

Wraps the ultralytics YOLOv8 nano model with:
- lazy model loading (downloaded on first use if missing)
- class-of-interest filter (person, cell phone, laptop, book, keyboard)
- confidence + IoU threshold knobs from config.yaml
- output normalized to ``Detection`` dataclass (BBox in 0-1 coords)

Phase A only. Tracking (BoT-SORT) and scoring (RiskScorer) are downstream.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Iterable, Optional

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Detection:
    class_id: int
    class_name: str
    confidence: float
    # Normalized bbox in [0, 1] coords: (x1, y1, x2, y2)
    bbox: tuple[float, float, float, float]


@dataclass
class DetectorConfig:
    model_path: str = "models/yolov8n.pt"
    confidence_threshold: float = 0.45
    iou_threshold: float = 0.50
    device: str = "cpu"
    # BL-265: laptop (63) and keyboard (76) removed — they don't belong
    # on an exam desk and their previous paper_detected mapping was a
    # false-positive source. Just person/phone/book now until Sprint 16
    # ships the paper_notes custom class.
    classes_of_interest: tuple[int, ...] = (0, 67, 73)


class YoloDetector:
    """Lazy-initialized YOLOv8n detector."""

    def __init__(self, cfg: DetectorConfig | None = None) -> None:
        self.cfg = cfg or DetectorConfig()
        self._model: Any = None
        self._class_names: dict[int, str] = {}

    # ───────── lifecycle ─────────

    def load(self) -> None:
        """Load (and download if needed) the YOLOv8 model."""
        if self._model is not None:
            return
        from ultralytics import YOLO  # imported lazily — heavy dep

        log.info("loading YOLO model: %s (device=%s)", self.cfg.model_path, self.cfg.device)
        self._model = YOLO(self.cfg.model_path)
        # ultralytics exposes class names as a dict[int, str]
        names = getattr(self._model, "names", None)
        if isinstance(names, dict):
            self._class_names = {int(k): str(v) for k, v in names.items()}
        elif isinstance(names, list):
            self._class_names = {i: str(n) for i, n in enumerate(names)}

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    # ───────── inference ─────────

    def detect(self, frame: Any) -> list[Detection]:
        """Run one frame through YOLO. Returns filtered, normalized detections.

        ``frame`` is a BGR numpy ndarray (HxWx3) as produced by OpenCV.
        """
        if self._model is None:
            self.load()

        # ultralytics accepts numpy arrays directly; verbose=False to mute stdout
        results = self._model(  # type: ignore[union-attr]
            frame,
            conf=self.cfg.confidence_threshold,
            iou=self.cfg.iou_threshold,
            classes=list(self.cfg.classes_of_interest) or None,
            device=self.cfg.device,
            verbose=False,
        )
        if not results:
            return []
        return self._normalize(results[0], frame)

    def _normalize(self, result: Any, frame: Any) -> list[Detection]:
        """Convert a single ultralytics Result → list[Detection]."""
        boxes = getattr(result, "boxes", None)
        if boxes is None or len(boxes) == 0:
            return []

        h = float(getattr(frame, "shape", (1, 1))[0]) or 1.0
        w = float(getattr(frame, "shape", (1, 1))[1]) or 1.0

        # ultralytics: boxes.xyxy (Nx4 absolute pixels), boxes.cls, boxes.conf
        xyxy = _to_python(boxes.xyxy)
        cls_arr = _to_python(boxes.cls)
        conf_arr = _to_python(boxes.conf)

        out: list[Detection] = []
        for i, (x1, y1, x2, y2) in enumerate(xyxy):
            class_id = int(cls_arr[i])
            confidence = float(conf_arr[i])
            class_name = self._class_names.get(class_id, str(class_id))
            out.append(
                Detection(
                    class_id=class_id,
                    class_name=class_name,
                    confidence=confidence,
                    bbox=(
                        max(0.0, min(1.0, x1 / w)),
                        max(0.0, min(1.0, y1 / h)),
                        max(0.0, min(1.0, x2 / w)),
                        max(0.0, min(1.0, y2 / h)),
                    ),
                )
            )
        return out


# ───────── helpers ─────────

def _to_python(t: Any) -> list:
    """Convert torch.Tensor or numpy array to a plain Python list."""
    cpu = getattr(t, "cpu", None)
    if callable(cpu):
        t = cpu()
    arr = getattr(t, "numpy", None)
    if callable(arr):
        t = arr()
    tolist = getattr(t, "tolist", None)
    if callable(tolist):
        return tolist()
    return list(t)


def filter_by_classes(detections: Iterable[Detection], names: set[str]) -> list[Detection]:
    return [d for d in detections if d.class_name in names]


def map_to_incident_type(class_name: str, mapping: dict[str, str]) -> Optional[str]:
    """Look up an Incident type for a COCO class name (None if no rule)."""
    return mapping.get(class_name)
