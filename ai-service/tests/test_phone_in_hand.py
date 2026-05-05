"""phone_in_hand rule tests — BL-184 (PRD-013 §7.2 TIER-1, §7.3 Phase A)."""

from __future__ import annotations

from src.detection.yolo_detector import Detection
from src.scoring.rules.phone_in_hand import (
    PhoneInHandConfig,
    evaluate,
    update_overlap,
)
from src.scoring.track_state import TrackState


def _phone(conf: float = 0.7, bbox=(0.40, 0.40, 0.50, 0.50)) -> Detection:
    return Detection(class_id=67, class_name="cell phone", confidence=conf, bbox=bbox)


PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)


def test_update_overlap_adds_class_when_phone_inside_person() -> None:
    st = TrackState(track_id=1)
    overlap = update_overlap(st, ts=0.0, person_bbox=PERSON_BBOX, other_detections=[_phone()])
    assert "cell phone" in overlap
    assert "cell phone" in st.samples[-1].overlapping_classes


def test_update_overlap_skips_when_phone_outside_person() -> None:
    st = TrackState(track_id=1)
    far_phone = _phone(bbox=(0.85, 0.85, 0.90, 0.90))   # outside person
    overlap = update_overlap(st, ts=0.0, person_bbox=PERSON_BBOX, other_detections=[far_phone])
    assert overlap == {}
    assert st.samples[-1].overlapping_classes == frozenset()


def test_evaluate_fires_high_after_three_sustained_seconds() -> None:
    st = TrackState(track_id=42)
    cfg = PhoneInHandConfig()
    phone = _phone(conf=0.75)

    cand = None
    for ts in (0.0, 1.0, 2.0, 3.0):
        update_overlap(st, ts=ts, person_bbox=PERSON_BBOX, other_detections=[phone])
        cand = evaluate(st, ts=ts, person_bbox=PERSON_BBOX, overlapping_phone=phone, cfg=cfg)

    assert cand is not None
    assert cand.incident_type == "phone_detected"
    assert cand.severity == "high"
    assert cand.confidence == 0.75
    assert cand.track_id == 42
    assert cand.bbox == phone.bbox
    assert cand.person_bbox == PERSON_BBOX
    assert "phone_in_hand:sustained" in " ".join(cand.triggered_rules)


def test_evaluate_fires_medium_when_confidence_below_high_threshold() -> None:
    st = TrackState(track_id=1)
    phone = _phone(conf=0.55)
    for ts in (0.0, 1.5, 3.0):
        update_overlap(st, ts=ts, person_bbox=PERSON_BBOX, other_detections=[phone])
    cand = evaluate(st, ts=3.0, person_bbox=PERSON_BBOX, overlapping_phone=phone)
    assert cand is not None
    assert cand.severity == "medium"


def test_evaluate_silent_when_below_medium_confidence() -> None:
    st = TrackState(track_id=1)
    phone = _phone(conf=0.40)
    for ts in (0.0, 1.5, 3.0):
        update_overlap(st, ts=ts, person_bbox=PERSON_BBOX, other_detections=[phone])
    assert evaluate(st, ts=3.0, person_bbox=PERSON_BBOX, overlapping_phone=phone) is None


def test_evaluate_silent_when_only_one_frame_of_phone() -> None:
    st = TrackState(track_id=1)
    phone = _phone()
    update_overlap(st, ts=0.0, person_bbox=PERSON_BBOX, other_detections=[phone])
    assert evaluate(st, ts=0.0, person_bbox=PERSON_BBOX, overlapping_phone=phone) is None


def test_evaluate_silent_when_phone_disappears_mid_window() -> None:
    st = TrackState(track_id=1)
    phone = _phone()
    update_overlap(st, ts=0.0, person_bbox=PERSON_BBOX, other_detections=[phone])
    update_overlap(st, ts=1.0, person_bbox=PERSON_BBOX, other_detections=[])      # phone gone
    update_overlap(st, ts=2.5, person_bbox=PERSON_BBOX, other_detections=[phone]) # phone back
    update_overlap(st, ts=3.5, person_bbox=PERSON_BBOX, other_detections=[phone])
    assert evaluate(st, ts=3.5, person_bbox=PERSON_BBOX, overlapping_phone=phone) is None


def test_cooldown_blocks_immediate_refire() -> None:
    st = TrackState(track_id=1)
    cfg = PhoneInHandConfig(cooldown_seconds=30.0)
    phone = _phone(conf=0.80)

    # First fire at t=3.0
    for ts in (0.0, 1.0, 2.0, 3.0):
        update_overlap(st, ts=ts, person_bbox=PERSON_BBOX, other_detections=[phone])
    first = evaluate(st, ts=3.0, person_bbox=PERSON_BBOX, overlapping_phone=phone, cfg=cfg)
    assert first is not None

    # 5s later, still sustained — but cooldown blocks
    for ts in (4.0, 5.0, 6.0, 7.0, 8.0):
        update_overlap(st, ts=ts, person_bbox=PERSON_BBOX, other_detections=[phone])
    second = evaluate(st, ts=8.0, person_bbox=PERSON_BBOX, overlapping_phone=phone, cfg=cfg)
    assert second is None

    # 35s later, cooldown cleared — fires again
    for ts in (33.0, 34.0, 35.0, 36.0):
        update_overlap(st, ts=ts, person_bbox=PERSON_BBOX, other_detections=[phone])
    third = evaluate(st, ts=36.0, person_bbox=PERSON_BBOX, overlapping_phone=phone, cfg=cfg)
    assert third is not None


def test_two_tracks_independent_state() -> None:
    """Two students with phones each get their own incident — no shared state."""
    a = TrackState(track_id=1)
    b = TrackState(track_id=2)
    phone = _phone()
    person_a = (0.10, 0.10, 0.30, 0.50)
    person_b = (0.60, 0.10, 0.80, 0.50)
    phone_a = Detection(class_id=67, class_name="cell phone", confidence=0.8, bbox=(0.18, 0.30, 0.22, 0.34))
    phone_b = Detection(class_id=67, class_name="cell phone", confidence=0.8, bbox=(0.68, 0.30, 0.72, 0.34))

    for ts in (0.0, 1.0, 2.0, 3.0):
        update_overlap(a, ts=ts, person_bbox=person_a, other_detections=[phone_a, phone_b])
        update_overlap(b, ts=ts, person_bbox=person_b, other_detections=[phone_a, phone_b])

    cand_a = evaluate(a, ts=3.0, person_bbox=person_a, overlapping_phone=phone_a)
    cand_b = evaluate(b, ts=3.0, person_bbox=person_b, overlapping_phone=phone_b)

    assert cand_a is not None and cand_a.track_id == 1
    assert cand_b is not None and cand_b.track_id == 2
