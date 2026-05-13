"""Dataset converter — PRD-021 §3 Sprint 14 (BL-260) + PRD-017 §5.2.

Reads a raw bundle from ``data/raw/<source>_<name>/`` and writes a
YOLOv8-format copy under ``data/converted/<name>/``. Three input
formats handled:

  - **coco_json** — Standard COCO `instances.json` + images/ folder.
    Bbox is absolute (x, y, w, h) — converted to YOLO normalized
    (xc, yc, w, h) where each is the bbox-center / image-dim ratio.
  - **pascal_voc** — One XML per image with `<bndbox>` xmin/ymin/xmax/
    ymax. Resolution comes from the `<size>` element.
  - **open_images_csv** — OID's `<split>-annotations-bbox.csv`. XMin /
    XMax / YMin / YMax are already 0..1 normalized so the conversion
    is just rearranging.
  - **yolov5 / yolov8** — passthrough (FiftyOne export already lands
    in YOLO format). Optionally re-maps class IDs via `--class-map`.

The output layout matches PRD-017 §5.2:

    data/converted/<name>/
        data.yaml
        images/{train,val,test}/*.{jpg,png}
        labels/{train,val,test}/*.txt

`data.yaml` is *partial* — it lists the resolved class names and
relative paths but not the absolute root path (merge_datasets.py
fills that in later when it has the final dataset_id).

Usage:

    python -m scripts.convert_dataset \\
        --source data/raw/coco_phone_book/ \\
        --target data/converted/coco_phone_book/ \\
        --format yolov5 \\
        --class-map '{"cell phone": 0, "book": 1}'
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

SUPPORTED_FORMATS = ("coco_json", "pascal_voc", "open_images_csv", "yolov5", "yolov8")


# ───────────────────── helpers ─────────────────────

def _ensure_yolo_layout(target: Path) -> None:
    """Create the YOLO directory skeleton under ``target``."""
    for sub in ("images/train", "images/val", "images/test",
                "labels/train", "labels/val", "labels/test"):
        (target / sub).mkdir(parents=True, exist_ok=True)


def _coco_xywh_to_yolo(
    bbox_xywh_abs: tuple[float, float, float, float],
    img_w: int,
    img_h: int,
) -> tuple[float, float, float, float]:
    """COCO absolute (x,y,w,h) → YOLO normalized (xc,yc,w,h)."""
    x, y, w, h = bbox_xywh_abs
    xc = (x + w / 2.0) / img_w
    yc = (y + h / 2.0) / img_h
    return xc, yc, w / img_w, h / img_h


def _voc_to_yolo(
    bbox_xyxy_abs: tuple[float, float, float, float],
    img_w: int,
    img_h: int,
) -> tuple[float, float, float, float]:
    """Pascal VOC (xmin,ymin,xmax,ymax) → YOLO normalized (xc,yc,w,h)."""
    xmin, ymin, xmax, ymax = bbox_xyxy_abs
    w = xmax - xmin
    h = ymax - ymin
    return ((xmin + w / 2.0) / img_w,
            (ymin + h / 2.0) / img_h,
            w / img_w,
            h / img_h)


# ───────────────────── format-specific converters ────

def convert_coco_json(source: Path, target: Path, class_map: dict[str, int]) -> dict[str, Any]:
    annotations_path = source / "annotations" / "instances.json"
    if not annotations_path.is_file():
        annotations_path = next(source.glob("**/instances*.json"), None)
        if annotations_path is None:
            raise SystemExit(f"no instances*.json under {source}")
    coco = json.loads(annotations_path.read_text(encoding="utf-8"))

    cat_by_id = {c["id"]: c["name"] for c in coco["categories"]}
    img_by_id = {i["id"]: i for i in coco["images"]}

    train_dir = target / "images/train"
    label_dir = target / "labels/train"
    _ensure_yolo_layout(target)

    n_images = 0
    n_anns = 0
    for ann in coco["annotations"]:
        img = img_by_id.get(ann["image_id"])
        if img is None:
            continue
        cls_name = cat_by_id[ann["category_id"]]
        cls_id = class_map.get(cls_name)
        if cls_id is None:
            continue  # class not in our target set
        bbox = _coco_xywh_to_yolo(ann["bbox"], img["width"], img["height"])
        stem = Path(img["file_name"]).stem
        label_file = label_dir / f"{stem}.txt"
        with label_file.open("a", encoding="utf-8") as f:
            f.write(f"{cls_id} {bbox[0]:.6f} {bbox[1]:.6f} {bbox[2]:.6f} {bbox[3]:.6f}\n")
        n_anns += 1

    # Copy images that landed in the labels dir
    for src_img in (source / "images").glob("**/*.jpg"):
        if (label_dir / f"{src_img.stem}.txt").exists():
            shutil.copy2(src_img, train_dir / src_img.name)
            n_images += 1

    return {"images": n_images, "annotations": n_anns}


def convert_pascal_voc(source: Path, target: Path, class_map: dict[str, int]) -> dict[str, Any]:
    import xml.etree.ElementTree as ET

    _ensure_yolo_layout(target)
    train_dir = target / "images/train"
    label_dir = target / "labels/train"

    n_images = 0
    n_anns = 0
    for xml_path in source.glob("**/*.xml"):
        tree = ET.parse(xml_path)
        root = tree.getroot()
        size = root.find("size")
        if size is None:
            continue
        img_w = int(size.findtext("width", "0"))
        img_h = int(size.findtext("height", "0"))
        if img_w == 0 or img_h == 0:
            continue
        stem = xml_path.stem
        lines: list[str] = []
        for obj in root.findall("object"):
            cls_name = obj.findtext("name") or ""
            cls_id = class_map.get(cls_name)
            if cls_id is None:
                continue
            bb = obj.find("bndbox")
            if bb is None:
                continue
            box = (float(bb.findtext("xmin", "0")), float(bb.findtext("ymin", "0")),
                   float(bb.findtext("xmax", "0")), float(bb.findtext("ymax", "0")))
            xc, yc, w, h = _voc_to_yolo(box, img_w, img_h)
            lines.append(f"{cls_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")
            n_anns += 1
        if not lines:
            continue
        (label_dir / f"{stem}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        # Find the matching image (jpg or png next to the xml)
        for ext in (".jpg", ".jpeg", ".png"):
            cand = xml_path.with_suffix(ext)
            if cand.is_file():
                shutil.copy2(cand, train_dir / cand.name)
                n_images += 1
                break

    return {"images": n_images, "annotations": n_anns}


def convert_open_images_csv(source: Path, target: Path, class_map: dict[str, int]) -> dict[str, Any]:
    """Open Images V7 bbox CSV → YOLO. OID coords are already 0..1 normalized."""
    import csv

    _ensure_yolo_layout(target)
    train_dir = target / "images/train"
    label_dir = target / "labels/train"

    # Find the bbox CSV — convention: train-annotations-bbox.csv
    csv_path = next(source.glob("**/*annotations-bbox*.csv"), None)
    if csv_path is None:
        raise SystemExit(f"no *annotations-bbox*.csv under {source}")

    label_by_id_path = next(source.glob("**/class-descriptions*.csv"), None)
    label_lookup: dict[str, str] = {}
    if label_by_id_path is not None:
        with label_by_id_path.open(encoding="utf-8") as f:
            for row in csv.reader(f):
                if len(row) >= 2:
                    label_lookup[row[0]] = row[1]

    n_anns = 0
    written_stems: set[str] = set()
    with csv_path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            label = label_lookup.get(row["LabelName"], row["LabelName"])
            cls_id = class_map.get(label)
            if cls_id is None:
                continue
            xmin, xmax = float(row["XMin"]), float(row["XMax"])
            ymin, ymax = float(row["YMin"]), float(row["YMax"])
            xc = (xmin + xmax) / 2.0
            yc = (ymin + ymax) / 2.0
            w = xmax - xmin
            h = ymax - ymin
            stem = row["ImageID"]
            (label_dir / f"{stem}.txt").open("a", encoding="utf-8").write(
                f"{cls_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n"
            )
            written_stems.add(stem)
            n_anns += 1

    n_images = 0
    for img_path in source.glob("**/images/**/*"):
        if img_path.suffix.lower() in {".jpg", ".jpeg", ".png"} and img_path.stem in written_stems:
            shutil.copy2(img_path, train_dir / img_path.name)
            n_images += 1

    return {"images": n_images, "annotations": n_anns}


def convert_passthrough_yolo(
    source: Path,
    target: Path,
    class_map: dict[str, int],
) -> dict[str, Any]:
    """Roboflow / FiftyOne YOLO export — copy + optionally remap class ids."""
    _ensure_yolo_layout(target)
    n_images = 0
    n_anns = 0

    # Build inverse: original_id -> new_id from a sidecar data.yaml in source.
    # If absent, assume identity mapping (no remap).
    remap: dict[int, int] = {}
    src_yaml = next(source.glob("**/data.yaml"), None)
    if src_yaml is not None and class_map:
        import yaml as _yaml
        spec = _yaml.safe_load(src_yaml.read_text(encoding="utf-8"))
        names_field = spec.get("names", []) or []
        if isinstance(names_field, dict):
            names_field = [names_field[k] for k in sorted(names_field)]
        for i, name in enumerate(names_field):
            new = class_map.get(name)
            if new is not None and new != i:
                remap[i] = new

    for split in ("train", "val", "test"):
        for img in source.glob(f"**/{split}/images/*"):
            if img.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            shutil.copy2(img, target / f"images/{split}" / img.name)
            n_images += 1
        for lbl in source.glob(f"**/{split}/labels/*.txt"):
            content = lbl.read_text(encoding="utf-8")
            if remap:
                lines_out: list[str] = []
                for line in content.splitlines():
                    parts = line.split(maxsplit=1)
                    if not parts:
                        continue
                    cid = int(parts[0])
                    cid_new = remap.get(cid, cid)
                    rest = parts[1] if len(parts) > 1 else ""
                    lines_out.append(f"{cid_new} {rest}".rstrip())
                content = "\n".join(lines_out) + "\n"
            (target / f"labels/{split}" / lbl.name).write_text(content, encoding="utf-8")
            n_anns += sum(1 for _ in content.splitlines() if _.strip())

    return {"images": n_images, "annotations": n_anns}


# ───────────────────── data.yaml writer ───────────

def write_data_yaml(target: Path, class_map: dict[str, int]) -> None:
    import yaml as _yaml

    names = [None] * (max(class_map.values()) + 1)
    for n, i in class_map.items():
        names[i] = n
    payload = {
        "path": "./",
        "train": "images/train",
        "val":   "images/val",
        "test":  "images/test",
        "nc":    len(names),
        "names": {i: n for i, n in enumerate(names)},
    }
    (target / "data.yaml").write_text(
        _yaml.safe_dump(payload, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


# ───────────────────── CLI ─────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert raw datasets to YOLO format (PRD-021 §3 Sprint 14 BL-260)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--source", required=True, type=Path,
                        help="Input directory (data/raw/<name>)")
    parser.add_argument("--target", required=True, type=Path,
                        help="Output directory (data/converted/<name>)")
    parser.add_argument("--format", required=True, choices=SUPPORTED_FORMATS,
                        help="Source annotation format")
    parser.add_argument("--class-map", required=True,
                        help='JSON: {"cell phone": 0, "book": 1}')
    args = parser.parse_args(argv)

    class_map = json.loads(args.class_map)
    if not isinstance(class_map, dict) or not all(isinstance(v, int) for v in class_map.values()):
        parser.error("--class-map must be JSON object mapping class name → int id")

    if not args.source.is_dir():
        parser.error(f"source directory not found: {args.source}")
    args.target.mkdir(parents=True, exist_ok=True)

    log.info("converting %s → %s (%s)", args.source, args.target, args.format)
    if args.format == "coco_json":
        stats = convert_coco_json(args.source, args.target, class_map)
    elif args.format == "pascal_voc":
        stats = convert_pascal_voc(args.source, args.target, class_map)
    elif args.format == "open_images_csv":
        stats = convert_open_images_csv(args.source, args.target, class_map)
    else:  # yolov5 / yolov8
        stats = convert_passthrough_yolo(args.source, args.target, class_map)

    write_data_yaml(args.target, class_map)
    log.info("converted: %s", stats)
    print(json.dumps({"output": str(args.target), **stats}, indent=2))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())
