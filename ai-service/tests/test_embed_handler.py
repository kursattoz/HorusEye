"""embed_handler tests — BL-218."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

import src.api.embed_handler as eh
from src.identity.face_embedder import EMBEDDING_DIM
from src.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("AI_SERVICE_API_KEY", raising=False)
    yield TestClient(app)


def _fake_jpeg() -> bytes:
    """Minimal valid-ish JPEG bytes — opencv decodes any JPEG header to None
    in tests; we monkeypatch cv2 globally to bypass decode."""
    return b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00FAKE"


def test_endpoint_404_when_embedder_returns_none(client, monkeypatch) -> None:
    # cv2.imdecode returns a fake ndarray, embedder returns None
    fake_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    monkeypatch.setattr(eh.cv2, "imdecode", lambda *_a: fake_frame)

    class _Embedder:
        is_available = True
        def embed(self, _frame, person_bbox=None): return None

    monkeypatch.setattr(eh, "get_face_embedder", lambda: _Embedder())

    res = client.post(
        "/embed",
        files={"image": ("face.jpg", _fake_jpeg(), "image/jpeg")},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "no face detected"


def test_endpoint_returns_512_vector_on_happy_path(client, monkeypatch) -> None:
    fake_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    fake_emb = np.linspace(0.0, 1.0, EMBEDDING_DIM, dtype=np.float32)
    monkeypatch.setattr(eh.cv2, "imdecode", lambda *_a: fake_frame)

    class _Embedder:
        is_available = True
        captured: dict[str, Any] = {}
        def embed(self, frame, person_bbox=None):
            _Embedder.captured["bbox"] = person_bbox
            return fake_emb

    monkeypatch.setattr(eh, "get_face_embedder", lambda: _Embedder())

    res = client.post(
        "/embed",
        files={"image": ("face.jpg", _fake_jpeg(), "image/jpeg")},
        data={"bbox": "0.10,0.20,0.50,0.80"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["dim"] == EMBEDDING_DIM
    assert len(body["embedding"]) == EMBEDDING_DIM
    assert _Embedder.captured["bbox"] == (0.10, 0.20, 0.50, 0.80)


def test_endpoint_503_when_embedder_unavailable(client, monkeypatch) -> None:
    fake_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    monkeypatch.setattr(eh.cv2, "imdecode", lambda *_a: fake_frame)

    class _Embedder:
        is_available = False
        def embed(self, *_a, **_kw): return None

    monkeypatch.setattr(eh, "get_face_embedder", lambda: _Embedder())

    res = client.post(
        "/embed",
        files={"image": ("face.jpg", _fake_jpeg(), "image/jpeg")},
    )
    assert res.status_code == 503


def test_endpoint_401_when_api_key_required_but_missing(client, monkeypatch) -> None:
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret-key")
    res = client.post(
        "/embed",
        files={"image": ("face.jpg", _fake_jpeg(), "image/jpeg")},
    )
    assert res.status_code == 401


def test_endpoint_accepts_correct_api_key(client, monkeypatch) -> None:
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret-key")
    fake_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    fake_emb = np.zeros(EMBEDDING_DIM, dtype=np.float32)
    monkeypatch.setattr(eh.cv2, "imdecode", lambda *_a: fake_frame)

    class _Embedder:
        is_available = True
        def embed(self, *_a, **_kw): return fake_emb

    monkeypatch.setattr(eh, "get_face_embedder", lambda: _Embedder())

    res = client.post(
        "/embed",
        headers={"X-AI-Service-Key": "secret-key"},
        files={"image": ("face.jpg", _fake_jpeg(), "image/jpeg")},
    )
    assert res.status_code == 200


def test_endpoint_400_on_empty_body(client) -> None:
    res = client.post(
        "/embed",
        files={"image": ("face.jpg", b"", "image/jpeg")},
    )
    assert res.status_code == 400


def test_parse_bbox_helpers() -> None:
    assert eh._parse_bbox(None) is None
    assert eh._parse_bbox("") is None
    assert eh._parse_bbox("0.1,0.2,0.3,0.4") == (0.1, 0.2, 0.3, 0.4)
    assert eh._parse_bbox("0.1,0.2,0.3") is None
    assert eh._parse_bbox("a,b,c,d") is None
