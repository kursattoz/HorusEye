"""TrackState + TrackStore unit tests — BL-183 (PRD-013 §3.2, §7.3)."""

from __future__ import annotations

import pytest

from src.scoring.track_state import (
    DEFAULT_WINDOW_SECONDS,
    TrackState,
    TrackStore,
    bbox_iou,
    bbox_overlap_ratio,
)


def test_add_and_evict_old_samples() -> None:
    st = TrackState(track_id=1, window_seconds=10.0)
    for i in range(5):
        st.add(ts=float(i), person_bbox=(0, 0, 1, 1), overlapping_classes=[])
    assert len(st.samples) == 5

    # Now jump ahead 100s — every old sample should fall out
    st.add(ts=100.0, person_bbox=(0, 0, 1, 1), overlapping_classes=[])
    assert len(st.samples) == 1
    assert st.samples[0].ts == 100.0


def test_sustained_true_when_class_present_for_full_duration() -> None:
    st = TrackState(track_id=1)
    # 4 samples spanning 0..3.0s — "cell phone" present every time
    for i in range(4):
        st.add(ts=float(i), person_bbox=(0, 0, 1, 1), overlapping_classes=["cell phone"])

    assert st.sustained("cell phone", min_seconds=3.0) is True


def test_sustained_false_when_window_too_short() -> None:
    st = TrackState(track_id=1)
    # Only 2s of history — can't be sustained for 3s
    st.add(ts=0.0, person_bbox=(0, 0, 1, 1), overlapping_classes=["cell phone"])
    st.add(ts=2.0, person_bbox=(0, 0, 1, 1), overlapping_classes=["cell phone"])
    assert st.sustained("cell phone", min_seconds=3.0) is False


def test_sustained_false_when_class_missing_at_any_sample() -> None:
    st = TrackState(track_id=1)
    st.add(ts=0.0, person_bbox=(0, 0, 1, 1), overlapping_classes=["cell phone"])
    st.add(ts=1.5, person_bbox=(0, 0, 1, 1), overlapping_classes=[])  # gap
    st.add(ts=3.5, person_bbox=(0, 0, 1, 1), overlapping_classes=["cell phone"])
    assert st.sustained("cell phone", min_seconds=3.0) is False


def test_cooldown_blocks_then_releases() -> None:
    st = TrackState(track_id=1)
    assert st.cooldown_ok("phone_in_hand", 30.0, now=0.0) is True

    st.mark_fired("phone_in_hand", now=10.0)
    assert st.cooldown_ok("phone_in_hand", 30.0, now=20.0) is False  # 10s in
    assert st.cooldown_ok("phone_in_hand", 30.0, now=40.0) is True   # 30s passed


def test_track_state_default_window_is_5_minutes() -> None:
    st = TrackState(track_id=1)
    assert st.window_seconds == DEFAULT_WINDOW_SECONDS == 300.0


def test_track_store_get_or_create_namespacing() -> None:
    store = TrackStore()
    a = store.get_or_create("s1", "c1", 1)
    b = store.get_or_create("s1", "c1", 1)
    c = store.get_or_create("s1", "c2", 1)
    d = store.get_or_create("s2", "c1", 1)

    assert a is b
    assert a is not c
    assert a is not d
    assert len(store) == 3


def test_track_store_gc_drops_stale_tracks() -> None:
    store = TrackStore(ttl_seconds=10.0)
    a = store.get_or_create("s1", "c1", 1)
    b = store.get_or_create("s1", "c1", 2)

    a.add(ts=0.0, person_bbox=(0, 0, 1, 1), overlapping_classes=[])
    b.add(ts=100.0, person_bbox=(0, 0, 1, 1), overlapping_classes=[])

    removed = store.gc(now=105.0)
    assert removed == 1
    assert len(store) == 1


def test_track_store_drop_camera_clears_only_that_camera() -> None:
    store = TrackStore()
    store.get_or_create("s1", "cA", 1)
    store.get_or_create("s1", "cA", 2)
    store.get_or_create("s1", "cB", 3)

    removed = store.drop_camera("s1", "cA")
    assert removed == 2
    assert len(store) == 1


def test_bbox_iou_zero_when_disjoint() -> None:
    assert bbox_iou((0, 0, 1, 1), (2, 2, 3, 3)) == 0.0


def test_bbox_iou_full_when_identical() -> None:
    assert bbox_iou((0, 0, 1, 1), (0, 0, 1, 1)) == pytest.approx(1.0)


def test_bbox_iou_partial_overlap() -> None:
    iou = bbox_iou((0, 0, 2, 2), (1, 1, 3, 3))
    # intersection 1x1=1, union 4+4-1=7, iou 1/7
    assert iou == pytest.approx(1 / 7)


def test_bbox_overlap_ratio_phone_inside_person() -> None:
    person = (0.0, 0.0, 1.0, 1.0)
    phone = (0.4, 0.4, 0.5, 0.5)  # entirely inside person
    # IoU is small (different sizes) but overlap_ratio is 1.0
    assert bbox_overlap_ratio(phone, person) == pytest.approx(1.0)
    assert bbox_iou(phone, person) < 0.1


def test_bbox_overlap_ratio_zero_when_disjoint() -> None:
    assert bbox_overlap_ratio((0, 0, 0.1, 0.1), (0.5, 0.5, 1, 1)) == 0.0
