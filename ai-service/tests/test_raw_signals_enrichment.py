"""raw_signals enrichment end-to-end test — BL-199.

The gaze_diversion + head_turn rules populate richer raw_signals than
phone_in_hand (yaw trace, sustained_seconds, fires_in_5min, …). This
spec asserts the dict round-trips through write_incident → row +
through incident_message envelope.
"""

from __future__ import annotations

from typing import Any

import pytest

from src.api.protocol import incident_message
from src.detection.face_mesh import FaceMeshSignal
from src.persistence import incident_writer, supabase_client
from src.scoring.rules.gaze_diversion import (
    GazeDiversionConfig,
    evaluate as gaze_eval,
    update_signal as gaze_update_signal,
)
from src.scoring.rules.head_turn import HeadTurnConfig, evaluate as head_eval
from src.scoring.track_state import TrackState

PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)


# ───────── stub Supabase ─────────

class _StubInsert:
    def __init__(self, sink: list[dict], row: dict) -> None:
        self._sink = sink
        self._row = row

    def execute(self) -> Any:
        self._sink.append(dict(self._row))
        return type("R", (), {"data": [self._row]})()


class _StubTable:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def insert(self, row: dict) -> _StubInsert:
        return _StubInsert(self.rows, row)


class _StubBucket:
    def upload(self, *_a, **_k) -> Any:
        return {}


class _StubStorage:
    def from_(self, _name: str) -> _StubBucket:
        return _StubBucket()


class _StubClient:
    def __init__(self) -> None:
        self.incidents = _StubTable()
        self.storage = _StubStorage()

    def table(self, _name: str) -> _StubTable:
        return self.incidents


@pytest.fixture
def stub_client():
    client = _StubClient()
    supabase_client.set_client_for_tests(client)
    yield client
    supabase_client.reset_for_tests()


# ───────── helpers ─────────

def _drive_three_glances(state: TrackState, cfg: GazeDiversionConfig) -> Any:
    last = None
    for base in (0.0, 40.0, 80.0):
        for offset in (0.0, 1.0, 2.0, 3.0):
            ts = base + offset
            sig = FaceMeshSignal(yaw_deg=35.0, pitch_deg=2.0, roll_deg=1.0, eye_closed=False, confidence=0.9)
            gaze_update_signal(state, ts, sig)
            last = gaze_eval(state, ts, PERSON_BBOX, sig, cfg) or last
        for ts in range(int(base + 4), int(base + 40), 2):
            sig = FaceMeshSignal(yaw_deg=5.0, pitch_deg=2.0, roll_deg=1.0, eye_closed=False, confidence=0.9)
            gaze_update_signal(state, float(ts), sig)
            last = gaze_eval(state, float(ts), PERSON_BBOX, sig, cfg) or last
    return last


# ───────── tests ─────────

def test_gaze_raw_signals_persist_and_broadcast(stub_client) -> None:
    state = TrackState(track_id=7)
    cand = _drive_three_glances(state, GazeDiversionConfig())
    assert cand is not None

    row = incident_writer.write_incident(
        cand, session_id="s1", camera_id="c1", frame_jpeg=b"fake",
    )
    assert row is not None
    raw = row["raw_signals"]
    # Sprint 8 enrichment fields all present
    assert raw["rule"] == "gaze_diversion"
    assert raw["fires_in_5min"] == 3
    assert raw["yaw_threshold"] == 30.0
    assert isinstance(raw["yaw_trace"], list)
    assert raw["yaw_deg_now"] == 35.0
    assert raw["pitch_deg_now"] == 2.0
    # The persisted row matches what the WS broadcast envelope sees
    msg = incident_message(row, session_id="s1")
    assert msg["incident_type"] == "gaze_diversion"
    assert msg["severity"] == "medium"


def test_head_turn_combo_raw_signals_round_trip(stub_client) -> None:
    state = TrackState(track_id=11)
    # plant a gaze fire so the head_turn evaluator promotes to HIGH
    state.mark_fired("gaze_diversion", now=-30.0)

    cfg = HeadTurnConfig()
    last = None
    for base in (0.0, 40.0, 80.0):
        for offset in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5):
            ts = base + offset
            sig = FaceMeshSignal(yaw_deg=50.0, pitch_deg=0.0, roll_deg=0.0, eye_closed=False, confidence=0.9)
            gaze_update_signal(state, ts, sig)
            last = head_eval(state, ts, PERSON_BBOX, sig, cfg) or last
        for ts in range(int(base + 3), int(base + 35), 2):
            sig = FaceMeshSignal(yaw_deg=5.0, pitch_deg=0.0, roll_deg=0.0, eye_closed=False, confidence=0.9)
            gaze_update_signal(state, float(ts), sig)
            last = head_eval(state, float(ts), PERSON_BBOX, sig, cfg) or last

    assert last is not None
    assert last.severity == "high"

    row = incident_writer.write_incident(
        last, session_id="s1", camera_id="c1", frame_jpeg=None,
    )
    assert row is not None
    raw = row["raw_signals"]
    assert raw["rule"] == "head_turn"
    assert raw["is_combo"] is True
    assert raw["head_fires_5min"] == 3
    assert raw["gaze_fires_5min"] >= 1
    assert raw["yaw_threshold"] == 45.0
