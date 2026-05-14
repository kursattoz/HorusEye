"""WebSocket message protocol — PRD-013 §3.2.

Bi-directional protocol between the AI service and the Portal.

All messages are JSON objects with a required ``type`` discriminator.
Schema versioning is carried in ``protocol_version`` so the wire format
can evolve without breaking older clients.

Mirror of ``portal/types/ai.ts`` — keep the two files in lock-step.
"""

from __future__ import annotations

from typing import Any, Literal, Optional, TypedDict, Union

PROTOCOL_VERSION = "1.1"


# ───────────────────── client → server ─────────────────────

class ClientSubscribe(TypedDict):
    """Initial message after WS connect — authenticates and subscribes."""
    type: Literal["subscribe"]
    protocol_version: str
    api_key: str
    session_id: str
    # Optional client filters
    severity_min: Literal["low", "medium", "high", "critical"] | None
    incident_types: list[str] | None


class ClientPublish(TypedDict):
    """Initial message on /publish endpoint — phone authenticates as a frame source.

    After this handshake, the client sends ardışık binary JPEG frame'leri
    (header'sız ham buffer). PRD-019 §4.4.
    """
    type: Literal["publish"]
    protocol_version: str
    api_key: str
    session_id: str
    camera_id: str


class ClientAck(TypedDict):
    type: Literal["ack"]
    message_id: str


class ClientUnsubscribe(TypedDict):
    type: Literal["unsubscribe"]
    session_id: str


class ClientPing(TypedDict):
    type: Literal["ping"]
    timestamp: str  # ISO 8601


ClientMessage = Union[ClientSubscribe, ClientPublish, ClientAck, ClientUnsubscribe, ClientPing]


# ───────────────────── server → client ─────────────────────

ServerStatusKind = Literal[
    "connected",       # subscribe accepted
    "stream_started",  # AI pipeline started consuming frames
    "stream_paused",
    "stream_ended",
    "auth_failed",
    "session_unknown",
]


class ServerStatus(TypedDict):
    type: Literal["status"]
    protocol_version: str
    session_id: str
    kind: ServerStatusKind
    message: str
    timestamp: str  # ISO 8601


IncidentSeverity = Literal["low", "medium", "high", "critical"]
# Mirror of portal/types/index.ts IncidentType — must stay in lock-step.
IncidentType = Literal[
    # Phase A / Sprint 7-13
    "phone_detected", "earbuds_detected", "paper_detected",
    "gaze_diversion", "head_turn", "empty_seat",
    "whispering", "unauthorized_communication", "position_uncertainty",
    # Sprint 17 — pose / behavior / gaze refinements
    "body_lean_neighbor", "standing_up", "hand_under_desk",
    "hand_to_ear_mouth", "object_passing", "gaze_at_lap",
    "gaze_at_neighbor", "synchronized_behavior",
    # Sprint 18 — face covering
    "face_covering",
]


class ServerIncident(TypedDict):
    """A scored, persisted incident — mirrors public.incidents row shape."""
    type: Literal["incident"]
    protocol_version: str
    message_id: str
    session_id: str
    incident_id: str  # row id in public.incidents
    student_id: str | None
    track_id: int | None
    incident_type: IncidentType
    severity: IncidentSeverity
    confidence: float          # 0.0–1.0
    risk_score: float | None
    triggered_rules: list[str]
    camera_ids: list[str]
    evidence_paths: list[str]
    occurred_at: str           # ISO 8601


class ServerDetection(TypedDict):
    """Low-level detection event before scoring — informational only."""
    type: Literal["detection"]
    protocol_version: str
    session_id: str
    track_id: int | None
    detection_class: str       # 'person' | 'cell phone' | 'laptop' | …
    confidence: float
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2 (normalized 0–1)
    camera_id: str
    timestamp: str


class ServerFrame(TypedDict):
    """Annotated JPEG frame for live preview channel."""
    type: Literal["frame"]
    protocol_version: str
    session_id: str
    camera_id: str
    width: int
    height: int
    jpeg_base64: str           # encoded JPEG bytes
    timestamp: str
    detections: list[ServerDetection]


class ServerError(TypedDict):
    type: Literal["error"]
    protocol_version: str
    code: str                  # 'invalid_payload' | 'auth_failed' | 'internal' | …
    message: str
    session_id: str | None


class ServerPong(TypedDict):
    type: Literal["pong"]
    timestamp: str


ServerMessage = Union[
    ServerStatus,
    ServerIncident,
    ServerDetection,
    ServerFrame,
    ServerError,
    ServerPong,
]


# ───────────────────── helpers ─────────────────────

def status_message(
    session_id: str,
    kind: ServerStatusKind,
    message: str,
    timestamp: str,
) -> ServerStatus:
    return {
        "type": "status",
        "protocol_version": PROTOCOL_VERSION,
        "session_id": session_id,
        "kind": kind,
        "message": message,
        "timestamp": timestamp,
    }


def error_message(
    code: str,
    message: str,
    session_id: Optional[str] = None,
) -> ServerError:
    return {
        "type": "error",
        "protocol_version": PROTOCOL_VERSION,
        "code": code,
        "message": message,
        "session_id": session_id,
    }


def is_valid_subscribe(payload: Any) -> bool:
    return (
        isinstance(payload, dict)
        and payload.get("type") == "subscribe"
        and isinstance(payload.get("api_key"), str)
        and isinstance(payload.get("session_id"), str)
    )


def is_valid_publish(payload: Any) -> bool:
    return (
        isinstance(payload, dict)
        and payload.get("type") == "publish"
        and isinstance(payload.get("api_key"), str)
        and isinstance(payload.get("session_id"), str)
        and isinstance(payload.get("camera_id"), str)
    )


def incident_message(row: dict[str, Any], session_id: str) -> ServerIncident:
    """Render a persisted ``incidents`` row as a ``ServerIncident`` envelope.

    BL-187 — emitted by the publish handler immediately after
    :func:`src.persistence.incident_writer.write_incident` returns a row.
    The same id rides in ``message_id`` and ``incident_id`` so the
    Portal can de-duplicate live-monitor cards using either field.
    """
    return {
        "type": "incident",
        "protocol_version": PROTOCOL_VERSION,
        "message_id": str(row["id"]),
        "session_id": session_id,
        "incident_id": str(row["id"]),
        "student_id": row.get("student_id"),
        "track_id": row.get("track_id"),
        "incident_type": row["incident_type"],
        "severity": row["severity"],
        "confidence": float(row["confidence"]),
        "risk_score": row.get("risk_score"),
        "triggered_rules": list(row.get("triggered_rules") or []),
        "camera_ids": list(row.get("camera_ids") or []),
        "evidence_paths": list(row.get("evidence_paths") or []),
        "occurred_at": row["occurred_at"],
    }
