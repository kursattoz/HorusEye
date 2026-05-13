"""FastAPI application — PRD-013 §12 (AI service)."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.embed_handler import router as embed_router
from src.api.publish_handler import _get_yolo
from src.api.publish_handler import router as publish_router
from src.api.ws_handler import router as ws_router

log = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"


def _load_config() -> dict:
    if not _CONFIG_PATH.is_file():
        return {}
    with _CONFIG_PATH.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


config = _load_config()

app = FastAPI(
    title="HorusEye AI Service",
    version="0.1.0",
    description="Phase A scaffold — FastAPI + WebSocket + RTSP ingestion skeleton (PRD-013).",
)

_cors = os.getenv("CORS_ORIGINS", "*").strip()
if _cors == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    origins = [o.strip() for o in _cors.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(ws_router)
app.include_router(publish_router)
app.include_router(embed_router)


@app.on_event("startup")
def _warmup_yolo() -> None:
    """Eager-load YOLO at process boot (BL-246 / PRD-021 Sprint 13).

    Without this, the first WebSocket frame triggers a 5-15s lazy load
    that blocks the receive loop; mobile clients overflow their WS send
    buffer and drop with code 1006 after ~10 frames. Warming the model
    here cuts first-inference latency to < 100ms.

    Failures are non-fatal — _get_yolo() returns None on error and the
    broadcast pipeline continues without detections.
    """
    if os.getenv("DISABLE_YOLO") == "1":
        log.info("YOLO disabled via DISABLE_YOLO=1 — skipping eager init")
        return
    t0 = time.monotonic()
    det = _get_yolo()
    dt_ms = int((time.monotonic() - t0) * 1000)
    if det is not None:
        log.info("YOLO eager init complete yolo_init_duration_ms=%d", dt_ms)
    else:
        log.warning(
            "YOLO eager init failed — broadcasts will run without detections "
            "yolo_init_duration_ms=%d",
            dt_ms,
        )


@app.get("/health")
def health() -> dict[str, str]:
    name = (config.get("service") or {}).get("name", "horus-eye-ai")
    return {"status": "ok", "service": str(name)}
