"""Objects365 subset importer — PRD-021 §3 Sprint 15 (BL-285).

FiftyOne's zoo includes Objects365 v2 (365 categories, including "Cell
phone", "Book", "Watch"). This script wraps the zoo loader with the
class-filter pattern from scripts.import_dataset.

Why a separate script (vs. extending import_dataset.py)? Objects365
needs the COCO-format loader which behaves differently from the
yolov5 export the OID + COCO scripts already use. Splitting it avoids
plumbing two contradictory export modes into one CLI.

Usage:

    python -m scripts.import_dataset_objects365 \\
        --classes     "Cell phone,Book,Watch" \\
        --max-samples 1000 \\
        --output      data/raw/objects365_phone_book_watch
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)


def fetch_objects365(
    *,
    classes: list[str],
    max_samples: int,
    output: Path,
    split: str = "train",
) -> dict[str, object]:
    try:
        import fiftyone as fo  # type: ignore[import-not-found]
        import fiftyone.zoo as foz  # type: ignore[import-not-found]
    except ImportError as e:
        raise SystemExit("`pip install fiftyone` to import from Objects365") from e

    output.mkdir(parents=True, exist_ok=True)
    name = f"objects365_{split}_{int(datetime.now().timestamp())}"
    log.info("loading FiftyOne zoo objects365-v2 split=%s classes=%s max_samples=%d",
             split, classes, max_samples)
    ds = foz.load_zoo_dataset(
        "objects365-v2",
        split=split,
        label_types=["detections"],
        classes=classes,
        max_samples=max_samples,
        dataset_name=name,
    )
    ds.export(export_dir=str(output), dataset_type=fo.types.YOLOv5Dataset)
    return {
        "source":          "objects365-v2",
        "split":           split,
        "classes":         classes,
        "max_samples":     max_samples,
        "samples_exported": len(ds),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import Objects365 v2 subset (BL-285 fallback augmentation)"
    )
    parser.add_argument("--classes", required=True,
                        help="Comma-separated class names (Objects365 taxonomy)")
    parser.add_argument("--max-samples", type=int, default=1000,
                        help="Cap on samples per split")
    parser.add_argument("--split", default="train",
                        help="train | validation (default: train)")
    parser.add_argument("--output", required=True, type=Path,
                        help="Output directory (created if missing)")
    args = parser.parse_args(argv)

    classes = [c.strip() for c in args.classes.split(",") if c.strip()]
    if not classes:
        parser.error("--classes must list at least one class")

    result = fetch_objects365(
        classes=classes,
        max_samples=args.max_samples,
        output=args.output,
        split=args.split,
    )
    (args.output / "dataset_meta.json").write_text(
        json.dumps(
            {**result, "imported_at": datetime.now(timezone.utc).isoformat()},
            indent=2, ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())
