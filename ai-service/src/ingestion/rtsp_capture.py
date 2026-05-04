"""Async RTSP capture orchestrator — BL-49 (PRD-013 §3.3, §6.4).

Runs an :class:`~src.ingestion.frame_reader.RTSPFrameReader` in a worker thread
and exposes an async iterator yielding frames at a target FPS:

    capture = RTSPCapture("rtsp://...", target_fps=5)
    await capture.start()
    async for frame in capture.frames():
        process(frame)

Behavior:
- Reconnects with exponential backoff on stream loss.
- Drains the OpenCV internal buffer so consumers see the latest frame.
- Down-samples to ``target_fps`` using a wall-clock timer.
- Drops frames when the consumer queue is full (live-stream priority).
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional

from src.ingestion.frame_reader import RTSPFrameReader

log = logging.getLogger(__name__)


@dataclass
class CapturedFrame:
    frame: Any                  # BGR numpy ndarray
    timestamp: float            # monotonic time of capture
    sequence: int               # monotonically-increasing per camera
    camera_id: str | None = None


@dataclass
class RTSPCapture:
    url: str
    target_fps: float = 5.0
    camera_id: str | None = None
    queue_size: int = 4
    initial_backoff_sec: float = 1.0
    max_backoff_sec: float = 30.0

    _queue: asyncio.Queue[CapturedFrame] = field(init=False)
    _thread: Optional[threading.Thread] = field(default=None, init=False)
    _stop_event: threading.Event = field(default_factory=threading.Event, init=False)
    _loop: Optional[asyncio.AbstractEventLoop] = field(default=None, init=False)
    _reader: Optional[RTSPFrameReader] = field(default=None, init=False)
    _seq: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        self._queue = asyncio.Queue(maxsize=max(1, self.queue_size))

    # ───────── public API ─────────

    async def start(self) -> None:
        if self._thread is not None:
            return
        self._loop = asyncio.get_running_loop()
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_blocking,
            name=f"rtsp-{self.camera_id or 'cam'}",
            daemon=True,
        )
        self._thread.start()

    async def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=5.0)
            self._thread = None
        if self._reader is not None:
            self._reader.release()
            self._reader = None

    async def frames(self) -> AsyncIterator[CapturedFrame]:
        """Yield captured frames until ``stop()`` is called."""
        while not self._stop_event.is_set() or not self._queue.empty():
            try:
                f = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            yield f

    # ───────── internals ─────────

    def _run_blocking(self) -> None:
        """Worker thread: connect → read → throttle → emit, with reconnect."""
        backoff = self.initial_backoff_sec
        while not self._stop_event.is_set():
            self._reader = RTSPFrameReader(self.url)
            if not self._reader.connect():
                self._sleep_with_stop(backoff)
                backoff = min(backoff * 2, self.max_backoff_sec)
                continue

            log.info("rtsp connected: %s", self.url)
            backoff = self.initial_backoff_sec  # reset on success
            self._read_loop(self._reader)

            # Stream ended or errored — release and try again
            self._reader.release()
            self._reader = None
            if self._stop_event.is_set():
                return
            log.warning("rtsp disconnected, reconnect in %.1fs: %s", backoff, self.url)
            self._sleep_with_stop(backoff)
            backoff = min(backoff * 2, self.max_backoff_sec)

    def _read_loop(self, reader: RTSPFrameReader) -> None:
        """Pull frames as fast as possible, emit at target_fps."""
        min_interval = 1.0 / max(0.1, self.target_fps)
        last_emit = 0.0

        while not self._stop_event.is_set():
            frame = reader.read_frame()
            if frame is None:
                # connection lost or EOF
                return

            now = time.monotonic()
            if (now - last_emit) < min_interval:
                continue  # drop — too soon since last emit

            last_emit = now
            self._seq += 1
            captured = CapturedFrame(
                frame=frame,
                timestamp=now,
                sequence=self._seq,
                camera_id=self.camera_id,
            )
            self._enqueue(captured)

    def _enqueue(self, captured: CapturedFrame) -> None:
        """Put on queue from worker thread; drop if full to keep live."""
        if self._loop is None:
            return
        try:
            # put_nowait via the asyncio loop's threadsafe call
            asyncio.run_coroutine_threadsafe(
                self._put_or_drop(captured), self._loop
            )
        except RuntimeError:
            log.debug("event loop closed — dropping frame seq=%d", captured.sequence)

    async def _put_or_drop(self, captured: CapturedFrame) -> None:
        if self._queue.full():
            try:
                _ = self._queue.get_nowait()  # drop oldest
            except asyncio.QueueEmpty:
                pass
        await self._queue.put(captured)

    def _sleep_with_stop(self, seconds: float) -> None:
        end = time.monotonic() + seconds
        while time.monotonic() < end and not self._stop_event.is_set():
            time.sleep(0.1)
