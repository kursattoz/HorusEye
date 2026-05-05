"""finetune_yolo registry helper tests — BL-211.

The full training loop is too heavy to drive in unit tests (it needs
weights + a CUDA/CPU GPU + a labelled dataset). This spec covers the
two new helpers — ``upload_weights`` and ``register_ai_model`` — plus
the argparse validation gate.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.finetune_yolo import main as finetune_main, register_ai_model, upload_weights
from src.persistence import supabase_client


# ───────── stubs ─────────

class _StubBucket:
    def __init__(self) -> None:
        self.uploads: list[tuple[str, bytes, dict]] = []
        self.fail = False

    def upload(self, path, data, file_options):
        if self.fail:
            raise RuntimeError("storage down")
        self.uploads.append((path, data, file_options))
        return {"Key": path}


class _StubStorage:
    def __init__(self) -> None:
        self.bucket = _StubBucket()

    def from_(self, name: str) -> _StubBucket:
        return self.bucket


class _Upsert:
    def __init__(self, table, payload, on_conflict):
        self._table = table
        self._payload = payload
        self._on_conflict = on_conflict

    def execute(self):
        self._table.upserted.append((self._on_conflict, dict(self._payload)))
        return type("R", (), {"data": [{**self._payload, "id": "row-1"}]})()


class _Table:
    def __init__(self) -> None:
        self.upserted: list[tuple[str, dict]] = []

    def upsert(self, payload, on_conflict):
        return _Upsert(self, payload, on_conflict)


class _Client:
    def __init__(self) -> None:
        self.storage = _StubStorage()
        self.ai_models = _Table()

    def table(self, name: str):
        assert name == "ai_models"
        return self.ai_models


@pytest.fixture
def stub_client():
    client = _Client()
    supabase_client.set_client_for_tests(client)
    yield client
    supabase_client.reset_for_tests()


# ───────── helper tests ─────────

def test_upload_weights_calls_storage(tmp_path: Path, stub_client) -> None:
    weights = tmp_path / "best.pt"
    weights.write_bytes(b"FAKEYOLOWEIGHTS")
    uri = upload_weights(weights, "ai-model-weights", "yolo-h/v0.2/best.pt")
    assert uri == "storage://ai-model-weights/yolo-h/v0.2/best.pt"
    assert stub_client.storage.bucket.uploads == [
        ("yolo-h/v0.2/best.pt", b"FAKEYOLOWEIGHTS",
         {"content-type": "application/octet-stream", "upsert": "true"}),
    ]


def test_register_ai_model_inserts_inactive_by_default(stub_client) -> None:
    row = register_ai_model(
        name="yolov8n-h",
        version="v0.2.0",
        weights_path="storage://ai-model-weights/yolov8n-h/v0.2.0/best.pt",
        benchmark_results={"mAP50": 0.85, "mAP50-95": 0.6},
    )
    assert row["active"] is False
    assert "deployed_at" not in row
    assert stub_client.ai_models.upserted[0][0] == "name,version"
    assert stub_client.ai_models.upserted[0][1]["active"] is False


def test_register_ai_model_activate_sets_deployed_at(stub_client) -> None:
    row = register_ai_model(
        name="yolov8n-h",
        version="v0.2.0",
        weights_path="storage://x/y",
        benchmark_results={},
        activate=True,
    )
    assert row["active"] is True
    assert row["deployed_at"]
    assert row["trained_on"] == row["deployed_at"]


# ───────── CLI argparse gate ─────────

def test_main_rejects_register_without_model_identity(tmp_path) -> None:
    """--register requires --model-name AND --model-version."""
    data_yaml = tmp_path / "data.yaml"
    data_yaml.write_text("path: x\n")
    with pytest.raises(SystemExit) as excinfo:
        finetune_main([
            "--data", str(data_yaml),
            "--register",
        ])
    # argparse.error() uses exit code 2
    assert excinfo.value.code == 2


def test_main_rejects_missing_data_file(tmp_path) -> None:
    with pytest.raises(SystemExit) as excinfo:
        finetune_main([
            "--data", str(tmp_path / "does-not-exist.yaml"),
        ])
    assert excinfo.value.code == 2
