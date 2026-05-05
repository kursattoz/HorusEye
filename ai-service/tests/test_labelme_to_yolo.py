"""labelme_to_yolo converter tests — BL-212."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.labelme_to_yolo import (
    _convert_box,
    _split_for,
    convert_one,
    run,
    write_data_yaml,
)


# ───────── geometry helpers ─────────

def test_convert_box_returns_normalized_yolo_format() -> None:
    # 1000x800 image, rectangle from (200,100) to (400,300)
    cx, cy, w, h = _convert_box([[200, 100], [400, 300]], 1000, 800)
    assert cx == pytest.approx(0.30)
    assert cy == pytest.approx(0.25)
    assert w  == pytest.approx(0.20)
    assert h  == pytest.approx(0.25)


def test_convert_box_zero_dim_returns_none() -> None:
    assert _convert_box([[100, 100], [100, 100]], 500, 500) is None
    assert _convert_box([[100, 100], [200, 200]], 0, 500) is None


def test_split_for_is_deterministic() -> None:
    name = "abc.jpg"
    splits = {_split_for(name) for _ in range(50)}
    assert len(splits) == 1


def test_split_for_distributes_three_classes() -> None:
    splits = {_split_for(f"img-{i}.jpg") for i in range(200)}
    assert splits == {"train", "val", "test"}


# ───────── convert_one ─────────

def _write_pair(tmp_path: Path, name: str, w: int, h: int, boxes: list[dict]) -> Path:
    img = tmp_path / f"{name}.jpg"
    img.write_bytes(b"\xff\xd8\xff\xe0FAKE")  # JPEG magic + filler
    js = tmp_path / f"{name}.json"
    js.write_text(json.dumps({
        "imagePath":   img.name,
        "imageWidth":  w,
        "imageHeight": h,
        "shapes":      boxes,
    }), encoding="utf-8")
    return js


def test_convert_one_writes_image_and_label(tmp_path: Path) -> None:
    in_dir = tmp_path / "raw"
    in_dir.mkdir()
    out = tmp_path / "yolo"
    js = _write_pair(in_dir, "lighting1_001", 1000, 800, [
        {"label": "earbuds", "shape_type": "rectangle", "points": [[200, 100], [400, 300]]},
    ])

    assert convert_one(js, out, classes=["earbuds"]) is True

    # Image + label landed in the same split
    expected_split = _split_for("lighting1_001.jpg")
    assert (out / "images" / expected_split / "lighting1_001.jpg").exists()
    label = (out / "labels" / expected_split / "lighting1_001.txt").read_text()
    assert label.startswith("0 ")  # class index 0 = earbuds


def test_convert_one_skips_unknown_class(tmp_path: Path) -> None:
    in_dir = tmp_path / "raw"
    in_dir.mkdir()
    out = tmp_path / "yolo"
    js = _write_pair(in_dir, "x", 100, 100, [
        {"label": "headphones", "shape_type": "rectangle", "points": [[10, 10], [50, 50]]},
    ])
    convert_one(js, out, classes=["earbuds"])
    label_files = list((out / "labels").rglob("*.txt"))
    # Empty txt — no recognized class
    assert all(p.read_text() == "" for p in label_files)


def test_convert_one_missing_image_returns_false(tmp_path: Path) -> None:
    in_dir = tmp_path / "raw"
    in_dir.mkdir()
    js = in_dir / "orphan.json"
    js.write_text(json.dumps({
        "imagePath":   "missing.jpg",
        "imageWidth":  100,
        "imageHeight": 100,
        "shapes":      [],
    }))
    assert convert_one(js, tmp_path / "out", classes=["earbuds"]) is False


# ───────── data.yaml + run ─────────

def test_write_data_yaml(tmp_path: Path) -> None:
    write_data_yaml(tmp_path, ["earbuds"])
    body = (tmp_path / "data.yaml").read_text()
    assert "nc: 1" in body
    assert "0: earbuds" in body


def test_run_returns_1_when_no_json_files(tmp_path: Path) -> None:
    (tmp_path / "raw").mkdir()
    rc = run(tmp_path / "raw", tmp_path / "out", ["earbuds"])
    assert rc == 1


def test_run_happy_path(tmp_path: Path) -> None:
    in_dir = tmp_path / "raw"
    in_dir.mkdir()
    _write_pair(in_dir, "frame_a", 200, 200, [
        {"label": "earbuds", "shape_type": "rectangle", "points": [[10, 10], [60, 60]]},
    ])
    _write_pair(in_dir, "frame_b", 200, 200, [
        {"label": "earbuds", "shape_type": "rectangle", "points": [[100, 100], [180, 180]]},
    ])

    out = tmp_path / "yolo"
    rc = run(in_dir, out, ["earbuds"])
    assert rc == 0
    yaml_path = out / "data.yaml"
    assert yaml_path.exists()
    assert "nc: 1" in yaml_path.read_text()
