"""FastAPI application — PRD-013 §12 (AI service)."""

from __future__ import annotations

import os
from pathlib import Path

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.ws_handler import router as ws_router

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


@app.get("/health")
def health() -> dict[str, str]:
    name = (config.get("service") or {}).get("name", "horus-eye-ai")
    return {"status": "ok", "service": str(name)}
