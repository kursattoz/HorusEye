"""Face embedding HTTP endpoint — BL-218 (PRD-013 §6.13).

Portal's ``POST /api/students/[id]/face-enroll`` proxies an uploaded
JPEG/PNG to this route, which crops + embeds via :class:`FaceEmbedder`
and returns the 512-dim vector. Authentication is the existing
``AI_SERVICE_API_KEY`` shared between the portal and the AI service.

Request (multipart/form-data):
  image: JPEG/PNG bytes
  bbox:  optional 'x1,y1,x2,y2' normalized 0..1 (whitespace ok)
  api_key: header X-AI-Service-Key

Response 200: { embedding: float[512], dim: 512 }
        404:  { error: 'no face detected' }
        401:  { error: 'invalid api_key' }
        503:  { error: 'face embedder unavailable' }
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from src.identity.face_embedder import EMBEDDING_DIM, get_face_embedder

log = logging.getLogger(__name__)

router = APIRouter()

try:
    import cv2  # type: ignore[import-untyped]
    import numpy as np  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover — production image always has these
    cv2 = None  # type: ignore[assignment]
    np = None  # type: ignore[assignment]


def _parse_bbox(raw: str | None) -> tuple[float, float, float, float] | None:
    if not raw:
        return None
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) != 4:
        return None
    try:
        nums = tuple(float(p) for p in parts)
    except ValueError:
        return None
    return nums  # type: ignore[return-value]


@router.post("/embed")
async def embed_face(
    image: UploadFile = File(...),
    bbox:  Optional[str] = Form(default=None),
    x_ai_service_key: Optional[str] = Header(default=None, alias="X-AI-Service-Key"),
):
    expected_key = os.getenv("AI_SERVICE_API_KEY", "")
    if expected_key and x_ai_service_key != expected_key:
        raise HTTPException(status_code=401, detail="invalid api_key")

    if cv2 is None or np is None:
        raise HTTPException(status_code=503, detail="opencv unavailable")

    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty image body")
    arr = np.frombuffer(raw, dtype=np.uint8)
    if arr.size == 0:
        raise HTTPException(status_code=400, detail="invalid image bytes")
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status_code=400, detail="image decode failed")

    embedder = get_face_embedder()
    if not embedder.is_available:
        raise HTTPException(status_code=503, detail="face embedder unavailable")

    person_bbox = _parse_bbox(bbox)
    embedding = embedder.embed(bgr, person_bbox=person_bbox)
    if embedding is None:
        raise HTTPException(status_code=404, detail="no face detected")

    return {
        "embedding": embedding.tolist(),
        "dim":       EMBEDDING_DIM,
    }
