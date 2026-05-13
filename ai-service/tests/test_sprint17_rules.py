"""Sprint 17 behavior rules — pose-driven incident emission tests.

Covers all 8 BL-297..308 rules: body_lean_neighbor, standing_up,
hand_under_desk, hand_to_ear_mouth, object_passing, gaze_at_lap,
gaze_at_neighbor, synchronized_behavior.

The tests build synthetic PoseSignal / FaceMeshSignal payloads + a
fresh TrackState, drive the rule for enough simulated frames to clear
the "sustained" threshold, and assert the IncidentCandidate shape.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from src.detection.face_mesh import FaceMeshSignal
from src.detection.pose import PoseSignal, PoseLandmark
from src.scoring.rules import IncidentCandidate
from src.scoring.rules.body_lean_neighbor import (
    evaluate as eval_lean, BodyLeanConfig,
)
from src.scoring.rules.gaze_at_lap import (
    evaluate as eval_lap, GazeAtLapConfig,
)
from src.scoring.rules.gaze_at_neighbor import (
    evaluate as eval_neigh, GazeAtNeighborConfig, set_calibration,
)
from src.scoring.rules.gaze_diversion import YAW_TRACE
from src.scoring.rules.hand_to_ear_mouth import (
    evaluate as eval_ear, HandToEarMouthConfig,
)
from src.scoring.rules.hand_under_desk import (
    evaluate as eval_desk, HandUnderDeskConfig,
)
from src.scoring.rules.object_passing import (
    evaluate as eval_pass, ObjectPassingConfig,
)
from src.scoring.rules.standing_up import (
    evaluate as eval_stand, StandingUpConfig,
)
from src.scoring.rules.synchronized_behavior import (
    evaluate as eval_sync, SynchronizedBehaviorConfig,
)
from src.scoring.track_state import TrackState


# ───────── helpers ─────────

def _zero_landmarks() -> tuple[PoseLandmark, ...]:
    return tuple(PoseLandmark(0.5, 0.5, 0.0, 1.0) for _ in range(33))


def make_pose(
    *,
    bbox=(0.10, 0.20, 0.30, 0.80),
    shoulder_y=0.40,
    hip_y=0.65,
    lean_x=0.0,
    left_wrist=(0.45, 0.55),
    right_wrist=(0.55, 0.55),
    left_ear=(0.45, 0.30),
    right_ear=(0.55, 0.30),
    mouth=(0.50, 0.42),
    nose=(0.50, 0.35),
) -> PoseSignal:
    return PoseSignal(
        landmarks=_zero_landmarks(),
        confidence=0.95,
        shoulder_y_avg=shoulder_y,
        hip_y_avg=hip_y,
        torso_lean_x=lean_x,
        left_wrist_xy=left_wrist,
        right_wrist_xy=right_wrist,
        left_ear_xy=left_ear,
        right_ear_xy=right_ear,
        mouth_xy=mouth,
        nose_xy=nose,
        bbox_xyxy=bbox,
    )


def make_track(track_id: int = 1) -> TrackState:
    return TrackState(track_id=track_id, window_seconds=600.0)


def _drive_until_fire(
    rule_fn,
    track: TrackState,
    ts_iter,
    *args,
    **kwargs,
) -> IncidentCandidate | None:
    """Run a rule across timestamps; return the FIRST IncidentCandidate.

    The "sustained" rules emit one fire then enter cooldown, so iterating
    past the firing tick yields None. The tests want to know whether the
    rule fired at all within the window, not whether the last tick fired.
    """
    for ts in ts_iter:
        result = rule_fn(track, ts, *args, **kwargs)
        if result is not None:
            return result
    return None


# ───────── body_lean_neighbor ─────────

def test_body_lean_neighbor_fires_when_leaning_toward_neighbor() -> None:
    me = make_pose(bbox=(0.10, 0.20, 0.30, 0.80), lean_x=0.20)  # leaning right
    right_neighbor = make_pose(
        bbox=(0.35, 0.22, 0.55, 0.82),    # to the image-right of me, same row
        lean_x=0.0,
    )

    track = make_track()
    cfg   = BodyLeanConfig(lean_threshold=0.10, sustained_seconds=2.0)
    incident: IncidentCandidate | None = None
    for ts in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5]:
        incident = eval_lean(track, ts, me.bbox_xyxy, me, [right_neighbor], cfg)
        if incident is not None: break
    assert incident is not None
    assert incident.incident_type == "body_lean_neighbor"
    assert incident.raw_signals["neighbor_side"] == "right"


def test_body_lean_neighbor_silent_when_no_lateral_neighbor() -> None:
    me = make_pose(lean_x=0.20)
    far_neighbor = make_pose(bbox=(0.85, 0.20, 0.95, 0.80))  # too far horizontally
    track = make_track()
    cfg   = BodyLeanConfig(lean_threshold=0.10, sustained_seconds=1.0)
    for ts in [0.0, 0.5, 1.0, 1.5]:
        result = eval_lean(track, ts, me.bbox_xyxy, me, [far_neighbor], cfg)
    assert result is None


# ───────── standing_up ─────────

def test_standing_up_fires_on_high_shoulder() -> None:
    pose = make_pose(shoulder_y=0.20, hip_y=0.45)   # well above thresholds
    track = make_track()
    cfg   = StandingUpConfig(sustained_seconds=1.0)
    for ts in [0.0, 0.5, 1.0, 1.5]:
        incident = eval_stand(track, ts, pose.bbox_xyxy, pose, cfg)
        if incident is not None: break
    assert incident is not None
    assert incident.incident_type == "standing_up"
    assert incident.severity in {"medium", "high"}


def test_standing_up_silent_when_seated() -> None:
    pose = make_pose(shoulder_y=0.45, hip_y=0.70)
    track = make_track()
    cfg = StandingUpConfig(sustained_seconds=0.5)
    for ts in [0.0, 0.5, 1.0]:
        incident = eval_stand(track, ts, pose.bbox_xyxy, pose, cfg)
        if incident is not None: break
    assert incident is None


# ───────── hand_under_desk ─────────

def test_hand_under_desk_fires_when_wrist_below_threshold() -> None:
    pose = make_pose(
        left_wrist=(0.40, 0.95),
        right_wrist=(0.55, 0.55),
    )
    track = make_track()
    cfg   = HandUnderDeskConfig(sustained_seconds=1.0)
    incident: IncidentCandidate | None = None
    for ts in [0.0, 0.5, 1.0, 1.5]:
        incident = eval_desk(track, ts, pose.bbox_xyxy, pose, cfg)
        if incident is not None: break
    assert incident is not None
    assert incident.incident_type == "hand_under_desk"


# ───────── hand_to_ear_mouth ─────────

def test_hand_to_ear_mouth_fires_for_ear_contact() -> None:
    # Right wrist very close to right ear
    pose = make_pose(
        right_wrist=(0.55, 0.31),    # ear_right is (0.55, 0.30)
    )
    track = make_track()
    cfg   = HandToEarMouthConfig(sustained_seconds=1.0)
    incident: IncidentCandidate | None = None
    for ts in [0.0, 0.5, 1.0, 1.5]:
        incident = eval_ear(track, ts, pose.bbox_xyxy, pose, cfg)
        if incident is not None: break
    assert incident is not None
    assert incident.incident_type == "hand_to_ear_mouth"
    assert incident.raw_signals["target"] in {"ear_left", "ear_right", "mouth"}


# ───────── object_passing ─────────

def test_object_passing_fires_when_wrists_overlap_in_global_frame() -> None:
    me = make_pose(bbox=(0.10, 0.30, 0.30, 0.80), right_wrist=(0.95, 0.55))
    neighbor = make_pose(
        bbox=(0.30, 0.30, 0.50, 0.80),
        left_wrist=(0.05, 0.55),    # in their ROI; global ≈ (0.31, 0.575)
    )
    # In the global frame:
    #   my right_wrist  ≈ (0.10 + 0.95*0.20, 0.30 + 0.55*0.50) = (0.29, 0.575)
    #   neighbor left   ≈ (0.30 + 0.05*0.20, 0.30 + 0.55*0.50) = (0.31, 0.575)
    # Distance ≈ 0.02 < 0.10 → trip
    track = make_track()
    cfg = ObjectPassingConfig(proximity_threshold=0.10, sustained_seconds=0.5)
    incident = None
    for ts in [0.0, 0.3, 0.6, 0.9]:
        incident = eval_pass(track, ts, me.bbox_xyxy, me, [neighbor], cfg)
        if incident is not None: break
    assert incident is not None
    assert incident.incident_type == "object_passing"


# ───────── gaze_at_lap ─────────

def test_gaze_at_lap_fires_when_nose_well_below_shoulder() -> None:
    pose = make_pose(shoulder_y=0.30, nose=(0.50, 0.60))  # dy = 0.30 ≥ 0.20
    track = make_track()
    cfg   = GazeAtLapConfig(sustained_seconds=1.0)
    incident: IncidentCandidate | None = None
    for ts in [0.0, 0.5, 1.0, 1.5]:
        incident = eval_lap(track, ts, pose.bbox_xyxy, pose, cfg)
        if incident is not None: break
    assert incident is not None
    assert incident.incident_type == "gaze_at_lap"
    assert incident.severity in {"high", "critical"}


# ───────── gaze_at_neighbor ─────────

def test_gaze_at_neighbor_fires_with_aligned_yaw_and_neighbor() -> None:
    set_calibration({})  # default yaw_sign = +1 ⇒ yaw>0 looks right
    me = make_pose(bbox=(0.20, 0.30, 0.40, 0.80))
    right_neighbor = make_pose(bbox=(0.45, 0.30, 0.65, 0.80))

    track = make_track()
    cfg = GazeAtNeighborConfig(yaw_threshold=20.0, sustained_seconds=1.0)
    # Pre-seed the yaw trace so the gaze_diversion helper detects sustained.
    for ts in [0.0, 0.3, 0.6, 0.9, 1.2]:
        track.record_signal(YAW_TRACE, ts, 35.0)

    face = FaceMeshSignal(yaw_deg=35.0, pitch_deg=0.0, roll_deg=0.0, eye_closed=False, confidence=0.9)
    incident = eval_neigh(track, 1.5, me.bbox_xyxy, me, face, [right_neighbor], cfg=cfg)
    assert incident is not None
    assert incident.incident_type == "gaze_at_neighbor"
    assert incident.raw_signals["yaw_dir"] == "right"


def test_gaze_at_neighbor_silent_when_no_face_signal() -> None:
    me = make_pose()
    right_neighbor = make_pose(bbox=(0.45, 0.30, 0.65, 0.80))
    track = make_track()
    for ts in [0.0, 0.3, 0.6, 0.9]:
        track.record_signal(YAW_TRACE, ts, 50.0)
    cfg = GazeAtNeighborConfig(yaw_threshold=20.0, sustained_seconds=0.5)
    incident = eval_neigh(track, 1.0, me.bbox_xyxy, me, None, [right_neighbor], cfg=cfg)
    assert incident is None


# ───────── synchronized_behavior ─────────

def test_synchronized_behavior_fires_when_both_lean_same_way() -> None:
    me = make_pose(bbox=(0.10, 0.30, 0.30, 0.80), lean_x=0.15)
    neighbor = make_pose(bbox=(0.32, 0.30, 0.52, 0.80), lean_x=0.18)
    track = make_track()
    cfg = SynchronizedBehaviorConfig(lean_threshold=0.10, sustained_seconds=2.0)
    incident: IncidentCandidate | None = None
    for ts in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5]:
        incident = eval_sync(track, ts, me.bbox_xyxy, me, [neighbor], cfg)
        if incident is not None: break
    assert incident is not None
    assert incident.incident_type == "synchronized_behavior"


def test_synchronized_behavior_silent_when_leans_oppose() -> None:
    me = make_pose(bbox=(0.10, 0.30, 0.30, 0.80), lean_x=+0.15)
    neighbor = make_pose(bbox=(0.32, 0.30, 0.52, 0.80), lean_x=-0.15)
    track = make_track()
    cfg = SynchronizedBehaviorConfig(lean_threshold=0.10, sustained_seconds=1.0)
    for ts in [0.0, 0.5, 1.0, 1.5]:
        incident = eval_sync(track, ts, me.bbox_xyxy, me, [neighbor], cfg)
        if incident is not None: break
    assert incident is None
