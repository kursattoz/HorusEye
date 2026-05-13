"""Detection worker pool — PRD-021 §3 Sprint 18 (BL-319), Sprint 13 deferred.

Drops a small bounded asyncio queue between the ingest loop and the
heavy detection / face-mesh / pose path. With ``num_workers > 1`` two
or more frames can be in flight concurrently, smoothing out the ~80ms
spike when MediaPipe Pose runs on a 4-track frame.

Design:
  - One asyncio.Queue per session (not global) so a slow session does
    not back-pressure others.
  - ``num_workers`` async tasks share the queue. Each pops a frame +
    runs the handler, then awaits the next.
  - Backpressure: if the queue is full, ingest drops the OLDEST frame.
    PRD-013 §12.1 — we ingest at 5 fps; losing the oldest is preferred
    to losing the freshest (live monitoring stays current).

Usage:

    pool = DetectionWorkerPool(num_workers=2)
    await pool.start(handler=run_one_frame)
    await pool.submit(frame_payload)        # drops oldest if full
    ...
    await pool.stop()
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable

log = logging.getLogger(__name__)

FrameHandler = Callable[[Any], Awaitable[None]]


class DetectionWorkerPool:
    def __init__(self, *, num_workers: int = 2, max_inflight: int = 8) -> None:
        if num_workers < 1:
            raise ValueError("num_workers must be ≥ 1")
        self.num_workers   = num_workers
        self.max_inflight  = max_inflight
        self._queue: asyncio.Queue[Any] | None = None
        self._workers: list[asyncio.Task] = []
        self._stop_event = asyncio.Event()
        self._handler: FrameHandler | None = None
        self.dropped: int = 0

    async def start(self, *, handler: FrameHandler) -> None:
        self._handler    = handler
        self._queue      = asyncio.Queue(maxsize=self.max_inflight)
        self._stop_event.clear()
        for i in range(self.num_workers):
            task = asyncio.create_task(self._worker_loop(i), name=f"det-worker-{i}")
            self._workers.append(task)
        log.info("DetectionWorkerPool started — %d workers, queue cap %d",
                 self.num_workers, self.max_inflight)

    async def stop(self) -> None:
        self._stop_event.set()
        if self._queue is not None:
            # Wake every worker so they exit promptly.
            for _ in self._workers:
                await self._queue.put(_SENTINEL)
        for task in self._workers:
            await task
        self._workers.clear()
        self._queue = None

    async def submit(self, frame: Any) -> bool:
        """Enqueue a frame. Drops the OLDEST in the queue when full.

        Returns True if accepted, False if a drop was needed.
        """
        if self._queue is None:
            raise RuntimeError("pool not started")
        try:
            self._queue.put_nowait(frame)
            return True
        except asyncio.QueueFull:
            try:
                self._queue.get_nowait()  # drop oldest
                self.dropped += 1
            except asyncio.QueueEmpty:
                pass
            self._queue.put_nowait(frame)
            return False

    async def _worker_loop(self, worker_id: int) -> None:
        assert self._queue is not None
        while True:
            item = await self._queue.get()
            if item is _SENTINEL:
                return
            try:
                if self._handler is not None:
                    await self._handler(item)
            except Exception as e:  # noqa: BLE001
                log.exception("worker %d handler failed: %s", worker_id, e)


_SENTINEL = object()
