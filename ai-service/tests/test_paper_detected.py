"""paper_detected rule tests — BL-206."""

from __future__ import annotations

from src.detection.yolo_detector import Detection
from src.scoring.rules.paper_detected import PaperDetectedConfig, evaluate
from src.scoring.rules.phone_in_hand import update_overlap
from src.scoring.track_state import TrackState

PERSON_BBOX = (0.20, 0.20, 0.80, 0.95)


def _book(conf: float = 0.6, bbox=(0.30, 0.40, 0.55, 0.60)) -> Detection:
    return Detection(class_id=73, class_name="book", confidence=conf, bbox=bbox)


def _keyboard(conf: float = 0.55, bbox=(0.30, 0.50, 0.60, 0.65)) -> Detection:
    return Detection(class_id=76, class_name="keyboard", confidence=conf, bbox=bbox)


def _phone(conf: float = 0.7, bbox=(0.40, 0.40, 0.50, 0.50)) -> Detection:
    return Detection(class_id=67, class_name="cell phone", confidence=conf, bbox=bbox)


def test_no_fire_with_no_paper_overlap() -> None:
    state = TrackState(track_id=1)
    cfg = PaperDetectedConfig()
    overlap = update_overlap(state, ts=0.0, person_bbox=PERSON_BBOX, other_detections=[])
    cand = evaluate(state, ts=0.0, person_bbox=PERSON_BBOX, overlap_by_class=overlap, cfg=cfg)
    assert cand is None


def test_fires_medium_after_sustained_book_overlap() -> None:
    state = TrackState(track_id=42)
    cfg = PaperDetectedConfig()
    book = _book(conf=0.55)
    cand = None
    for ts in (0.0, 0.5, 1.0, 1.5, 2.0):
        overlap = update_overlap(state, ts=ts, person_bbox=PERSON_BBOX, other_detections=[book])
        cand = evaluate(state, ts=ts, person_bbox=PERSON_BBOX, overlap_by_class=overlap, cfg=cfg)
    assert cand is not None
    assert cand.incident_type == "paper_detected"
    assert cand.severity == "medium"
    assert cand.confidence == 0.55
    assert cand.track_id == 42
    assert cand.raw_signals["matched_class"] == "book"


def test_keyboard_no_longer_fires_paper_detected() -> None:
    """BL-265: keyboard removed from PAPER_CLASSES. It doesn't belong on
    an exam desk and the old mapping was a pure FP source — confirm the
    rule stays silent even after sustained overlap."""
    state = TrackState(track_id=1)
    cfg = PaperDetectedConfig()
    kb = _keyboard(conf=0.55)
    cand = None
    for ts in (0.0, 0.5, 1.0, 1.5, 2.0):
        overlap = update_overlap(state, ts=ts, person_bbox=PERSON_BBOX, other_detections=[kb])
        cand = evaluate(state, ts=ts, person_bbox=PERSON_BBOX, overlap_by_class=overlap, cfg=cfg)
    assert cand is None


def test_silent_when_phone_overlaps_but_no_paper() -> None:
    """Don't trigger paper_detected on phone_in_hand-relevant detections."""
    state = TrackState(track_id=1)
    cfg = PaperDetectedConfig()
    phone = _phone()
    cand = None
    for ts in (0.0, 0.5, 1.0, 1.5, 2.0):
        overlap = update_overlap(state, ts=ts, person_bbox=PERSON_BBOX, other_detections=[phone])
        cand = evaluate(state, ts=ts, person_bbox=PERSON_BBOX, overlap_by_class=overlap, cfg=cfg)
    assert cand is None


def test_silent_when_book_below_confidence_threshold() -> None:
    state = TrackState(track_id=1)
    cfg = PaperDetectedConfig(medium_severity_conf=0.50)
    weak_book = _book(conf=0.35)
    cand = None
    for ts in (0.0, 0.5, 1.0, 1.5, 2.0):
        overlap = update_overlap(state, ts=ts, person_bbox=PERSON_BBOX, other_detections=[weak_book])
        cand = evaluate(state, ts=ts, person_bbox=PERSON_BBOX, overlap_by_class=overlap, cfg=cfg)
    assert cand is None


def test_silent_with_only_one_frame_of_book() -> None:
    state = TrackState(track_id=1)
    cfg = PaperDetectedConfig()
    book = _book()
    overlap = update_overlap(state, ts=0.0, person_bbox=PERSON_BBOX, other_detections=[book])
    cand = evaluate(state, ts=0.0, person_bbox=PERSON_BBOX, overlap_by_class=overlap, cfg=cfg)
    assert cand is None


def test_cooldown_blocks_back_to_back_emissions() -> None:
    state = TrackState(track_id=1)
    cfg = PaperDetectedConfig(cooldown_seconds=60.0)
    book = _book()

    # First fire ~ts=2.0
    cand_1 = None
    for ts in (0.0, 0.5, 1.0, 1.5, 2.0):
        overlap = update_overlap(state, ts=ts, person_bbox=PERSON_BBOX, other_detections=[book])
        cand_1 = evaluate(state, ts=ts, person_bbox=PERSON_BBOX, overlap_by_class=overlap, cfg=cfg) or cand_1
    assert cand_1 is not None

    # Within cooldown — silent
    cand_2 = None
    for ts in (3.0, 4.0, 5.0, 6.0):
        overlap = update_overlap(state, ts=ts, person_bbox=PERSON_BBOX, other_detections=[book])
        cand_2 = evaluate(state, ts=ts, person_bbox=PERSON_BBOX, overlap_by_class=overlap, cfg=cfg)
    assert cand_2 is None

    # After cooldown clears — re-emits
    cand_3 = None
    for ts in (70.0, 71.0, 72.0, 73.0):
        overlap = update_overlap(state, ts=ts, person_bbox=PERSON_BBOX, other_detections=[book])
        cand_3 = evaluate(state, ts=ts, person_bbox=PERSON_BBOX, overlap_by_class=overlap, cfg=cfg) or cand_3
    assert cand_3 is not None


def test_book_outside_person_bbox_does_not_overlap() -> None:
    state = TrackState(track_id=1)
    cfg = PaperDetectedConfig()
    far_book = _book(bbox=(0.85, 0.05, 0.95, 0.10))   # completely outside the person bbox
    cand = None
    for ts in (0.0, 0.5, 1.0, 1.5, 2.0):
        overlap = update_overlap(state, ts=ts, person_bbox=PERSON_BBOX, other_detections=[far_book])
        cand = evaluate(state, ts=ts, person_bbox=PERSON_BBOX, overlap_by_class=overlap, cfg=cfg)
    assert cand is None
