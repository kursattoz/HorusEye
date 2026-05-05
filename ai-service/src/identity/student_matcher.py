"""Track ↔ student matcher — BL-220 (PRD-013 §3.5, §6.13).

Once a track has been observed for ``min_age_seconds``, the matcher
embeds the cropped face via ``FaceEmbedder`` and queries the Supabase
``match_face_embedding`` RPC for the nearest enrolled student. Hits
above ``threshold`` are cached on the :class:`TrackState`; misses
trigger a back-off so we don't bombard pgvector on every frame.

The publish handler calls :func:`match_track` once per frame inside
the per-track loop; the function is a no-op when:

* The track is too young (`age_seconds < min_age_seconds`).
* A match has already been resolved (cache hit).
* The cooldown is still active.
* The Supabase service-role client is unavailable.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

from src.identity.face_embedder import get_face_embedder
from src.persistence.supabase_client import get_supabase_admin
from src.scoring.track_state import TrackState

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class MatcherConfig:
    threshold:           float = 0.65   # cosine similarity
    min_age_seconds:     float = 1.0    # let the bbox stabilize
    retry_cooldown_s:    float = 30.0   # back-off between misses
    rpc_name:            str = "match_face_embedding"


def _track_age_seconds(track_state: TrackState) -> float:
    if not track_state.samples:
        return 0.0
    return track_state.samples[-1].ts - track_state.samples[0].ts


def match_track(
    track_state: TrackState,
    frame_bgr: Any,
    person_bbox: tuple[float, float, float, float],
    ts: float,
    cfg: Optional[MatcherConfig] = None,
) -> Optional[str]:
    """Resolve the track to an enrolled student id, or ``None``.

    Returns the cached student_id on subsequent calls without hitting
    Supabase again. The first successful match writes to
    ``track_state.matched_student_id``.
    """
    cfg = cfg or MatcherConfig()

    if track_state.matched_student_id is not None:
        return track_state.matched_student_id

    if _track_age_seconds(track_state) < cfg.min_age_seconds:
        return None

    last_attempt = track_state.last_match_attempt_at
    if last_attempt is not None and (ts - last_attempt) < cfg.retry_cooldown_s:
        return None

    track_state.last_match_attempt_at = ts

    embedder = get_face_embedder()
    embedding = embedder.embed(frame_bgr, person_bbox=person_bbox)
    if embedding is None:
        return None

    try:
        client = get_supabase_admin()
    except RuntimeError as e:
        log.warning("matcher: supabase unavailable (%s)", e)
        return None

    try:
        result = client.rpc(
            cfg.rpc_name,
            {
                "query_embedding": embedding.tolist(),
                "match_threshold": cfg.threshold,
                "match_count":     1,
            },
        ).execute()
    except Exception as e:  # noqa: BLE001 — defensive: pgvector RPC may transiently fail
        log.warning("matcher: RPC %s failed: %s", cfg.rpc_name, e)
        return None

    rows = getattr(result, "data", None) or []
    if not rows:
        return None

    top = rows[0]
    similarity = float(top.get("similarity") or 0.0)
    if similarity < cfg.threshold:
        return None

    student_id = str(top.get("student_id") or top.get("id") or "")
    if not student_id:
        return None

    track_state.matched_student_id = student_id
    track_state.best_match_similarity = similarity
    log.info(
        "track matched: track_id=%s → student_id=%s similarity=%.3f",
        track_state.track_id, student_id, similarity,
    )
    return student_id
