"""BL-277 filter_headphones_in_ear — heuristic + I/O coverage.

The CLIP backend needs open_clip + torch + a few hundred MB of weights,
so we skip the CLIP-specific cases here and just verify (a) the bbox
heuristic discriminates correctly, and (b) split() correctly routes a
fake bundle into in_ear/ vs over_ear/ buckets.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.filter_headphones_in_ear import heuristic_in_ear, split


# ───────────────────────── heuristic ─────────────────────────

def test_heuristic_small_square_bbox_is_in_ear() -> None:
    # 1% area, square aspect — classic earbud, well under 3% cap.
    in_ear, _ = heuristic_in_ear((0, 0.5, 0.5, 0.1, 0.1), 640, 640)
    assert in_ear is True
    # 0.25% area, square — also clearly in-ear.
    in_ear, _ = heuristic_in_ear((0, 0.5, 0.5, 0.05, 0.05), 640, 640)
    assert in_ear is True


def test_heuristic_large_bbox_is_over_ear() -> None:
    # 12% area — over-ear cans dominate the frame
    in_ear, _ = heuristic_in_ear((0, 0.5, 0.5, 0.4, 0.3), 640, 640)
    assert in_ear is False


def test_heuristic_wide_aspect_is_over_ear() -> None:
    # Wide aspect (over-ear band) → reject even if area is small
    in_ear, _ = heuristic_in_ear((0, 0.5, 0.5, 0.15, 0.05), 640, 640)
    assert in_ear is False


# ───────────────────────── split() integration ─────────────────────────

def _make_bundle(root: Path, samples: list[tuple[str, float, float]]) -> None:
    """samples = [(name, bbox_w, bbox_h)] all centered at (0.5, 0.5)."""
    from PIL import Image
    img_dir = root / "train" / "images"
    lbl_dir = root / "train" / "labels"
    img_dir.mkdir(parents=True)
    lbl_dir.mkdir(parents=True)
    for name, bw, bh in samples:
        Image.new("RGB", (640, 640), (100, 100, 100)).save(img_dir / f"{name}.jpg", "JPEG")
        (lbl_dir / f"{name}.txt").write_text(f"0 0.5 0.5 {bw} {bh}\n", encoding="utf-8")


def test_split_routes_into_in_ear_and_over_ear(tmp_path: Path) -> None:
    pytest.importorskip("PIL")
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    _make_bundle(src, [
        ("tiny_a", 0.04, 0.04),   # in-ear
        ("tiny_b", 0.03, 0.03),   # in-ear
        ("big_a",  0.30, 0.20),   # over-ear
        ("wide",   0.20, 0.05),   # over-ear (wide aspect)
    ])

    stats = split(src, dst, backend="bbox_ratio")
    assert stats["total"]    == 4
    assert stats["in_ear"]   == 2
    assert stats["over_ear"] == 2

    in_ear_imgs = list((dst / "in_ear" / "images").iterdir())
    over_ear_imgs = list((dst / "over_ear" / "images").iterdir())
    assert {p.stem for p in in_ear_imgs}    == {"tiny_a", "tiny_b"}
    assert {p.stem for p in over_ear_imgs}  == {"big_a", "wide"}

    # Labels are copied alongside images
    assert (dst / "in_ear"   / "labels" / "tiny_a.txt").is_file()
    assert (dst / "over_ear" / "labels" / "big_a.txt").is_file()
