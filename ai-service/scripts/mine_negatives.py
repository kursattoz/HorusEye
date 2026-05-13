"""Negative miner — PRD-021 §3 Sprint 16 (BL-291).

The `paper_notes` class is the trickiest in the Sprint 16 taxonomy:
the model needs to flag *cheat sheets / hidden notes* but NOT trip on
**legitimate paper writing** (notebook open, blank exam paper, pen-on-
paper). False positives here turn into proctor noise.

This script builds a "hard negatives" bundle from public datasets that
contain people writing on paper / desk-with-notebook scenes WITHOUT
cheat-sheet visuals. The negatives go into the merge step as a special
source — the merge writes them with class_id = -1 sentinel (no label,
no bbox) so YOLOv8 learns "this kind of image has no paper_notes
target". PRD-017 §8.4 covers the technique.

Sources scanned for negatives:

  - OID "Pencil" / "Pen" / "Paper" classes — typical "writing on paper"
    pose without cheat sheets.
  - COCO "person" subset where exactly one person is visible reading /
    writing (`activities` filter via FiftyOne).

The output bundle layout:

    data/raw/negatives_legit_paper/
        images/<source>_<idx>.jpg
        labels/<source>_<idx>.txt        ← empty file (no bboxes)
        manifest.json                     ← source, count

Usage:

    python -m scripts.mine_negatives \\
        --pencil-max 800 --paper-max 800 --pen-max 400 \\
        --output     data/raw/negatives_legit_paper/
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


# ───────────────────── source fetch ─────────────────────

def _fetch_oid_class(
    *,
    cls: str,
    max_samples: int,
    work_dir: Path,
) -> Path | None:
    """Pull an OID class subset via FiftyOne, return the raw bundle path."""
    try:
        import fiftyone as fo  # type: ignore[import-not-found]
        import fiftyone.zoo as foz  # type: ignore[import-not-found]
    except ImportError:
        log.warning("fiftyone not installed — skipping OID '%s'", cls)
        return None
    out = work_dir / f"oid_{cls.lower().replace(' ', '_')}"
    out.mkdir(parents=True, exist_ok=True)
    name = f"neg_{cls.replace(' ', '_')}_{int(datetime.now().timestamp())}"
    log.info("loading OID '%s' (max %d) → %s", cls, max_samples, out)
    ds = foz.load_zoo_dataset(
        "open-images-v7",
        split="train",
        label_types=["detections"],
        classes=[cls],
        max_samples=max_samples,
        dataset_name=name,
    )
    ds.export(export_dir=str(out), dataset_type=fo.types.YOLOv5Dataset)
    return out


# ───────────────────── strip into negatives ─────────────────────

def _strip_into_negatives(
    *,
    source_root: Path,
    output_root: Path,
    source_tag:  str,
) -> int:
    """Copy images from source_root into output_root/images/, write empty
    label files into output_root/labels/. Drops bounding-box data — we
    only need the IMAGES as 'this is what a non-cheat-sheet paper scene
    looks like' negatives."""
    img_dir = output_root / "images"
    lbl_dir = output_root / "labels"
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    for img in source_root.rglob("*"):
        if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        # Skip thumbnails / metadata images that aren't the actual data
        if "/labels/" in str(img):
            continue
        target_name = f"{source_tag}_{img.stem}{img.suffix.lower()}"
        shutil.copy2(img, img_dir / target_name)
        (lbl_dir / f"{source_tag}_{img.stem}.txt").write_text("", encoding="utf-8")
        copied += 1
    return copied


# ───────────────────── pipeline ─────────────────────

def mine(
    *,
    output:        Path,
    pencil_max:    int,
    paper_max:     int,
    pen_max:       int,
    work_dir:      Path,
) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    summary: dict[str, Any] = {
        "output":       str(output),
        "mined_at":     datetime.now(timezone.utc).isoformat(),
        "sources":      {},
        "total_copied": 0,
    }

    plan = [
        ("Pencil", pencil_max, "oid_pencil"),
        ("Paper",  paper_max,  "oid_paper"),
        ("Pen",    pen_max,    "oid_pen"),
    ]
    for cls_name, cap, tag in plan:
        if cap <= 0:
            continue
        src = _fetch_oid_class(cls=cls_name, max_samples=cap, work_dir=work_dir)
        if src is None:
            summary["sources"][tag] = {"status": "skipped (fiftyone missing)"}
            continue
        copied = _strip_into_negatives(
            source_root=src,
            output_root=output,
            source_tag=tag,
        )
        summary["sources"][tag] = {"status": "ok", "copied": copied, "from": str(src)}
        summary["total_copied"] += copied

    # Manifest doubles as a sentinel for the merge step — its presence
    # tells merge_datasets.py "this is a negatives-only bundle".
    (output / "manifest.json").write_text(
        json.dumps({**summary, "bundle_kind": "negatives"}, indent=2),
        encoding="utf-8",
    )
    return summary


# ───────────────────── CLI ─────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Mine legit-paper-writing negatives (BL-291)"
    )
    parser.add_argument("--output", required=True, type=Path,
                        help="Negatives bundle output directory")
    parser.add_argument("--pencil-max", type=int, default=800,
                        help="Max OID 'Pencil' samples (default: 800)")
    parser.add_argument("--paper-max",  type=int, default=800,
                        help="Max OID 'Paper' samples (default: 800)")
    parser.add_argument("--pen-max",    type=int, default=400,
                        help="Max OID 'Pen' samples (default: 400)")
    parser.add_argument("--work-dir",   type=Path, default=Path("data/raw/_negatives_scratch"),
                        help="Scratch directory for the OID pulls (default: data/raw/_negatives_scratch)")
    args = parser.parse_args(argv)

    args.work_dir.mkdir(parents=True, exist_ok=True)
    summary = mine(
        output=args.output,
        pencil_max=args.pencil_max,
        paper_max=args.paper_max,
        pen_max=args.pen_max,
        work_dir=args.work_dir,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if summary["total_copied"] > 0 else 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())
