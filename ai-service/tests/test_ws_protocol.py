"""WebSocket protocol tests — BL-120 (PRD-013 §3.2)."""

from __future__ import annotations

import os

from fastapi.testclient import TestClient

from src.api.protocol import PROTOCOL_VERSION
from src.main import app

client = TestClient(app)


def _subscribe_msg(session_id: str, api_key: str = "") -> dict:
    return {
        "type": "subscribe",
        "protocol_version": PROTOCOL_VERSION,
        "api_key": api_key,
        "session_id": session_id,
    }


def test_handshake_succeeds_when_api_key_unset(monkeypatch) -> None:
    monkeypatch.delenv("AI_SERVICE_API_KEY", raising=False)
    with client.websocket_connect("/ws/sessions/sess-1/detections") as ws:
        ws.send_json(_subscribe_msg("sess-1"))
        msg = ws.receive_json()
        assert msg["type"] == "status"
        assert msg["kind"] == "connected"
        assert msg["session_id"] == "sess-1"


def test_handshake_rejects_wrong_api_key(monkeypatch) -> None:
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret-123")
    with client.websocket_connect("/ws/sessions/sess-1/detections") as ws:
        ws.send_json(_subscribe_msg("sess-1", api_key="wrong"))
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert msg["code"] == "auth_failed"


def test_handshake_rejects_session_id_mismatch(monkeypatch) -> None:
    monkeypatch.delenv("AI_SERVICE_API_KEY", raising=False)
    with client.websocket_connect("/ws/sessions/sess-A/detections") as ws:
        ws.send_json(_subscribe_msg("sess-B"))
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert msg["code"] == "invalid_payload"


def test_ping_pong(monkeypatch) -> None:
    monkeypatch.delenv("AI_SERVICE_API_KEY", raising=False)
    with client.websocket_connect("/ws/sessions/sess-1/detections") as ws:
        ws.send_json(_subscribe_msg("sess-1"))
        ws.receive_json()  # status:connected
        ws.send_json({"type": "ping", "timestamp": "2026-05-04T00:00:00Z"})
        pong = ws.receive_json()
        assert pong["type"] == "pong"


def test_unsubscribe_closes(monkeypatch) -> None:
    monkeypatch.delenv("AI_SERVICE_API_KEY", raising=False)
    with client.websocket_connect("/ws/sessions/sess-1/detections") as ws:
        ws.send_json(_subscribe_msg("sess-1"))
        ws.receive_json()  # status:connected
        ws.send_json({"type": "unsubscribe", "session_id": "sess-1"})
        msg = ws.receive_json()
        assert msg["type"] == "status"
        assert msg["kind"] == "stream_ended"
