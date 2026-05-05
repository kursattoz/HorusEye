"""IncidentWriter tests — BL-186 (PRD-013 §7.1, §21.0).

We mock the Supabase client so tests don't depend on a live project.
"""

from __future__ import annotations

from typing import Any

import pytest

from src.persistence import incident_writer, supabase_client
from src.scoring.rules import IncidentCandidate


# ───────── stub Supabase client ─────────

class _StubResult:
    def __init__(self, data: list[dict] | None = None) -> None:
        self.data = data or []


class _StubInsert:
    def __init__(self, table: "_StubTable", row: dict) -> None:
        self._table = table
        self._row = row

    def execute(self) -> _StubResult:
        if self._table.fail_insert:
            raise RuntimeError("DB down")
        # Echo back the row + fake created_at, like Supabase does
        echoed = dict(self._row)
        self._table.inserted_rows.append(echoed)
        return _StubResult(data=[echoed])


class _StubTable:
    def __init__(self) -> None:
        self.inserted_rows: list[dict] = []
        self.fail_insert: bool = False

    def insert(self, row: dict) -> _StubInsert:
        return _StubInsert(self, row)


class _StubBucket:
    def __init__(self) -> None:
        self.uploads: list[tuple[str, bytes, dict]] = []
        self.fail_upload: bool = False

    def upload(self, path: str, data: bytes, file_options: dict) -> Any:
        if self.fail_upload:
            raise RuntimeError("Storage down")
        self.uploads.append((path, data, file_options))
        return {"Key": path}


class _StubStorage:
    def __init__(self) -> None:
        self.bucket = _StubBucket()

    def from_(self, name: str) -> _StubBucket:  # noqa: D401 — mirrors supabase-py
        assert name == incident_writer.EVIDENCE_BUCKET
        return self.bucket


class _StubClient:
    def __init__(self) -> None:
        self.incidents = _StubTable()
        self.storage = _StubStorage()

    def table(self, name: str) -> _StubTable:
        assert name == "incidents"
        return self.incidents


@pytest.fixture
def stub_client():
    client = _StubClient()
    supabase_client.set_client_for_tests(client)
    yield client
    supabase_client.reset_for_tests()


# ───────── helpers ─────────

def _candidate(**overrides: Any) -> IncidentCandidate:
    base = dict(
        incident_type="phone_detected",
        severity="high",
        confidence=0.78,
        track_id=7,
        triggered_rules=("phone_in_hand:sustained≥3.0s",),
        bbox=(0.40, 0.40, 0.50, 0.50),
        person_bbox=(0.20, 0.20, 0.80, 0.95),
        raw_signals={"rule": "phone_in_hand", "phone_confidence": 0.78},
        occurred_at=1735689600.0,  # 2025-01-01T00:00:00Z
    )
    base.update(overrides)
    return IncidentCandidate(**base)


# ───────── tests ─────────

def test_write_incident_uploads_evidence_and_inserts_row(stub_client) -> None:
    cand = _candidate()
    row = incident_writer.write_incident(
        cand,
        session_id="sess-1",
        camera_id="cam-1",
        frame_jpeg=b"\xff\xd8\xff\xe0FAKEJPEG",
    )

    assert row is not None
    # Evidence uploaded under the expected path
    assert len(stub_client.storage.bucket.uploads) == 1
    path, data, opts = stub_client.storage.bucket.uploads[0]
    assert path.startswith("sess-1/")
    assert path.endswith(".jpg")
    assert data == b"\xff\xd8\xff\xe0FAKEJPEG"
    assert opts["content-type"] == "image/jpeg"

    # Row contains the right fields
    assert row["session_id"] == "sess-1"
    assert row["camera_ids"] == ["cam-1"]
    assert row["evidence_paths"] == [path]
    assert row["incident_type"] == "phone_detected"
    assert row["severity"] == "high"
    assert row["confidence"] == 0.78
    assert row["track_id"] == 7
    assert row["student_id"] is None
    assert row["raw_signals"]["rule"] == "phone_in_hand"
    assert row["occurred_at"].startswith("2025-01-01T00:00:00")
    # BL-207 — risk_score derived from severity
    assert row["risk_score"] == 0.75


def test_write_incident_with_no_jpeg_skips_evidence(stub_client) -> None:
    row = incident_writer.write_incident(
        _candidate(),
        session_id="sess-1",
        camera_id="cam-1",
        frame_jpeg=None,
    )
    assert row is not None
    assert row["evidence_paths"] == []
    assert stub_client.storage.bucket.uploads == []


def test_storage_failure_still_writes_row(stub_client) -> None:
    stub_client.storage.bucket.fail_upload = True
    row = incident_writer.write_incident(
        _candidate(),
        session_id="sess-1",
        camera_id="cam-1",
        frame_jpeg=b"FAKE",
    )
    assert row is not None
    assert row["evidence_paths"] == []
    # Insert was still called
    assert len(stub_client.incidents.inserted_rows) == 1


def test_insert_failure_returns_none(stub_client) -> None:
    stub_client.incidents.fail_insert = True
    row = incident_writer.write_incident(
        _candidate(),
        session_id="sess-1",
        camera_id="cam-1",
        frame_jpeg=b"FAKE",
    )
    assert row is None


def test_missing_env_returns_none(monkeypatch) -> None:
    supabase_client.reset_for_tests()
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    row = incident_writer.write_incident(
        _candidate(),
        session_id="sess-1",
        camera_id="cam-1",
        frame_jpeg=b"FAKE",
    )
    assert row is None


def test_triggered_rules_serialized_as_list(stub_client) -> None:
    cand = _candidate(triggered_rules=("a", "b", "c"))
    row = incident_writer.write_incident(
        cand,
        session_id="sess-1",
        camera_id="cam-1",
        frame_jpeg=None,
    )
    assert row is not None
    assert row["triggered_rules"] == ["a", "b", "c"]
