"""Per-session broadcaster registry — PRD-019 §4.4.

Couples the publish endpoint (frame producer) to the detections endpoint
(frame + incident consumer). Each subscriber registers an asyncio.Queue
keyed by session_id; publish_handler.broadcast() puts ServerFrame /
ServerDetection / ServerIncident JSON envelopes onto all queues for that
session.

In-memory only — single AI service replica today. If we scale horizontally
later this will need to move to Redis pub/sub.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

log = logging.getLogger(__name__)


class _Broadcaster:
    """Multi-subscriber fan-out keyed by session_id."""

    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)

    def subscribe(self, session_id: str, maxsize: int = 32) -> asyncio.Queue[dict[str, Any]]:
        """Register a new subscriber queue. Caller must call ``unsubscribe`` on close."""
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=maxsize)
        self._subs[session_id].add(q)
        log.debug("subscriber registered: session=%s total=%d", session_id, len(self._subs[session_id]))
        return q

    def unsubscribe(self, session_id: str, q: asyncio.Queue[dict[str, Any]]) -> None:
        if session_id in self._subs:
            self._subs[session_id].discard(q)
            if not self._subs[session_id]:
                self._subs.pop(session_id, None)

    def broadcast(self, session_id: str, message: dict[str, Any]) -> None:
        """Push to all subscribers. Drops the message for a slow subscriber
        rather than blocking the producer (frame stream cannot stall)."""
        queues = list(self._subs.get(session_id, ()))
        for q in queues:
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                # Slow consumer: drop oldest then push the new one.
                try:
                    _ = q.get_nowait()
                    q.put_nowait(message)
                except Exception:
                    log.warning("dropping message for slow subscriber session=%s", session_id)

    def subscriber_count(self, session_id: str) -> int:
        return len(self._subs.get(session_id, ()))


broadcaster = _Broadcaster()
