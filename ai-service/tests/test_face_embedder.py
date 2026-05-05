"""FaceEmbedder tests — BL-217.

Mocks the insightface FaceAnalysis pipeline so tests don't need the
~280MB ONNX weights or onnxruntime native deps.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

import src.identity.face_embedder as fe_mod
from src.identity.face_embedder import (
    EMBEDDING_DIM,
    FaceEmbedder,
    _reset_for_tests,
    get_face_embedder,
)


# ───────── stubs ─────────

class _StubFace:
    def __init__(self, det_score: float, embedding):
        self.det_score = det_score
        self.normed_embedding = np.asarray(embedding, dtype=np.float32)


class _StubApp:
    def __init__(self, faces):
        self.faces = faces
        self.prepare_called_with: dict[str, Any] = {}
        self.get_calls: list[Any] = []

    def prepare(self, **kwargs):
        self.prepare_called_with = kwargs

    def get(self, image):
        self.get_calls.append(image)
        return list(self.faces)


def _patch_app(monkeypatch, faces) -> _StubApp:
    """Inject a stub FaceAnalysis class into the module."""
    app = _StubApp(faces)

    class _StubFaceAnalysisCls:
        def __init__(self, **kwargs):
            self._kwargs = kwargs

        def prepare(self, **kwargs):
            app.prepare(**kwargs)

        def get(self, image):
            return app.get(image)

    monkeypatch.setattr(fe_mod, "_FACE_ANALYSIS_CLS", _StubFaceAnalysisCls)
    return app


# ───────── tests ─────────

@pytest.fixture(autouse=True)
def _reset_singleton():
    _reset_for_tests()
    yield
    _reset_for_tests()


def test_embed_returns_none_when_insightface_disabled(monkeypatch) -> None:
    monkeypatch.setattr(fe_mod, "_FACE_ANALYSIS_CLS", None)
    embedder = FaceEmbedder()
    fake = type("F", (), {"shape": (480, 640, 3)})()
    assert embedder.embed(fake) is None
    assert embedder.is_available is False


def test_embed_returns_512_vector_on_happy_path(monkeypatch) -> None:
    fake_emb = np.random.rand(EMBEDDING_DIM).astype(np.float32)
    _patch_app(monkeypatch, faces=[_StubFace(det_score=0.99, embedding=fake_emb)])

    embedder = FaceEmbedder()

    # Build a numpy-like 800x600 frame (slicing returns a smaller ndarray)
    frame = np.zeros((800, 600, 3), dtype=np.uint8)
    out = embedder.embed(frame, person_bbox=(0.10, 0.10, 0.40, 0.50))
    assert out is not None
    assert out.shape == (EMBEDDING_DIM,)
    assert np.allclose(out, fake_emb)


def test_embed_picks_highest_det_score_face(monkeypatch) -> None:
    low  = _StubFace(det_score=0.40, embedding=np.zeros(EMBEDDING_DIM, dtype=np.float32))
    high = _StubFace(det_score=0.95, embedding=np.ones(EMBEDDING_DIM, dtype=np.float32))
    _patch_app(monkeypatch, faces=[low, high])

    embedder = FaceEmbedder()
    frame = np.zeros((800, 600, 3), dtype=np.uint8)
    out = embedder.embed(frame, person_bbox=(0.10, 0.10, 0.50, 0.60))
    assert out is not None
    assert out[0] == 1.0  # high score's embedding


def test_embed_returns_none_when_no_faces_detected(monkeypatch) -> None:
    _patch_app(monkeypatch, faces=[])
    embedder = FaceEmbedder()
    frame = np.zeros((800, 600, 3), dtype=np.uint8)
    assert embedder.embed(frame, person_bbox=(0.1, 0.1, 0.5, 0.5)) is None


def test_embed_skips_tiny_bbox(monkeypatch) -> None:
    app = _patch_app(monkeypatch, faces=[
        _StubFace(det_score=0.99, embedding=np.zeros(EMBEDDING_DIM, dtype=np.float32)),
    ])
    embedder = FaceEmbedder()
    frame = np.zeros((800, 600, 3), dtype=np.uint8)
    # 1px-wide bbox → below 64px minimum → bail before calling .get()
    out = embedder.embed(frame, person_bbox=(0.50, 0.50, 0.501, 0.502))
    assert out is None
    assert app.get_calls == []


def test_embed_runs_full_frame_when_no_bbox_provided(monkeypatch) -> None:
    fake_emb = np.zeros(EMBEDDING_DIM, dtype=np.float32)
    app = _patch_app(monkeypatch, faces=[_StubFace(det_score=0.9, embedding=fake_emb)])
    embedder = FaceEmbedder()
    frame = np.zeros((800, 600, 3), dtype=np.uint8)
    embedder.embed(frame, person_bbox=None)
    # Whole frame went into .get()
    assert app.get_calls
    sent = app.get_calls[0]
    assert sent.shape == (800, 600, 3)


def test_embed_warns_on_unexpected_dim(monkeypatch) -> None:
    bad = _StubFace(det_score=0.9, embedding=np.zeros(128, dtype=np.float32))
    _patch_app(monkeypatch, faces=[bad])
    embedder = FaceEmbedder()
    frame = np.zeros((800, 600, 3), dtype=np.uint8)
    assert embedder.embed(frame, person_bbox=(0.1, 0.1, 0.5, 0.5)) is None


def test_get_face_embedder_returns_singleton() -> None:
    a = get_face_embedder()
    b = get_face_embedder()
    assert a is b


def test_load_idempotent_when_already_loaded(monkeypatch) -> None:
    fake_emb = np.zeros(EMBEDDING_DIM, dtype=np.float32)
    app = _patch_app(monkeypatch, faces=[_StubFace(det_score=0.9, embedding=fake_emb)])
    embedder = FaceEmbedder()
    embedder.load()
    embedder.load()  # 2nd call no-op
    assert embedder.is_available is True
