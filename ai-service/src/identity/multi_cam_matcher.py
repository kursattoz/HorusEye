"""Multi-camera person matcher — PRD-021 §3 Sprint 18 (BL-313).

Given two sets of (camera_id, track_id, BodyEmbedding) tuples from
cameras that share an overlap zone, produce a list of matches:

    [{camera_a, track_a, camera_b, track_b, similarity, confidence}]

Built on top of cosine similarity over the BL-312 person Re-ID
embeddings. Uses the Hungarian algorithm via :func:`scipy.optimize.
linear_sum_assignment` when available; falls back to greedy nearest-
neighbor if scipy is missing.

The matches feed:
  - BL-310 multi-cam coordinator (incident dedup)
  - BL-311 cross-camera Re-ID for moving subjects between cameras
  - BL-315 severity fusion (incident severity bump on cross-confirm)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable

import numpy as np

from src.identity.person_reid import BodyEmbedding, cosine_similarity

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class TrackEmbedding:
    camera_id: str
    track_id:  int
    embedding: BodyEmbedding


@dataclass(frozen=True)
class CrossCameraMatch:
    camera_a:    str
    track_a:     int
    camera_b:    str
    track_b:     int
    similarity:  float
    # Lower of the two crop confidences; near 0 when either side is a placeholder.
    confidence:  float


def match(
    side_a: list[TrackEmbedding],
    side_b: list[TrackEmbedding],
    *,
    min_similarity: float = 0.55,
) -> list[CrossCameraMatch]:
    """One-to-one match between two camera feeds' track embeddings.

    Returns matches sorted by similarity DESC. Anything below
    ``min_similarity`` is dropped — too noisy to act on.
    """
    if not side_a or not side_b:
        return []

    # Cost matrix: rows = side_a tracks, cols = side_b tracks.
    cost = np.zeros((len(side_a), len(side_b)), dtype=np.float32)
    for i, ta in enumerate(side_a):
        for j, tb in enumerate(side_b):
            cost[i, j] = 1.0 - cosine_similarity(ta.embedding, tb.embedding)

    try:
        from scipy.optimize import linear_sum_assignment  # type: ignore[import-not-found]
        row_idx, col_idx = linear_sum_assignment(cost)
    except ImportError:
        log.info("scipy not installed; using greedy matcher")
        row_idx, col_idx = _greedy_match(cost)

    out: list[CrossCameraMatch] = []
    for r, c in zip(row_idx, col_idx):
        sim = 1.0 - cost[r, c]
        if sim < min_similarity:
            continue
        ta = side_a[r]
        tb = side_b[c]
        out.append(CrossCameraMatch(
            camera_a   = ta.camera_id,
            track_a    = ta.track_id,
            camera_b   = tb.camera_id,
            track_b    = tb.track_id,
            similarity = float(sim),
            confidence = float(min(ta.embedding.confidence, tb.embedding.confidence)),
        ))
    out.sort(key=lambda m: m.similarity, reverse=True)
    return out


def _greedy_match(cost: np.ndarray) -> tuple[list[int], list[int]]:
    """Greedy fallback when scipy isn't available."""
    n, m = cost.shape
    row_idx: list[int] = []
    col_idx: list[int] = []
    used_cols: set[int] = set()
    flat = sorted(
        [(cost[r, c], r, c) for r in range(n) for c in range(m)],
        key=lambda t: t[0],
    )
    used_rows: set[int] = set()
    for _, r, c in flat:
        if r in used_rows or c in used_cols:
            continue
        used_rows.add(r)
        used_cols.add(c)
        row_idx.append(r)
        col_idx.append(c)
    return row_idx, col_idx
