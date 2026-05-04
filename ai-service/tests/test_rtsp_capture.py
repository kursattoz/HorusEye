"""RTSP capture tests — BL-49 (PRD-013 §3.3).

Use a file-backed VideoCapture (cv2 supports any URL OpenCV can decode) to
exercise the orchestrator end-to-end without a live RTSP server.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from src.ingestion import frame_reader as frame_reader_module
from src.ingestion.rtsp_capture import RTSPCapture


class _FakeCap:
    """Minimal stand-in for cv2.VideoCapture that yields N frames then EOF."""

    def __init__(self, frames: int) -> None:
        self._remaining = frames
        self._opened = True

    def isOpened(self) -> bool:  # noqa: N802 — match cv2 API
        return self._opened

    def read(self) -> tuple[bool, Any]:
        if self._remaining <= 0:
            return False, None
        self._remaining -= 1
        return True, [[0, 0, 0]]  # tiny "frame"

    def release(self) -> None:
        self._opened = False

    def set(self, *_: Any, **__: Any) -> bool:
        return True


class _FakeCv2:
    CAP_FFMPEG = 0
    CAP_PROP_BUFFERSIZE = 38

    def __init__(self, factory):
        self._factory = factory

    def VideoCapture(self, *_args, **_kwargs):  # noqa: N802
        return self._factory()


@pytest.mark.asyncio
async def test_capture_emits_throttled_frames(monkeypatch) -> None:
    monkeypatch.setattr(frame_reader_module, "cv2", _FakeCv2(lambda: _FakeCap(50)))

    cap = RTSPCapture(url="fake://stream", target_fps=20.0, queue_size=8, camera_id="cam1")
    await cap.start()

    received = []
    async def consumer():
        async for f in cap.frames():
            received.append(f)
            if len(received) >= 3:
                break

    try:
        await asyncio.wait_for(consumer(), timeout=3.0)
    finally:
        await cap.stop()

    assert len(received) >= 3
    assert all(f.camera_id == "cam1" for f in received)
    # Sequence numbers are strictly increasing
    seqs = [f.sequence for f in received]
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == len(seqs)


@pytest.mark.asyncio
async def test_capture_reconnects_after_eof(monkeypatch) -> None:
    # First connect: 5 frames then EOF. Second connect: another 5 frames.
    counter = {"n": 0}

    def factory():
        counter["n"] += 1
        return _FakeCap(5)

    monkeypatch.setattr(frame_reader_module, "cv2", _FakeCv2(factory))

    cap = RTSPCapture(
        url="fake://stream",
        target_fps=50.0,
        queue_size=16,
        initial_backoff_sec=0.1,
        max_backoff_sec=0.2,
    )
    await cap.start()

    received = []
    async def consumer():
        async for f in cap.frames():
            received.append(f)
            if len(received) >= 6:
                break

    try:
        await asyncio.wait_for(consumer(), timeout=3.0)
    finally:
        await cap.stop()

    # Reconnected at least once → factory called more than once
    assert counter["n"] >= 2
    assert len(received) >= 6
