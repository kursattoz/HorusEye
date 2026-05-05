"""ArcFace face embedder — BL-217 (PRD-013 §6.13).

Wraps insightface's ``buffalo_l`` pack (RetinaFace detector + ArcFace
ResNet50 embedder) with:

* lazy initialization — the FaceAnalysis pipeline takes ~3-4s to load,
  so we pay it once per process.
* per-instance ``threading.Lock`` — onnxruntime sessions aren't
  thread-safe, and the publish handler dispatches frame work to
  ``asyncio.to_thread``.
* optional person-bbox crop so we embed the right face when multiple
  people share the frame.

Returns a 512-dim ``numpy.ndarray`` (already L2-normalized — insightface
provides ``normed_embedding`` directly), or ``None`` when no face is
detected, the bbox is degenerate, or the package is unavailable.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any, Optional

log = logging.getLogger(__name__)

try:
    import numpy as np  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover — opencv stack always ships numpy
    np = None  # type: ignore[assignment]

EMBEDDING_DIM = 512
DEFAULT_PACK_NAME = "buffalo_l"


def _load_face_analysis_class() -> Any | None:
    """Import insightface lazily so missing native deps don't crash startup."""
    if os.getenv("DISABLE_INSIGHTFACE") == "1":
        log.info("DISABLE_INSIGHTFACE=1 → FaceEmbedder will return None")
        return None
    try:
        from insightface.app import FaceAnalysis  # type: ignore[import-untyped]
        return FaceAnalysis
    except ImportError:
        log.info("insightface not installed; FaceEmbedder will return None")
        return None
    except Exception as e:  # noqa: BLE001 — native libs may segfault on import
        log.warning("insightface import failed (%s); embedder disabled", e)
        return None


_FACE_ANALYSIS_CLS = _load_face_analysis_class()


class FaceEmbedder:
    """Extracts a 512-dim ArcFace embedding for the face inside a person bbox."""

    def __init__(
        self,
        pack_name: str = DEFAULT_PACK_NAME,
        root: str | None = None,
    ) -> None:
        self._pack_name = pack_name
        self._root = root or os.getenv("INSIGHTFACE_HOME") or "/app/models/insightface"
        self._app: Any = None
        self._loaded = False
        self._lock = threading.Lock()

    # ───────── lifecycle ─────────

    def load(self) -> None:
        if self._loaded:
            return
        if _FACE_ANALYSIS_CLS is None or np is None:
            self._loaded = True
            return
        try:
            self._app = _FACE_ANALYSIS_CLS(
                name=self._pack_name,
                root=self._root,
                providers=["CPUExecutionProvider"],
            )
            self._app.prepare(ctx_id=-1, det_size=(640, 640))
            log.info(
                "FaceEmbedder initialized: pack=%s root=%s",
                self._pack_name, self._root,
            )
        except Exception as e:  # noqa: BLE001 — keep service alive on init failure
            log.warning("FaceEmbedder.prepare failed (%s); embedder disabled", e)
            self._app = None
        self._loaded = True

    @property
    def is_available(self) -> bool:
        if not self._loaded:
            self.load()
        return self._app is not None

    # ───────── extraction ─────────

    def embed(
        self,
        frame_bgr: Any,
        person_bbox: tuple[float, float, float, float] | None = None,
    ) -> Optional[Any]:
        """Embed the most-confident face in the (optionally cropped) frame.

        Returns a 512-dim ``numpy.ndarray`` with L2 norm == 1, or ``None``
        when no face is detected / dependencies missing / bbox degenerate.
        """
        if frame_bgr is None:
            return None
        if not self._loaded:
            self.load()
        if self._app is None or np is None:
            return None

        roi = self._crop(frame_bgr, person_bbox) if person_bbox else frame_bgr
        if roi is None:
            return None

        with self._lock:
            try:
                faces = self._app.get(roi)
            except Exception as e:  # noqa: BLE001
                log.warning("FaceAnalysis.get failed: %s", e)
                return None

        if not faces:
            return None

        best = max(faces, key=lambda f: float(getattr(f, "det_score", 0.0)))
        # insightface provides normed_embedding (L2-normalized) — fall back to raw.
        emb = getattr(best, "normed_embedding", None)
        if emb is None:
            emb = getattr(best, "embedding", None)
        if emb is None:
            return None
        arr = np.asarray(emb, dtype=np.float32)
        if arr.shape[-1] != EMBEDDING_DIM:
            log.warning(
                "unexpected embedding dim %d (expected %d)",
                int(arr.shape[-1]), EMBEDDING_DIM,
            )
            return None
        return arr

    def _crop(
        self,
        frame_bgr: Any,
        person_bbox: tuple[float, float, float, float],
    ) -> Any | None:
        try:
            h, w = frame_bgr.shape[:2]
        except AttributeError:
            return None
        x1 = max(0, int(person_bbox[0] * w))
        y1 = max(0, int(person_bbox[1] * h))
        x2 = min(int(w), int(person_bbox[2] * w))
        y2 = min(int(h), int(person_bbox[3] * h))
        # ArcFace expects ≥112x112; bail on tiny crops to skip the model.
        if x2 - x1 < 64 or y2 - y1 < 64:
            return None
        return frame_bgr[y1:y2, x1:x2]


# ───────── process-global singleton ─────────

_INSTANCE: FaceEmbedder | None = None
_INSTANCE_LOCK = threading.Lock()


def get_face_embedder() -> FaceEmbedder:
    """Return the process-wide embedder, creating it on first use."""
    global _INSTANCE
    if _INSTANCE is not None:
        return _INSTANCE
    with _INSTANCE_LOCK:
        if _INSTANCE is None:
            _INSTANCE = FaceEmbedder()
        return _INSTANCE


def _reset_for_tests() -> None:
    global _INSTANCE
    with _INSTANCE_LOCK:
        _INSTANCE = None
