"""Shared helpers for the Sprint 17 pose-based rules.

PRD-021 §3 Sprint 17. The 8 behavior rules (body_lean_neighbor,
standing_up, hand_under_desk, hand_to_ear_mouth, object_passing,
gaze_at_lap, gaze_at_neighbor, synchronized_behavior) all share a
small set of geometric primitives over :class:`PoseSignal`. Keeping
them in one module avoids drift across the rule files.
"""

from __future__ import annotations

import math
from typing import Iterable

from src.detection.pose import PoseSignal


# ───────── distance ─────────

def euclid_xy(a: tuple[float, float], b: tuple[float, float]) -> float:
    """2-D Euclidean distance between two (x, y) tuples."""
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


# ───────── neighbor lookup ─────────

def lateral_neighbors(
    me: PoseSignal,
    others: Iterable[PoseSignal],
    *,
    max_x_gap: float = 0.35,
    max_y_misalign: float = 0.15,
) -> list[PoseSignal]:
    """Return PoseSignals whose bbox center is roughly on the same row
    as ``me`` and within ``max_x_gap`` horizontally.

    Used by body_lean_neighbor, gaze_at_neighbor, synchronized_behavior,
    and object_passing. ``max_x_gap`` is normalized (frame fraction).
    """
    mx1, my1, mx2, my2 = me.bbox_xyxy
    me_cx = (mx1 + mx2) / 2.0
    me_cy = (my1 + my2) / 2.0

    out: list[PoseSignal] = []
    for o in others:
        if o is me:
            continue
        ox1, oy1, ox2, oy2 = o.bbox_xyxy
        ocx = (ox1 + ox2) / 2.0
        ocy = (oy1 + oy2) / 2.0
        if abs(ocy - me_cy) > max_y_misalign:
            continue
        if 0 < abs(ocx - me_cx) <= max_x_gap:
            out.append(o)
    return out


def neighbor_side(me: PoseSignal, neighbor: PoseSignal) -> str:
    """'left' if neighbor's center is to the image left of me, else 'right'."""
    me_cx       = (me.bbox_xyxy[0] + me.bbox_xyxy[2]) / 2.0
    neighbor_cx = (neighbor.bbox_xyxy[0] + neighbor.bbox_xyxy[2]) / 2.0
    return "left" if neighbor_cx < me_cx else "right"


# ───────── posture ─────────

def torso_lean_magnitude(sig: PoseSignal) -> float:
    """Absolute value of shoulder-midpoint vs hip-midpoint offset (0..0.5+).

    Useful for body_lean_neighbor + synchronized_behavior.
    """
    return abs(sig.torso_lean_x)


def is_standing(
    sig: PoseSignal,
    *,
    shoulder_y_max: float = 0.35,
    hip_y_max:      float = 0.55,
) -> bool:
    """True when shoulders sit near the top of the ROI and hips well
    above midline — characteristic of a standing person seen by a
    desk-front camera.
    """
    return sig.shoulder_y_avg < shoulder_y_max and sig.hip_y_avg < hip_y_max


def hand_below_desk(
    sig: PoseSignal,
    *,
    desk_y_threshold: float = 0.80,
) -> bool:
    """True if at least one wrist landmark is below the desk line."""
    return (
        sig.left_wrist_xy[1]  > desk_y_threshold
        or sig.right_wrist_xy[1] > desk_y_threshold
    )


def hand_near_ear_or_mouth(
    sig: PoseSignal,
    *,
    distance_threshold: float = 0.08,
) -> str | None:
    """Returns 'ear_left' / 'ear_right' / 'mouth' if any wrist is within
    ``distance_threshold`` of the matching landmark. None otherwise.
    """
    for wrist, name in (
        (sig.left_wrist_xy,  "ear_left"),
        (sig.right_wrist_xy, "ear_right"),
    ):
        target = sig.left_ear_xy if name == "ear_left" else sig.right_ear_xy
        if euclid_xy(wrist, target) < distance_threshold:
            return name
    for wrist in (sig.left_wrist_xy, sig.right_wrist_xy):
        if euclid_xy(wrist, sig.mouth_xy) < distance_threshold:
            return "mouth"
    return None


def gaze_is_downward(
    sig: PoseSignal,
    *,
    nose_below_shoulder_min_dy: float = 0.20,
) -> bool:
    """True when the nose sits well below shoulder line — head tipped
    downward, a proxy for gaze_at_lap.
    """
    return (sig.nose_xy[1] - sig.shoulder_y_avg) > nose_below_shoulder_min_dy
