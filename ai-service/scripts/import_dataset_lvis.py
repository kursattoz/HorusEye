"""LVIS subset importer — PRD-021 §3 Sprint 15 (BL-285).

LVIS shares COCO's image set but adds a far longer tail of categories
(~1200), including ``cellphone``, ``book``, and ``earphone``. We pull
only those three classes to bolster earbuds + phone diversity.

LVIS labels are instance segmentations; FiftyOne's zoo exporter can
emit them as YOLO detections (bbox = mask bounding rect). That's fine
for our object-detection model.

Usage:

    python -m scripts.import_dataset_lvis \\
        --classes     "cellphone,book,earphone" \\
        --max-samples 1000 \\
        --output      data/raw/lvis_phone_book_earphone
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)


def fetch_lvis(
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
        raise SystemExit("`pip install fiftyone` to import from LVIS") from e

    output.mkdir(parents=True, exist_ok=True)
    name = f"lvis_{split}_{int(datetime.now().timestamp())}"
    log.info("loading FiftyOne zoo lvis split=%s classes=%s max_samples=%d",
             split, classes, max_samples)
    ds = foz.load_zoo_dataset(
        "lvis",
        split=split,
        label_types=["detections"],
        classes=classes,
        max_samples=max_samples,
        dataset_name=name,
    )
    ds.export(export_dir=str(output), dataset_type=fo.types.YOLOv5Dataset)
    return {
        "source":          "lvis",
        "split":           split,
        "classes":         classes,
        "max_samples":     max_samples,
        "samples_exported": len(ds),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import LVIS subset (BL-285 fallback augmentation)"
    )
    parser.add_argument("--classes", required=True,
                        help="Comma-separated class names (LVIS taxonomy)")
    parser.add_argument("--max-samples", type=int, default=1000)
    parser.add_argument("--split", default="train")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)

    classes = [c.strip() for c in args.classes.split(",") if c.strip()]
    if not classes:
        parser.error("--classes must list at least one class")

    result = fetch_lvis(
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
