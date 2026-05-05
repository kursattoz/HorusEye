"""Per-track rolling window state — BL-183 (PRD-013 §3.2, §7.3).

Each tracked person carries a 5-minute event window plus per-rule cooldown
bookkeeping. Rules (phone_in_hand, gaze_diversion, …) consult the window
to decide whether a signal has been ``sustained`` for some seconds, and
the cooldown table to suppress duplicate incidents from the same source.

Time is taken from the caller — pass a monotonic ``time.time()`` value or
an injected float in tests. Everything is in seconds.
"""

from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass, field
from typing import Iterable

DEFAULT_WINDOW_SECONDS = 300.0    # 5-minute rolling history
DEFAULT_TRACK_TTL_SECONDS = 60.0  # forget tracks not updated for a minute


@dataclass(frozen=True)
class TrackSample:
    """A single per-frame snapshot for one tracked person."""
    ts: float
    person_bbox: tuple[float, float, float, float]
    overlapping_classes: frozenset[str]


@dataclass
class TrackState:
    """5-minute rolling window of samples + per-rule cooldown + fire history.

    Sprint 8 BL-198 added :attr:`fired_history` so frequency rules
    (``gaze_diversion`` requires ≥3 fires in 5 minutes) can count past
    fires without needing a separate persistence query.
    """

    track_id: int
    window_seconds: float = DEFAULT_WINDOW_SECONDS
    samples: deque[TrackSample] = field(default_factory=deque)
    fired_at: dict[str, float] = field(default_factory=dict)
    fired_history: deque[tuple[str, float]] = field(default_factory=deque)
    # Per-rule signal trace for raw_signals enrichment (BL-199).
    # E.g. gaze_diversion samples yaw_deg every frame; the deque stores
    # the last window_seconds' worth of (ts, value) pairs.
    signal_traces: dict[str, deque[tuple[str, float]]] = field(default_factory=dict)
    last_seen_at: float = 0.0
    # BL-220 — student match cache. Set when matcher resolves the track to
    # an enrolled student; sticks for the rest of the track's lifetime.
    matched_student_id: str | None = None
    last_match_attempt_at: float | None = None
    best_match_similarity: float | None = None

    def add(
        self,
        ts: float,
        person_bbox: tuple[float, float, float, float],
        overlapping_classes: Iterable[str],
    ) -> None:
        self.samples.append(
            TrackSample(
                ts=ts,
                person_bbox=person_bbox,
                overlapping_classes=frozenset(overlapping_classes),
            )
        )
        self.last_seen_at = ts
        cutoff = ts - self.window_seconds
        self._evict_older_than(cutoff)
        self._evict_history_older_than(cutoff)
        self._evict_traces_older_than(cutoff)

    def _evict_older_than(self, cutoff_ts: float) -> None:
        while self.samples and self.samples[0].ts < cutoff_ts:
            self.samples.popleft()

    def _evict_history_older_than(self, cutoff_ts: float) -> None:
        while self.fired_history and self.fired_history[0][1] < cutoff_ts:
            self.fired_history.popleft()

    def _evict_traces_older_than(self, cutoff_ts: float) -> None:
        for trace in self.signal_traces.values():
            while trace and trace[0][1] < cutoff_ts:
                trace.popleft()

    def sustained(self, class_name: str, min_seconds: float) -> bool:
        """Return ``True`` iff every sample in the most recent ``min_seconds``
        contained ``class_name`` overlap, AND the window covers at least
        that many seconds.
        """
        if not self.samples:
            return False
        cutoff = self.samples[-1].ts - min_seconds
        relevant = [s for s in self.samples if s.ts >= cutoff]
        if not relevant:
            return False
        span = relevant[-1].ts - relevant[0].ts
        if span < min_seconds:
            return False
        return all(class_name in s.overlapping_classes for s in relevant)

    def cooldown_ok(self, rule: str, cooldown_seconds: float, now: float) -> bool:
        last = self.fired_at.get(rule)
        return last is None or (now - last) >= cooldown_seconds

    def mark_fired(self, rule: str, now: float) -> None:
        self.fired_at[rule] = now
        self.fired_history.append((rule, now))
        self._evict_history_older_than(now - self.window_seconds)

    def fires_in_window(self, rule: str, window_seconds: float, now: float) -> int:
        """Count how many times ``rule`` has fired in the last ``window_seconds``."""
        cutoff = now - window_seconds
        return sum(1 for r, ts in self.fired_history if r == rule and ts >= cutoff)

    def record_signal(self, name: str, ts: float, value: float) -> None:
        """Append a per-rule signal sample (e.g. yaw_deg) for raw_signals
        enrichment. Older samples beyond ``window_seconds`` evicted on add.
        """
        trace = self.signal_traces.setdefault(name, deque())
        trace.append((str(ts), value))
        cutoff = ts - self.window_seconds
        while trace and float(trace[0][0]) < cutoff:
            trace.popleft()

    def signal_trace(self, name: str) -> list[tuple[float, float]]:
        """Snapshot of ``name``'s trace as a list of (ts, value) tuples."""
        trace = self.signal_traces.get(name)
        if not trace:
            return []
        return [(float(ts), v) for ts, v in trace]

    def latest_sample(self) -> TrackSample | None:
        return self.samples[-1] if self.samples else None


@dataclass
class TrackStore:
    """Registry of TrackState keyed by (session_id, camera_id, track_id)."""

    window_seconds: float = DEFAULT_WINDOW_SECONDS
    ttl_seconds: float = DEFAULT_TRACK_TTL_SECONDS
    _states: dict[tuple[str, str, int], TrackState] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def get_or_create(
        self, session_id: str, camera_id: str, track_id: int
    ) -> TrackState:
        key = (session_id, camera_id, track_id)
        with self._lock:
            st = self._states.get(key)
            if st is None:
                st = TrackState(track_id=track_id, window_seconds=self.window_seconds)
                self._states[key] = st
            return st

    def gc(self, now: float) -> int:
        """Drop tracks not updated in ``ttl_seconds``. Returns count removed."""
        cutoff = now - self.ttl_seconds
        with self._lock:
            stale = [k for k, st in self._states.items() if st.last_seen_at < cutoff]
            for k in stale:
                del self._states[k]
            return len(stale)

    def drop_camera(self, session_id: str, camera_id: str) -> int:
        """Forget every track in a (session, camera) — call on WS close."""
        with self._lock:
            stale = [
                k for k in self._states
                if k[0] == session_id and k[1] == camera_id
            ]
            for k in stale:
                del self._states[k]
            return len(stale)

    def states_for_camera(
        self, session_id: str, camera_id: str,
    ) -> list[TrackState]:
        """Snapshot of all tracks in (session, camera). Used by frame-level
        rules (empty_seat, unauthorized_person) that scan every track
        regardless of whether it appeared in the latest YOLO output."""
        with self._lock:
            return [
                st for (sid, cid, _), st in self._states.items()
                if sid == session_id and cid == camera_id
            ]

    def __len__(self) -> int:
        with self._lock:
            return len(self._states)


# Process-global store; rules and the publish handler share it.
track_store = TrackStore()


def _reset_store_for_tests() -> None:
    """Test hook — wipe the global store."""
    track_store._states.clear()  # noqa: SLF001 — test-only access


# ───────── geometry helper used by rule layer ─────────

def bbox_iou(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    """IoU on axis-aligned bboxes in any consistent coord system."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter_w, inter_h = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = inter_w * inter_h
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def bbox_overlap_ratio(
    object_bbox: tuple[float, float, float, float],
    person_bbox: tuple[float, float, float, float],
) -> float:
    """Fraction of ``object_bbox`` area that lies inside ``person_bbox``.

    More forgiving than IoU when the object (a phone) is much smaller than
    the container (a person) — the phone bbox is small but mostly inside
    the person bbox, so IoU stays low while overlap_ratio is high.
    """
    ox1, oy1, ox2, oy2 = object_bbox
    px1, py1, px2, py2 = person_bbox
    ix1, iy1 = max(ox1, px1), max(oy1, py1)
    ix2, iy2 = min(ox2, px2), min(oy2, py2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    obj_area = max(0.0, ox2 - ox1) * max(0.0, oy2 - oy1)
    return (inter / obj_area) if obj_area > 0 else 0.0
