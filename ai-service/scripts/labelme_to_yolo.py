"""labelme → YOLO format converter — BL-212.

Reads a directory of paired ``*.jpg`` + ``*.json`` files (labelme
rectangle annotations) and emits an ultralytics YOLO dataset
underneath ``--out``:

    out/
      images/{train,val,test}/*.jpg
      labels/{train,val,test}/*.txt   # one line per box: cls cx cy w h (normalized)
      data.yaml

Splits 80/10/10 deterministically by filename hash so re-running on
the same input produces the same partition.

Usage:

    python -m scripts.labelme_to_yolo \\
        --in  ai-service/test-data/earbuds/raw \\
        --out ai-service/test-data/earbuds/yolo \\
        --classes earbuds
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import shutil
import sys
from pathlib import Path
from typing import Iterable

log = logging.getLogger("labelme_to_yolo")


def _split_for(name: str) -> str:
    """Deterministic 80/10/10 split via stable hash of filename."""
    h = int(hashlib.md5(name.encode("utf-8")).hexdigest(), 16) % 100
    if h < 80:
        return "train"
    if h < 90:
        return "val"
    return "test"


def _convert_box(
    points: list[list[float]],
    img_w: int,
    img_h: int,
) -> tuple[float, float, float, float] | None:
    """Convert a labelme rectangle (two corner points) → YOLO cx cy w h."""
    if len(points) < 2 or img_w <= 0 or img_h <= 0:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    cx = (x_min + x_max) / 2 / img_w
    cy = (y_min + y_max) / 2 / img_h
    w = (x_max - x_min) / img_w
    h = (y_max - y_min) / img_h
    if w <= 0 or h <= 0:
        return None
    return (cx, cy, w, h)


def convert_one(
    json_path: Path,
    out_root: Path,
    classes: list[str],
) -> bool:
    """Convert one labelme json + matching image. Returns True on success."""
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001 — defensive: hand-edited json may be invalid
        log.warning("skip %s: cannot parse json (%s)", json_path.name, e)
        return False

    img_name = data.get("imagePath") or json_path.with_suffix(".jpg").name
    img_path = (json_path.parent / img_name).resolve()
    if not img_path.is_file():
        log.warning("skip %s: image %s not found", json_path.name, img_path)
        return False

    img_w = int(data.get("imageWidth", 0))
    img_h = int(data.get("imageHeight", 0))
    if img_w <= 0 or img_h <= 0:
        log.warning("skip %s: missing image dimensions", json_path.name)
        return False

    lines: list[str] = []
    for shape in data.get("shapes", []):
        label = shape.get("label")
        if label not in classes:
            continue
        if shape.get("shape_type", "rectangle") != "rectangle":
            continue
        bbox = _convert_box(shape.get("points", []), img_w, img_h)
        if bbox is None:
            continue
        cls_idx = classes.index(label)
        lines.append(f"{cls_idx} {bbox[0]:.6f} {bbox[1]:.6f} {bbox[2]:.6f} {bbox[3]:.6f}")

    if not lines:
        # Negative samples (no class instance) still useful — emit empty .txt
        log.debug("%s has no boxes", json_path.name)

    split = _split_for(img_path.name)
    img_dst = out_root / "images" / split / img_path.name
    lbl_dst = out_root / "labels" / split / (img_path.stem + ".txt")
    img_dst.parent.mkdir(parents=True, exist_ok=True)
    lbl_dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(img_path, img_dst)
    lbl_dst.write_text("\n".join(lines), encoding="utf-8")
    return True


def write_data_yaml(out_root: Path, classes: list[str]) -> None:
    body = (
        f"path: {out_root.as_posix()}\n"
        "train: images/train\n"
        "val: images/val\n"
        "test: images/test\n"
        f"nc: {len(classes)}\n"
        "names:\n"
        + "".join(f"  {i}: {c}\n" for i, c in enumerate(classes))
    )
    (out_root / "data.yaml").write_text(body, encoding="utf-8")


def run(in_dir: Path, out_dir: Path, classes: list[str]) -> int:
    if not in_dir.is_dir():
        log.error("input dir not found: %s", in_dir)
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)

    json_files = sorted(in_dir.glob("*.json"))
    if not json_files:
        log.error("no labelme .json files under %s", in_dir)
        return 1

    converted = 0
    for jp in json_files:
        if convert_one(jp, out_dir, classes):
            converted += 1

    write_data_yaml(out_dir, classes)
    log.info("converted %d/%d files → %s", converted, len(json_files), out_dir)
    return 0 if converted > 0 else 1


def main(argv: Iterable[str]) -> int:
    parser = argparse.ArgumentParser(description="labelme → YOLO converter")
    parser.add_argument("--in",      dest="in_dir",  required=True, type=Path)
    parser.add_argument("--out",     dest="out_dir", required=True, type=Path)
    parser.add_argument("--classes", nargs="+", required=True,
                        help="Ordered class names (index 0 = first)")
    args = parser.parse_args(list(argv))
    return run(args.in_dir, args.out_dir, args.classes)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main(sys.argv[1:]))
