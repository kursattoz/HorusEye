"""Incident writer — BL-186 (PRD-013 §7.1, §21.0).

Turns an :class:`~src.scoring.rules.IncidentCandidate` into:

1. A ``.jpg`` upload to the ``incident-evidence`` Supabase Storage bucket
   under ``{session_id}/{incident_id}.jpg``.
2. An ``incidents`` row with ``evidence_paths=[that path]`` and the
   candidate's confidence, severity, raw_signals, etc.

Both steps are best-effort: a Storage failure leaves ``evidence_paths``
empty but still writes the row; an insert failure logs and returns
``None`` so the publish pipeline keeps streaming. The publish handler
(BL-187) inspects the return value to decide whether to broadcast a
ServerIncident.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from src.persistence.supabase_client import get_supabase_admin
from src.scoring.calibration import apply_severity_bump, severity_to_risk_score
from src.scoring.rules import IncidentCandidate

log = logging.getLogger(__name__)

EVIDENCE_BUCKET = "incident-evidence"


def _lookup_student_calibration(
    client: Any, student_code: str | None,
) -> dict[str, Any] | None:
    """Fetch the per-student calibration row (BL-232) keyed by school
    student_id text. Returns None if no override exists or on error.
    Pre-match (``track:N``) IDs are skipped.
    """
    if not student_code or student_code.startswith("track:"):
        return None
    try:
        # student_calibration is keyed by students.id (uuid); we need to
        # resolve from the school student_id text first.
        student_row = (
            client.table("students")
            .select("id")
            .eq("student_id", student_code)
            .limit(1)
            .execute()
        )
        student_uuid = (getattr(student_row, "data", None) or [{}])[0].get("id")
        if not student_uuid:
            return None
        result = (
            client.table("student_calibration")
            .select("severity_bump, min_confidence")
            .eq("student_id", student_uuid)
            .limit(1)
            .execute()
        )
        row = (getattr(result, "data", None) or [None])[0]
        return row
    except Exception as e:  # noqa: BLE001 — calibration must not crash the pipeline
        log.debug("student calibration lookup failed for %s: %s", student_code, e)
        return None


def _evidence_path(session_id: str, incident_id: str) -> str:
    return f"{session_id}/{incident_id}.jpg"


def _occurred_at_iso(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).isoformat()


def _upload_evidence(
    client: Any,
    session_id: str,
    incident_id: str,
    frame_jpeg: bytes,
) -> str | None:
    path = _evidence_path(session_id, incident_id)
    try:
        client.storage.from_(EVIDENCE_BUCKET).upload(
            path,
            frame_jpeg,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )
        return path
    except Exception as e:  # noqa: BLE001 — Storage failures must not crash the pipeline
        log.warning("evidence upload failed for incident %s: %s", incident_id, e)
        return None


def _build_row(
    *,
    incident_id: str,
    candidate: IncidentCandidate,
    session_id: str,
    camera_id: str,
    evidence_path: str | None,
    severity_override: str | None = None,
    raw_signal_extras: dict[str, Any] | None = None,
) -> dict[str, Any]:
    severity = severity_override or candidate.severity
    raw_signals = dict(candidate.raw_signals or {})
    if raw_signal_extras:
        raw_signals.update(raw_signal_extras)
    return {
        "id": incident_id,
        "session_id": session_id,
        # student_id is populated by the Sprint 10 BL-220 matcher via
        # candidate.student_id; pre-match incidents stay NULL.
        "student_id": candidate.student_id,
        "track_id": candidate.track_id,
        "incident_type": candidate.incident_type,
        "severity": severity,
        "confidence": candidate.confidence,
        # BL-207 — risk_score is derived from severity via the calibration
        # table so every consumer agrees on the LOW/MEDIUM/HIGH/CRITICAL
        # numerical equivalence.
        "risk_score": severity_to_risk_score(severity),
        "triggered_rules": list(candidate.triggered_rules),
        "camera_ids": [camera_id],
        "evidence_paths": [evidence_path] if evidence_path else [],
        "raw_signals": raw_signals,
        "occurred_at": _occurred_at_iso(candidate.occurred_at),
    }


def write_incident(
    candidate: IncidentCandidate,
    *,
    session_id: str,
    camera_id: str,
    frame_jpeg: bytes | None,
) -> dict[str, Any] | None:
    """Persist a candidate. Returns the inserted row or ``None`` on failure.

    The caller — typically ``publish_handler`` — uses the return value to
    decide whether to broadcast a ServerIncident over the WS fan-out
    (BL-187). When ``None`` is returned the candidate is dropped silently
    apart from a warning log.
    """
    try:
        client = get_supabase_admin()
    except RuntimeError as e:
        log.warning("Supabase unavailable, skipping incident write: %s", e)
        return None

    incident_id = str(uuid.uuid4())

    # BL-232 — per-student calibration override. Look up before any I/O
    # since drop-on-low-confidence shortcircuits Storage + DB writes.
    calibration = _lookup_student_calibration(client, candidate.student_id)
    severity_override: str | None = None
    raw_signal_extras: dict[str, Any] | None = None
    if calibration:
        min_conf = calibration.get("min_confidence")
        if min_conf is not None and candidate.confidence < float(min_conf):
            log.info(
                "incident dropped by student calibration min_confidence: "
                "student=%s confidence=%.2f<%.2f",
                candidate.student_id, candidate.confidence, float(min_conf),
            )
            return None
        bump = int(calibration.get("severity_bump") or 0)
        if bump != 0:
            severity_override = apply_severity_bump(candidate.severity, bump)
            raw_signal_extras = {
                "calibration": {
                    "student_id": candidate.student_id,
                    "severity_bump": bump,
                    "original_severity": candidate.severity,
                    "min_confidence": float(min_conf) if min_conf is not None else None,
                },
            }

    evidence_path = (
        _upload_evidence(client, session_id, incident_id, frame_jpeg)
        if frame_jpeg
        else None
    )

    row = _build_row(
        incident_id=incident_id,
        candidate=candidate,
        session_id=session_id,
        camera_id=camera_id,
        evidence_path=evidence_path,
        severity_override=severity_override,
        raw_signal_extras=raw_signal_extras,
    )

    try:
        result = client.table("incidents").insert(row).execute()
    except Exception as e:  # noqa: BLE001 — DB errors must not crash the pipeline
        log.error(
            "incident insert failed (session=%s track=%s): %s",
            session_id, candidate.track_id, e,
        )
        return None

    inserted = (getattr(result, "data", None) or [None])[0]
    return inserted or row
