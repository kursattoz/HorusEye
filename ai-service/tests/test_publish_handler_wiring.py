"""publish_handler imports + helpers — Sprint 17/18 wiring smoke test.

The full publish loop needs YOLO weights + a live WS, so we don't run
it here. Instead we confirm:

  - The Sprint 17 + 18 rule modules are importable from publish_handler
    (catches a typo in a rule path that would silently leave the rule
    out of the live pipeline)
  - The face_covering overlap helper picks the right detection
  - The pose-frame-skip + max-poses env knobs default reasonably
"""

from __future__ import annotations

from dataclasses import dataclass

from src.api.publish_handler import (
    _face_covering_overlap,
    _FACE_COVERING_CLASS,
    _MAX_POSES_PER_FRAME,
    _POSE_FRAME_SKIP,
    body_lean_eval,
    face_covering_eval,
    gaze_at_lap_eval,
    gaze_at_neighbor_eval,
    hand_to_ear_eval,
    hand_under_desk_eval,
    object_passing_eval,
    standing_up_eval,
    synchronized_eval,
)


# ───────── sampling defaults ─────────

def test_pose_sampling_defaults_are_conservative() -> None:
    # Pose is ~80ms per ROI on CPU; default skip ≥ 2 so we don't pay it
    # every frame, and max-poses ≥ 3 so a typical 3-4 person classroom
    # still gets full coverage every Nth frame.
    assert _POSE_FRAME_SKIP    >= 2
    assert _MAX_POSES_PER_FRAME >= 3


def test_face_covering_class_name_constant() -> None:
    # Sentinel — class name must match what the v3.0 YOLO model emits.
    assert _FACE_COVERING_CLASS == "face_covering"


# ───────── _face_covering_overlap ─────────

@dataclass
class _StubDet:
    class_name: str
    bbox: tuple[float, float, float, float]
    confidence: float = 0.9


def test_face_covering_overlap_finds_matching_detection() -> None:
    person = (0.10, 0.10, 0.50, 0.90)
    dets = [
        _StubDet("phone",          (0.20, 0.40, 0.30, 0.50)),
        _StubDet("face_covering",  (0.18, 0.12, 0.32, 0.30)),
    ]
    result = _face_covering_overlap(person, dets)
    assert result is not None
    assert result.class_name == "face_covering"


def test_face_covering_overlap_skips_outside_person_bbox() -> None:
    person = (0.10, 0.10, 0.50, 0.90)
    dets = [
        _StubDet("face_covering", (0.70, 0.70, 0.85, 0.85)),  # other person
    ]
    assert _face_covering_overlap(person, dets) is None


def test_face_covering_overlap_skips_when_class_missing() -> None:
    person = (0.10, 0.10, 0.50, 0.90)
    dets = [_StubDet("phone", (0.20, 0.30, 0.25, 0.40))]
    assert _face_covering_overlap(person, dets) is None


# ───────── rule imports ─────────

def test_all_sprint_17_18_rule_evals_imported() -> None:
    """If any of these is None the rule isn't wired into publish_handler.
    Pytest catches an ImportError up front, but we also assert callable
    to defend against a name accidentally being rebound to None mid-edit."""
    for fn in (
        body_lean_eval, standing_up_eval, hand_under_desk_eval,
        hand_to_ear_eval, object_passing_eval, gaze_at_lap_eval,
        gaze_at_neighbor_eval, synchronized_eval, face_covering_eval,
    ):
        assert callable(fn)
