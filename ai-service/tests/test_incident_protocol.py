"""ServerIncident protocol shape tests — BL-187."""

from __future__ import annotations

from src.api.protocol import PROTOCOL_VERSION, incident_message


def test_incident_message_has_all_required_fields() -> None:
    row = {
        "id": "abc-123",
        "session_id": "sess-1",
        "student_id": None,
        "track_id": 7,
        "incident_type": "phone_detected",
        "severity": "high",
        "confidence": 0.78,
        "risk_score": None,
        "triggered_rules": ["phone_in_hand:sustained≥3.0s"],
        "camera_ids": ["cam-1"],
        "evidence_paths": ["sess-1/abc-123.jpg"],
        "occurred_at": "2025-01-01T00:00:00+00:00",
    }
    msg = incident_message(row, session_id="sess-1")

    assert msg["type"] == "incident"
    assert msg["protocol_version"] == PROTOCOL_VERSION
    assert msg["message_id"] == "abc-123"
    assert msg["incident_id"] == "abc-123"
    assert msg["session_id"] == "sess-1"
    assert msg["student_id"] is None
    assert msg["track_id"] == 7
    assert msg["incident_type"] == "phone_detected"
    assert msg["severity"] == "high"
    assert msg["confidence"] == 0.78
    assert msg["triggered_rules"] == ["phone_in_hand:sustained≥3.0s"]
    assert msg["camera_ids"] == ["cam-1"]
    assert msg["evidence_paths"] == ["sess-1/abc-123.jpg"]
    assert msg["occurred_at"] == "2025-01-01T00:00:00+00:00"


def test_incident_message_normalizes_missing_optional_fields() -> None:
    row = {
        "id": "x",
        "incident_type": "empty_seat",
        "severity": "medium",
        "confidence": 0.95,
        "occurred_at": "2026-01-01T00:00:00Z",
        "triggered_rules": None,   # supabase sometimes returns null
        "camera_ids": None,
        "evidence_paths": None,
    }
    msg = incident_message(row, session_id="s")
    assert msg["triggered_rules"] == []
    assert msg["camera_ids"] == []
    assert msg["evidence_paths"] == []
    assert msg["student_id"] is None
    assert msg["track_id"] is None
    assert msg["risk_score"] is None
