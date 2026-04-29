"""WebSocket routes — PRD-013 §11 / §12.4 (detection + video stream placeholders)."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

log = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/sessions/{session_id}/detections")
async def session_detections(websocket: WebSocket, session_id: str) -> None:
    """JSON detection / status stream (Phase A: connect + heartbeat stub)."""
    await websocket.accept()
    hello: dict[str, Any] = {
        "type": "status",
        "session_id": session_id,
        "message": "ai-service Phase A — detections channel ready",
    }
    await websocket.send_text(json.dumps(hello))
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"text": raw}
            await websocket.send_json({"type": "echo", "session_id": session_id, "payload": payload})
    except WebSocketDisconnect:
        log.debug("detections WS closed: session_id=%s", session_id)


@router.websocket("/ws/sessions/{session_id}/video")
async def session_video(websocket: WebSocket, session_id: str) -> None:
    """Annotated JPEG / MJPEG-over-WS placeholder (Phase A)."""
    await websocket.accept()
    await websocket.send_json(
        {
            "type": "status",
            "session_id": session_id,
            "message": "ai-service Phase A — video channel stub (no frames yet)",
        }
    )
    try:
        while True:
            await websocket.receive_text()
            await websocket.send_json({"type": "noop", "session_id": session_id})
    except WebSocketDisconnect:
        log.debug("video WS closed: session_id=%s", session_id)
