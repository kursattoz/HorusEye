"""WebSocket publish route — PRD-019 §4.4.

Telefondan gelen ham JPEG frame'leri kabul eder, decode eder ve mevcut
detection pipeline'ının ortak frame queue'suna kaydeder. Aynı oturum için
birden fazla kamera (sabit IP + telefon + USB) paralel olarak frame
gönderebilir; her bir (session_id, camera_id) çifti ayrı slot'a yazar.

Wire format (PRD-019 §4.4):

1. WS bağlandığında ilk mesaj JSON ``{type: "publish", api_key, session_id,
   camera_id}`` (handshake).
2. Sonrasında ardışık **binary** mesajlar — her message ham JPEG buffer'ı,
   header yok. 5 FPS'te (200ms) gelir.
3. Aralarda gelen text mesajlar (``ping`` vb.) control kanalı olarak
   yorumlanır; bağlantı sıcak tutulur.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.api.broadcaster import broadcaster
from src.api.protocol import (
    PROTOCOL_VERSION,
    error_message,
    is_valid_publish,
    status_message,
)
from src.detection.yolo_detector import YoloDetector, DetectorConfig

log = logging.getLogger(__name__)

router = APIRouter()

# Idle heartbeat: kapatma sınırı. Telefon 5s'te bir ping atar, 15s sessizlik
# = disconnected.
_IDLE_TIMEOUT_SECONDS = 15.0

# Geçici cv2 import — opencv-python-headless yoksa decode atlanır
try:
    import cv2  # type: ignore[import-untyped]
    import numpy as np  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover - opencv missing in some test envs
    cv2 = None  # type: ignore[misc, assignment]
    np = None  # type: ignore[misc, assignment]


# ───────────────────── frame queue (in-memory) ─────────────────────


@dataclass
class PublishedFrame:
    session_id: str
    camera_id: str
    raw_jpeg: bytes
    bgr: Any | None              # numpy ndarray or None when cv2 unavailable
    received_at: datetime
    width: int | None = None
    height: int | None = None


@dataclass
class _FrameStore:
    """Per-session in-memory cache of the most recent frame per camera.

    Senkronizasyon için Lock kullanır; detection pipeline başka bir thread'den
    okuduğunda race olmasın diye.
    """

    _frames: dict[tuple[str, str], PublishedFrame] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def put(self, frame: PublishedFrame) -> None:
        with self._lock:
            self._frames[(frame.session_id, frame.camera_id)] = frame

    def get(self, session_id: str, camera_id: str) -> Optional[PublishedFrame]:
        with self._lock:
            return self._frames.get((session_id, camera_id))

    def list_session(self, session_id: str) -> list[PublishedFrame]:
        with self._lock:
            return [f for (sid, _), f in self._frames.items() if sid == session_id]

    def drop(self, session_id: str, camera_id: str) -> None:
        with self._lock:
            self._frames.pop((session_id, camera_id), None)


frame_store = _FrameStore()


# ───────────────────── shared YOLO singleton ────────────────────
# Lazy-loaded once per process; inference runs in a threadpool so the
# event loop stays responsive for WS reads and broadcasts.
_yolo: YoloDetector | None = None
_yolo_lock = Lock()


def _get_yolo() -> YoloDetector | None:
    """Return the process-wide YoloDetector. None if YOLO is disabled or
    fails to load (we still want to broadcast bare frames)."""
    global _yolo
    if os.getenv("DISABLE_YOLO") == "1":
        return None
    if _yolo is not None:
        return _yolo
    with _yolo_lock:
        if _yolo is not None:
            return _yolo
        try:
            det = YoloDetector(DetectorConfig())
            det.load()
            _yolo = det
            log.info("YOLO loaded for broadcast inference")
        except Exception as e:  # noqa: BLE001
            log.warning("YOLO load failed (%s) — frames will broadcast without detections", e)
            _yolo = None
    return _yolo


# ───────────────────── helpers ─────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expected_api_key() -> str:
    return os.getenv("AI_SERVICE_API_KEY", "")


def _decode_jpeg(buf: bytes) -> tuple[Any | None, int | None, int | None]:
    """JPEG buffer'ı BGR ndarray'e çevir. cv2 yoksa None döndür."""
    if cv2 is None or np is None:
        return None, None, None
    arr = np.frombuffer(buf, dtype=np.uint8)
    if arr.size == 0:
        return None, None, None
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        return None, None, None
    h, w = bgr.shape[:2]
    return bgr, int(w), int(h)


def _detect_sync(bgr: Any) -> list[dict[str, Any]]:
    """Run YOLO over a BGR frame; returns ServerDetection-like dicts.
    Synchronous — call via asyncio.to_thread."""
    det = _get_yolo()
    if det is None or bgr is None:
        return []
    try:
        results = det.detect(bgr)
    except Exception as e:  # noqa: BLE001
        log.debug("YOLO inference failed: %s", e)
        return []
    return [
        {
            "track_id": None,
            "detection_class": d.class_name,
            "confidence": float(d.confidence),
            "bbox": list(d.bbox),
        }
        for d in results
    ]


# ───────────────────── route ─────────────────────


@router.websocket("/ws/sessions/{session_id}/publish")
async def session_publish(websocket: WebSocket, session_id: str) -> None:
    """Phone-as-camera publish endpoint — PRD-019 §4.4."""
    await websocket.accept()

    # 1) Handshake — JSON publish (5 sn)
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
    except asyncio.TimeoutError:
        await websocket.send_json(error_message("auth_failed", "publish handshake timeout", session_id))
        await websocket.close()
        return

    try:
        first: Any = json.loads(raw)
    except json.JSONDecodeError:
        await websocket.send_json(error_message("invalid_payload", "first message must be JSON", session_id))
        await websocket.close()
        return

    if not is_valid_publish(first):
        await websocket.send_json(error_message("invalid_payload", "first message must be 'publish'", session_id))
        await websocket.close()
        return

    expected = _expected_api_key()
    if expected and first.get("api_key") != expected:
        await websocket.send_json(error_message("auth_failed", "invalid api_key", session_id))
        await websocket.close()
        return

    if first.get("session_id") != session_id:
        await websocket.send_json(error_message("invalid_payload", "session_id mismatch with URL", session_id))
        await websocket.close()
        return

    camera_id = str(first.get("camera_id"))
    await websocket.send_json(
        status_message(session_id, "connected", f"publish stream open camera_id={camera_id}", _now_iso())
    )

    log.info("publish stream open: session=%s camera=%s", session_id, camera_id)

    frames_received = 0

    # 2) Pump loop: binary frame'ler + control text mesajları + idle timeout
    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive(), timeout=_IDLE_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                log.warning("publish idle timeout: session=%s camera=%s frames=%d",
                            session_id, camera_id, frames_received)
                await websocket.send_json(error_message("internal", "idle timeout", session_id))
                await websocket.close()
                return

            mtype = msg.get("type")
            if mtype == "websocket.disconnect":
                break

            if "bytes" in msg and msg["bytes"] is not None:
                buf: bytes = msg["bytes"]
                bgr, w, h = _decode_jpeg(buf)
                frame_store.put(
                    PublishedFrame(
                        session_id=session_id,
                        camera_id=camera_id,
                        raw_jpeg=buf,
                        bgr=bgr,
                        received_at=datetime.now(timezone.utc),
                        width=w,
                        height=h,
                    )
                )
                frames_received += 1

                # Fan out to detection subscribers — only if anyone is watching.
                if broadcaster.subscriber_count(session_id) > 0:
                    detections = await asyncio.to_thread(_detect_sync, bgr) if bgr is not None else []
                    frame_msg = {
                        "type": "frame",
                        "protocol_version": PROTOCOL_VERSION,
                        "session_id": session_id,
                        "camera_id": camera_id,
                        "width": w or 0,
                        "height": h or 0,
                        "jpeg_base64": base64.b64encode(buf).decode("ascii"),
                        "timestamp": _now_iso(),
                        "detections": detections,
                    }
                    broadcaster.broadcast(session_id, frame_msg)
                continue

            if "text" in msg and msg["text"] is not None:
                try:
                    payload = json.loads(msg["text"])
                except json.JSONDecodeError:
                    await websocket.send_json(error_message("invalid_payload", "non-JSON text", session_id))
                    continue
                ptype = payload.get("type") if isinstance(payload, dict) else None
                if ptype == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": _now_iso()})
                elif ptype == "unsubscribe":
                    await websocket.send_json(
                        status_message(session_id, "stream_ended", "publish closed by client", _now_iso())
                    )
                    await websocket.close()
                    return
                else:
                    await websocket.send_json(
                        error_message("invalid_payload", f"unknown control type: {ptype}", session_id)
                    )
    except WebSocketDisconnect:
        log.debug("publish WS disconnected: session=%s camera=%s frames=%d",
                  session_id, camera_id, frames_received)
    finally:
        frame_store.drop(session_id, camera_id)
        log.info("publish stream closed: session=%s camera=%s total_frames=%d",
                 session_id, camera_id, frames_received)


# Re-export for tests
_PROTOCOL_VERSION = PROTOCOL_VERSION
