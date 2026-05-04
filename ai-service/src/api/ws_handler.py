"""WebSocket routes — PRD-013 §3.2 / §11 (detection + video).

Implements the AI ↔ Portal protocol defined in ``protocol.py``:
- ``subscribe`` (with API key auth) → ``status:connected``
- ``ping`` → ``pong``
- ``unsubscribe`` → close
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.api.protocol import (
    PROTOCOL_VERSION,
    error_message,
    is_valid_subscribe,
    status_message,
)

log = logging.getLogger(__name__)

router = APIRouter()

# Heartbeat: server pushes a ping if the client is silent for this long
_HEARTBEAT_SECONDS = 30


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expected_api_key() -> str:
    return os.getenv("AI_SERVICE_API_KEY", "")


@router.websocket("/ws/sessions/{session_id}/detections")
async def session_detections(websocket: WebSocket, session_id: str) -> None:
    """JSON detection / status stream — PRD-013 protocol v1.0."""
    await websocket.accept()

    # 1) Wait for the subscribe handshake (5 second window)
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
    except asyncio.TimeoutError:
        await websocket.send_json(error_message("auth_failed", "subscribe timeout", session_id))
        await websocket.close()
        return

    try:
        first: Any = json.loads(raw)
    except json.JSONDecodeError:
        await websocket.send_json(error_message("invalid_payload", "first message must be JSON", session_id))
        await websocket.close()
        return

    if not is_valid_subscribe(first):
        await websocket.send_json(error_message("invalid_payload", "first message must be 'subscribe'", session_id))
        await websocket.close()
        return

    expected = _expected_api_key()
    # When AI_SERVICE_API_KEY is unset (local dev), auth is bypassed.
    if expected and first.get("api_key") != expected:
        await websocket.send_json(error_message("auth_failed", "invalid api_key", session_id))
        await websocket.close()
        return

    if first.get("session_id") != session_id:
        await websocket.send_json(error_message("invalid_payload", "session_id mismatch with URL", session_id))
        await websocket.close()
        return

    await websocket.send_json(
        status_message(session_id, "connected", "subscribed; awaiting detections", _now_iso())
    )

    # 2) Pump loop: handle ping/unsubscribe; idle heartbeat
    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=_HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                # idle — send a server-initiated pong so connection stays warm
                await websocket.send_json({"type": "pong", "timestamp": _now_iso()})
                continue

            try:
                msg: Any = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json(error_message("invalid_payload", "non-JSON payload", session_id))
                continue

            mtype = msg.get("type") if isinstance(msg, dict) else None
            if mtype == "ping":
                await websocket.send_json({"type": "pong", "timestamp": _now_iso()})
            elif mtype == "ack":
                # client confirmed receipt — currently informational
                continue
            elif mtype == "unsubscribe":
                await websocket.send_json(
                    status_message(session_id, "stream_ended", "unsubscribed", _now_iso())
                )
                await websocket.close()
                return
            else:
                await websocket.send_json(
                    error_message("invalid_payload", f"unknown type: {mtype}", session_id)
                )
    except WebSocketDisconnect:
        log.debug("detections WS closed: session_id=%s", session_id)


@router.websocket("/ws/sessions/{session_id}/video")
async def session_video(websocket: WebSocket, session_id: str) -> None:
    """Annotated frame channel (Phase A: stub; populated when AI pipeline lands)."""
    await websocket.accept()
    await websocket.send_json(
        status_message(session_id, "connected", "video channel ready (no frames yet)", _now_iso())
    )
    try:
        while True:
            await websocket.receive_text()
            await websocket.send_json({"type": "pong", "timestamp": _now_iso()})
    except WebSocketDisconnect:
        log.debug("video WS closed: session_id=%s", session_id)


_GREETING_PROTOCOL_VERSION = PROTOCOL_VERSION  # re-export for tests
