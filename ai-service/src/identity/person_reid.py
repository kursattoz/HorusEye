"""Person Re-ID embedder — PRD-021 §3 Sprint 18 (BL-312).

A 512-D body embedding per detected person, used to match the same
student across overlapping cameras. Pattern mirrors
:mod:`src.identity.face_embedder` (ArcFace from Sprint 10) but uses a
body model (OSNet-x0_25) so it works when faces are turned away or
partially covered.

Lazy load: TorchReID isn't imported until the first call. Falls back
to a deterministic placeholder embedding when the backend is missing,
so tests + dev environments don't need the full ML stack.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np

log = logging.getLogger(__name__)

EMBEDDING_DIM = 512


@dataclass(frozen=True)
class BodyEmbedding:
    vector: np.ndarray         # shape (512,)
    confidence: float           # 0..1 — proxy for crop quality


class PersonReIDExtractor:
    """OSNet-x0_25 lazy wrapper. Returns None if model can't load."""

    def __init__(self) -> None:
        self._loaded = False
        self._model: Any = None
        self._transform: Any = None
        self._lock = threading.Lock()

    def load(self) -> None:
        if self._loaded:
            return
        try:
            import torch  # type: ignore[import-not-found]
            import torchreid  # type: ignore[import-not-found]
            from torchvision import transforms  # type: ignore[import-not-found]
        except ImportError:
            log.info("torchreid not installed; PersonReIDExtractor will return placeholder embeddings")
            self._loaded = True
            return
        self._model = torchreid.models.build_model(
            name="osnet_x0_25",
            num_classes=1,
            pretrained=True,
        )
        self._model.eval()
        self._transform = transforms.Compose([
            transforms.Resize((256, 128)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])
        self._loaded = True

    def extract_for_track(
        self,
        frame_bgr: Any,
        person_bbox: tuple[float, float, float, float],
    ) -> Optional[BodyEmbedding]:
        """Crop ``person_bbox`` from the frame and emit a 512-D embedding."""
        if frame_bgr is None or person_bbox is None:
            return None
        if not self._loaded:
            self.load()

        try:
            h, w = frame_bgr.shape[:2]
        except AttributeError:
            return None

        x1 = max(0, int(person_bbox[0] * w))
        y1 = max(0, int(person_bbox[1] * h))
        x2 = min(int(w), int(person_bbox[2] * w))
        y2 = min(int(h), int(person_bbox[3] * h))
        if x2 - x1 < 32 or y2 - y1 < 64:
            return None

        roi = frame_bgr[y1:y2, x1:x2]
        if self._model is None:
            # Deterministic placeholder so tests + missing-deps environments
            # still produce comparable embeddings for the same crop dims.
            return _placeholder_embedding(roi)
        return self._inference(roi)

    # ───────── internal ─────────

    def _inference(self, roi_bgr: Any) -> BodyEmbedding:
        import cv2  # type: ignore[import-untyped]
        import torch  # type: ignore[import-not-found]
        from PIL import Image  # type: ignore[import-not-found]

        rgb = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        with self._lock:
            tensor = self._transform(pil).unsqueeze(0)
            with torch.no_grad():
                feats = self._model(tensor)
        v = feats.squeeze(0).cpu().numpy().astype(np.float32)
        norm = np.linalg.norm(v) or 1.0
        return BodyEmbedding(vector=v / norm, confidence=0.95)


# ───────── placeholder ─────────

def _placeholder_embedding(roi: Any) -> BodyEmbedding:
    """Deterministic 512-D embedding from a SHA-256 of the small thumbnail.

    Not suitable for real Re-ID — only used when torchreid isn't available
    so the test harness can verify the matcher's plumbing.
    """
    try:
        import cv2  # type: ignore[import-untyped]
        small = cv2.resize(roi, (16, 16))
        payload = small.tobytes()
    except Exception:  # noqa: BLE001
        payload = b"empty"
    seed = int.from_bytes(hashlib.sha256(payload).digest()[:8], "big")
    rng = np.random.default_rng(seed)
    v = rng.standard_normal(EMBEDDING_DIM).astype(np.float32)
    v = v / (np.linalg.norm(v) or 1.0)
    return BodyEmbedding(vector=v, confidence=0.0)


def cosine_similarity(a: BodyEmbedding, b: BodyEmbedding) -> float:
    """Both embeddings are unit-normalized in __init__, so dot product is fine."""
    return float(np.dot(a.vector, b.vector))


# ───────── singleton ─────────

_singleton: PersonReIDExtractor | None = None


def get_reid_extractor() -> PersonReIDExtractor:
    global _singleton
    if _singleton is None:
        _singleton = PersonReIDExtractor()
    return _singleton


def reset_for_tests() -> None:
    global _singleton
    _singleton = None
